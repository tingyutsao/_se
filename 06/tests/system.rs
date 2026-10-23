//! 系統測試:驗證 web API 的完整行為(路由 → 驗證 → 儲存 → 回應)。
//!
//! 不需要真的啟動 TCP server:用 tower 的 `oneshot` 把 `http::Request`
//! 直接送進組好的 axum `Router`,這樣每個測試都是獨立、快速且可重現的。

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt; // 提供 oneshot()

use todo_server::routes;

/// 每個測試都建一個全新的 app,狀態互不干擾
fn app() -> Router {
    routes::api_routes().with_state(routes::shared_store())
}

fn json_req(method: &str, uri: &str, body: Option<Value>) -> Request<Body> {
    let builder = Request::builder().method(method).uri(uri);
    match body {
        Some(v) => builder
            .header("content-type", "application/json")
            .body(Body::from(v.to_string()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    }
}

/// 發送請求並回傳 (狀態碼, 解析後的 JSON;空 body 回 Value::Null)
async fn send(app: Router, req: Request<Body>) -> (StatusCode, Value) {
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("回應應該是合法 JSON")
    };
    (status, json)
}

// ---- 讀取清單 ----

#[tokio::test]
async fn 一開始清單是空的() {
    let (status, body) = send(app(), json_req("GET", "/api/todos", None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));
}

// ---- 新增 ----

#[tokio::test]
async fn 新增成功回201和完整body() {
    let (status, body) =
        send(app(), json_req("POST", "/api/todos", Some(json!({"title": "買牛奶"})))).await;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body, json!({"id": 1, "title": "買牛奶", "done": false}));
}

#[tokio::test]
async fn 新增後再讀清單看得到那一筆() {
    let app = app();
    send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "寫系統測試"})))).await;

    let (status, body) = send(app, json_req("GET", "/api/todos", None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([{"id": 1, "title": "寫系統測試", "done": false}]));
}

#[tokio::test]
async fn 新增多筆id不重複() {
    let app = app();
    let (_, a) =
        send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "A"})))).await;
    let (_, b) =
        send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "B"})))).await;

    assert_ne!(a["id"], b["id"]);
}

#[tokio::test]
async fn 新增空白標題回400和錯誤訊息() {
    for title in ["", "   "] {
        let (status, body) =
            send(app(), json_req("POST", "/api/todos", Some(json!({ "title": title })))).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("不可為空"));
    }
}

#[tokio::test]
async fn 新增太長的標題回400() {
    let too_long = "a".repeat(todo_server::store::MAX_TITLE_LEN + 1);
    let (status, _) =
        send(app(), json_req("POST", "/api/todos", Some(json!({ "title": too_long })))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---- 切換完成狀態 ----

#[tokio::test]
async fn toggle會把done轉成正確狀態() {
    let app = app();
    send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "測試"})))).await;

    let (status, body) = send(app.clone(), json_req("PATCH", "/api/todos/1", None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["done"], json!(true));

    let (_, body) = send(app.clone(), json_req("PATCH", "/api/todos/1", None)).await;
    assert_eq!(body["done"], json!(false));
}

#[tokio::test]
async fn toggle不存在的id回404() {
    let (status, _) = send(app(), json_req("PATCH", "/api/todos/123", None)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---- 刪除 ----

#[tokio::test]
async fn 刪除成功回204且清單變空() {
    let app = app();
    send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "會被刪掉"})))).await;

    let (status, _) = send(app.clone(), json_req("DELETE", "/api/todos/1", None)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, body) = send(app, json_req("GET", "/api/todos", None)).await;
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn 刪除只刪指定的那一筆() {
    let app = app();
    send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "A"})))).await;
    send(app.clone(), json_req("POST", "/api/todos", Some(json!({"title": "B"})))).await;

    send(app.clone(), json_req("DELETE", "/api/todos/1", None)).await;
    let (_, body) = send(app, json_req("GET", "/api/todos", None)).await;

    assert_eq!(
        body,
        json!([{"id": 2, "title": "B", "done": false}])
    );
}

#[tokio::test]
async fn 刪除不存在的id回404() {
    let (status, _) = send(app(), json_req("DELETE", "/api/todos/99", None)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
