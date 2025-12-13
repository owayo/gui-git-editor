//! Tauri commands for commit message parsing and serialization

use crate::error::AppError;
use crate::parser::commit::{self, CommitMessage};

/// Parse commit message content into a structured CommitMessage
#[tauri::command]
pub fn parse_commit_msg(content: String) -> Result<CommitMessage, AppError> {
    commit::parse_commit_msg(&content)
}

/// Serialize a CommitMessage struct back to file content
#[tauri::command]
pub fn serialize_commit_msg(message: CommitMessage) -> String {
    commit::serialize_commit_msg(&message)
}

/// Validation result for commit message
#[derive(serde::Serialize)]
pub struct CommitValidation {
    pub is_valid: bool,
    pub subject_too_long: bool,
    pub subject_length: usize,
    pub long_body_lines: Vec<(usize, usize)>,
}

/// Validate a commit message and return warnings
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
