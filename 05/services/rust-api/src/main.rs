// =============================================================================
//  rust-api —— 只用 Rust 標準函式庫實作的極輕量 HTTP 服務
// -----------------------------------------------------------------------------
//  為什麼不用 axum / actix-web？
//  這個服務的目的之一是展示「零第三方依賴」的映像檔：
//    * cargo 不需要連 crates.io，建置可離線完成
//    * 執行階段映像檔只有一個靜態二進位檔（+ glibc），體積非常小
//
//  端點：
//    GET /health        健康檢查（也支援 `--health` 參數，讓 Docker HEALTHCHECK 用）
//    GET /info          服務 / 編譯資訊
//    GET /              端點清單
// =============================================================================

use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// 已處理的 GET 請求數（跨執行緒共用）
static HANDLED_REQUESTS: AtomicU64 = AtomicU64::new(0);

const SERVICE_NAME: &str = "rust-api";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

struct AppState {
    started: Instant,
    started_unix: u64,
    hostname: String,
}

/// 把字串轉成安全的 JSON 字串（含引號）
fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn uptime(state: &AppState) -> f64 {
    state.started.elapsed().as_secs_f64()
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn health_body(state: &AppState) -> String {
    format!(
        r#"{{"status":"ok","service":"{service}","uptime_seconds":{uptime:.3}}}"#,
        service = SERVICE_NAME,
        uptime = uptime(state)
    )
}

fn info_body(state: &AppState) -> String {
    let rustc_version = option_env!("RUSTC_VERSION").unwrap_or("stable");
    format!(
        concat!(
            r#"{{"service":"{service}","language":"Rust","runtime":"rustc {rustc}","#,
            r#""edition":"2021","framework":"std::net（零第三方依賴）","#,
            r#""app_version":"{version}","hostname":{hostname},"#,
            r#""platform":"{os}/{arch}","cpu_count":{cpu},"pid":{pid},"#,
            r#""started_at_unix":{started},"uptime_seconds":{uptime:.3},"#,
            r#""handled_requests":{requests},"#,
            r#""database":{{"connected":false,"note":"此服務為無狀態，不連資料庫"}}}}"#
        ),
        service = SERVICE_NAME,
        rustc = rustc_version,
        version = APP_VERSION,
        hostname = json_string(&state.hostname),
        os = env::consts::OS,
        arch = env::consts::ARCH,
        cpu = thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        pid = process::id(),
        started = state.started_unix,
        uptime = uptime(state),
        requests = HANDLED_REQUESTS.load(Ordering::Relaxed),
    )
}

/// 依照 method / path 產生回應（狀態碼, 內容）
fn route(method: &str, path: &str, state: &AppState) -> (u16, String) {
    let path = path.split('?').next().unwrap_or("/");
    match (method, path) {
        ("GET" | "HEAD", "/health") => (200, health_body(state)),
        ("GET" | "HEAD", "/info") => (200, info_body(state)),
        ("GET" | "HEAD", "/") => (200, String::from(ROUTES)),
        _ => (
            404,
            format!(
                r#"{{"error":"not_found","path":{},"service":"{service}"}}"#,
                json_string(path),
                service = SERVICE_NAME
            ),
        ),
    }
}

const ROUTES: &str = concat!(
    r#"{"service":"rust-api","language":"Rust","endpoints":["#,
    r#""GET /health","GET /info","GET /""#,
    r#"],"note":"原始碼位於 services/rust-api/src/main.rs"}"#
);

fn handle_connection(mut stream: TcpStream, state: Arc<AppState>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut reader = match stream.try_clone() {
        Ok(clone) => BufReader::new(clone),
        Err(_) => return,
    };

    // 讀取請求行（第一行）
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }

    // 讀完所有標頭（直到空行）
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) if line == "\r\n" || line == "\n" => break,
            Ok(_) => continue,
            Err(_) => break,
        }
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_uppercase();
    let path = parts.next().unwrap_or("/").to_string();

    if method == "GET" {
        HANDLED_REQUESTS.fetch_add(1, Ordering::Relaxed);
    }

    let (status, body) = route(&method, &path, &state);
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Error",
    };

    let header = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {len}\r\n\
         Connection: close\r\n\
         Cache-Control: no-store\r\n\
         X-Powered-By: rust-std\r\n\r\n",
        len = body.len()
    );

    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

/// Docker HEALTHCHECK 模式：連線自己並檢查 /health 是否回 200
fn healthcheck() -> i32 {
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("127.0.0.1:{port}");
    let mut stream = match TcpStream::connect(&addr) {
        Ok(s) => s,
        Err(_) => return 1,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let request = "GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return 1;
    }
    let mut response = String::new();
    if BufReader::new(stream).read_to_string(&mut response).is_err() {
        return 1;
    }
    if response.starts_with("HTTP/1.1 200") {
        0
    } else {
        1
    }
}

fn main() {
    // `rust-api --health` 供 Docker HEALTHCHECK 使用
    if env::args().any(|arg| arg == "--health") {
        process::exit(healthcheck());
    }

    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let bind = format!("0.0.0.0:{port}");

    let hostname = env::var("HOSTNAME")
        .ok()
        .or_else(|| fs::read_to_string("/etc/hostname").ok().map(|s| s.trim().to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let state = Arc::new(AppState {
        started: Instant::now(),
        started_unix: now_unix(),
        hostname,
    });

    let listener = match TcpListener::bind(&bind) {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("[{SERVICE_NAME}] 無法綁定 {bind}：{err}");
            process::exit(1);
        }
    };

    println!(
        "[{SERVICE_NAME}] 已啟動，監聽 {bind}（版本 {APP_VERSION}，{}/{}）",
        env::consts::OS,
        env::consts::ARCH
    );

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let state = Arc::clone(&state);
                // 每個連線一個執行緒：示範用，正式環境建議使用 thread pool 或 async
                thread::spawn(move || handle_connection(stream, state));
            }
            Err(err) => eprintln!("[{SERVICE_NAME}] 連線失敗：{err}"),
        }
    }
}
