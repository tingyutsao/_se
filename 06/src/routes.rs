//! axum 路由層:把 HTTP 請求轉成對 [`crate::store::Store`] 的操作。

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::store::{AddError, Store, Todo};

/// 全域共享的儲存狀態(以 Mutex 保護)
pub type SharedStore = Arc<Mutex<Store>>;

pub fn shared_store() -> SharedStore {
    Arc::new(Mutex::new(Store::new()))
}

#[derive(Deserialize)]
struct CreateTodo {
    title: String,
}

#[derive(Serialize)]
struct ApiError {
    error: String,
}

impl ApiError {
    fn new<S: Into<String>>(error: S) -> Self {
        Self { error: error.into() }
    }
}

async fn list_todos(State(state): State<SharedStore>) -> Json<Vec<Todo>> {
    let store = state.lock().unwrap();
    Json(store.list().to_vec())
}

async fn create_todo(
    State(state): State<SharedStore>,
    Json(body): Json<CreateTodo>,
) -> impl IntoResponse {
    let result = state.lock().unwrap().add(&body.title);

    match result {
        Ok(todo) => (StatusCode::CREATED, Json(todo).into_response()).into_response(),
        Err(AddError::EmptyTitle) => (
            StatusCode::BAD_REQUEST,
            Json(ApiError::new("標題不可為空")),
        )
            .into_response(),
        Err(AddError::TooLong { max }) => (
            StatusCode::BAD_REQUEST,
            Json(ApiError::new(format!("標題長度上限 {max} 字"))),
        )
            .into_response(),
    }
}

async fn toggle_todo(
    State(state): State<SharedStore>,
    Path(id): Path<u64>,
) -> Result<Json<Todo>, StatusCode> {
    state
        .lock()
        .unwrap()
        .toggle(id)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn delete_todo(
    State(state): State<SharedStore>,
    Path(id): Path<u64>,
) -> StatusCode {
    if state.lock().unwrap().delete(id) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

/// 組出 web API 的路由(型別仍帶 State,方便在測試或 main 重複使用)
pub fn api_routes() -> Router<SharedStore> {
    Router::new()
        .route("/api/todos", get(list_todos).post(create_todo))
        .route("/api/todos/{id}", patch(toggle_todo).delete(delete_todo))
}
