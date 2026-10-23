//! 待辦事項的資料模型與狀態儲存(純邏輯,不含任何 HTTP 程式碼)。
//!
//! 這一層是「單元測試」的對象:不需要啟動 server 就能直接測。

use serde::{Deserialize, Serialize};

/// 標題長度上限(字元數)
pub const MAX_TITLE_LEN: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Todo {
    pub id: u64,
    pub title: String,
    pub done: bool,
}

/// 新增待辦時可能發生的錯誤
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddError {
    /// 標題是空的(或只有空白)
    EmptyTitle,
    /// 標題太長
    TooLong { max: usize },
}

/// 以「一條 Vec」為基礎的簡單記憶體儲存。
#[derive(Debug, Default)]
pub struct Store {
    next_id: u64,
    todos: Vec<Todo>,
}

impl Store {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn list(&self) -> &[Todo] {
        &self.todos
    }

    /// 新增一筆待辦。標題會先去頭尾空白,空標題/太長標題會被拒絕。
    pub fn add(&mut self, title: &str) -> Result<Todo, AddError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(AddError::EmptyTitle);
        }
        if title.chars().count() > MAX_TITLE_LEN {
            return Err(AddError::TooLong { max: MAX_TITLE_LEN });
        }

        self.next_id += 1;
        let todo = Todo {
            id: self.next_id,
            title: title.to_string(),
            done: false,
        };
        self.todos.push(todo.clone());
        Ok(todo)
    }

    /// 切換完成狀態;找不到 id 時回 None。
    pub fn toggle(&mut self, id: u64) -> Option<Todo> {
        let todo = self.todos.iter_mut().find(|t| t.id == id)?;
        todo.done = !todo.done;
        Some(todo.clone())
    }

    /// 刪除待辦;有刪掉回 true,找不到回 false。
    pub fn delete(&mut self, id: u64) -> bool {
        let before = self.todos.len();
        self.todos.retain(|t| t.id != id);
        self.todos.len() != before
    }
}

#[cfg(test)]
mod tests {
    #![allow(non_snake_case)] // 測試名稱用中文,允許非 snake_case

    use super::*;

    // ---- 新增 ----

    #[test]
    fn 新建的store是空的() {
        let store = Store::new();
        assert!(store.list().is_empty());
    }

    #[test]
    fn 新增會給遞增的id_初始未完成() {
        let mut store = Store::new();
        let a = store.add("買牛奶").unwrap();
        let b = store.add("寫單元測試").unwrap();

        assert_eq!(a.id, 1);
        assert_eq!(b.id, 2);
        assert_eq!((a.done, b.done), (false, false));
        assert_eq!(store.list().len(), 2);
    }

    #[test]
    fn 新增會去掉頭尾空白() {
        let mut store = Store::new();
        let todo = store.add("  有空白喔  ").unwrap();
        assert_eq!(todo.title, "有空白喔");
    }

    #[test]
    fn 空標題被拒絕() {
        let mut store = Store::new();
        assert_eq!(store.add(""), Err(AddError::EmptyTitle));
        assert!(store.list().is_empty());
    }

    #[test]
    fn 只有空白的標題也被拒絕() {
        let mut store = Store::new();
        assert_eq!(store.add("   "), Err(AddError::EmptyTitle));
        assert!(store.list().is_empty());
    }

    #[test]
    fn 太長的標題被拒絕() {
        let mut store = Store::new();
        let too_long = "a".repeat(MAX_TITLE_LEN + 1);
        assert_eq!(
            store.add(&too_long),
            Err(AddError::TooLong { max: MAX_TITLE_LEN })
        );
        // 剛好在上限內是合法的
        assert!(store.add(&"a".repeat(MAX_TITLE_LEN)).is_ok());
    }

    #[test]
    fn 中文標題用字元數計算長度() {
        let mut store = Store::new();
        // 中文字一個字也可能佔多個 byte,這裡應該用「字元數」判斷
        let ok = "中".repeat(MAX_TITLE_LEN);
        let too_long = "中".repeat(MAX_TITLE_LEN + 1);
        assert!(store.add(&ok).is_ok());
        assert!(store.add(&too_long).is_err());
    }

    // ---- 切換完成狀態 ----

    #[test]
    fn toggle會把未完成變成已完成() {
        let mut store = Store::new();
        let todo = store.add("測試").unwrap();

        let toggled = store.toggle(todo.id).unwrap();
        assert!(toggled.done);
        assert!(store.list()[0].done);
    }

    #[test]
    fn toggle兩次會還原() {
        let mut store = Store::new();
        let todo = store.add("測試").unwrap();

        assert!(store.toggle(todo.id).unwrap().done);
        assert!(!store.toggle(todo.id).unwrap().done);
    }

    #[test]
    fn toggle不存在的id回None() {
        let mut store = Store::new();
        assert!(store.toggle(999).is_none());
    }

    #[test]
    fn toggle不會弄錯別筆資料() {
        let mut store = Store::new();
        let _a = store.add("A").unwrap();
        let b = store.add("B").unwrap();

        store.toggle(b.id).unwrap();
        assert!(!store.list()[0].done);
        assert!(store.list()[1].done);
    }

    // ---- 刪除 ----

    #[test]
    fn 刪除存在的id回true並真的刪掉() {
        let mut store = Store::new();
        let a = store.add("A").unwrap();
        let _b = store.add("B").unwrap();

        assert!(store.delete(a.id));
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.list()[0].title, "B");
    }

    #[test]
    fn 刪除不存在的id回false且清單不變() {
        let mut store = Store::new();
        let _a = store.add("A").unwrap();

        assert!(!store.delete(42));
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn 刪除後新增的id不會重複() {
        let mut store = Store::new();
        let a = store.add("A").unwrap();
        store.delete(a.id);
        let c = store.add("C").unwrap();
        assert_eq!(c.id, 2); // next_id 一直遞增,不會退回
    }
}
