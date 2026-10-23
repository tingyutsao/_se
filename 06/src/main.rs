//! 啟動 server:掛上 /api 路由,其餘路徑服務 public/ 底下的靜態檔案。

use tower_http::services::ServeDir;
use todo_server::routes;

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let app = routes::api_routes()
        .with_state(routes::shared_store())
        .fallback_service(ServeDir::new("public").append_index_html_on_directories(true));

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .unwrap_or_else(|e| panic!("無法綁定 port {port}: {e}"));

    println!("待辦清單 server 已啟動: http://localhost:{port}");
    axum::serve(listener, app).await.unwrap();
}
