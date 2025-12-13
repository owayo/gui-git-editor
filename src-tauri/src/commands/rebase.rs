use crate::error::AppError;
use crate::parser::{
    parse_rebase_todo as parse_todo, serialize_rebase_todo as serialize_todo, RebaseTodoFile,
};

/// Parse git-rebase-todo content
#[tauri::command]
pub fn parse_rebase_todo(content: String) -> Result<RebaseTodoFile, AppError> {
    parse_todo(&content)
}

/// Serialize RebaseTodoFile to git-rebase-todo format
#[tauri::command]
pub fn serialize_rebase_todo(file: RebaseTodoFile) -> String {
    serialize_todo(&file)
}
