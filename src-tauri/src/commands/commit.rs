//! コミットメッセージの解析・シリアライズ用 Tauri コマンド。

use crate::error::AppError;
use crate::parser::commit::{self, CommitMessage};

/// コミットメッセージ本文を構造化された CommitMessage に解析する。
#[tauri::command]
pub fn parse_commit_msg(content: String) -> Result<CommitMessage, AppError> {
    commit::parse_commit_msg(&content)
}

/// CommitMessage をファイルへ保存する文字列に戻す。
#[tauri::command]
pub fn serialize_commit_msg(message: CommitMessage) -> String {
    commit::serialize_commit_msg(&message)
}

/// コミットメッセージ検証結果。
#[derive(serde::Serialize)]
pub struct CommitValidation {
    pub is_valid: bool,
    pub subject_too_long: bool,
    pub subject_length: usize,
    pub long_body_lines: Vec<(usize, usize)>,
}

/// コミットメッセージを検証し、警告情報を返す。
#[tauri::command]
pub fn validate_commit_msg(message: CommitMessage) -> CommitValidation {
    let long_body_lines = message.get_long_body_lines();
    let subject_too_long = message.is_subject_too_long();

    CommitValidation {
        is_valid: !subject_too_long && long_body_lines.is_empty(),
        subject_too_long,
        subject_length: message.subject_length(),
        long_body_lines,
    }
}
