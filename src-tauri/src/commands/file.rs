use crate::error::AppError;
use crate::parser::{detect_file_type, GitFileType};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub file_type: GitFileType,
}

/// Read file and detect its type
#[tauri::command]
pub async fn read_file(path: String) -> Result<FileContent, AppError> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(AppError::FileNotFound { path });
    }

    let content = fs::read_to_string(file_path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied { path: path.clone() },
        _ => AppError::IoError {
            message: e.to_string(),
        },
    })?;

    let file_type = detect_file_type(file_path);

    Ok(FileContent {
        path,
        content,
        file_type,
    })
}

/// Write content to file
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), AppError> {
    let file_path = Path::new(&path);

    fs::write(file_path, content).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied { path: path.clone() },
        _ => AppError::IoError {
            message: e.to_string(),
        },
    })?;

    Ok(())
}

/// Create a backup of the file
#[tauri::command]
pub async fn create_backup(path: String) -> Result<String, AppError> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(AppError::FileNotFound { path });
    }

    let backup_path = format!("{}.backup", path);
    fs::copy(file_path, &backup_path).map_err(|e| AppError::IoError {
        message: e.to_string(),
    })?;

    Ok(backup_path)
}

/// Restore file from backup
#[tauri::command]
pub async fn restore_backup(backup_path: String, target_path: String) -> Result<(), AppError> {
    let backup = Path::new(&backup_path);

    if !backup.exists() {
        return Err(AppError::FileNotFound { path: backup_path });
    }

    fs::copy(backup, &target_path).map_err(|e| AppError::IoError {
        message: e.to_string(),
    })?;

    // Remove backup file after restore
    let _ = fs::remove_file(backup);

    Ok(())
}

/// Check if a backup file exists
#[tauri::command]
pub async fn check_backup_exists(path: String) -> Result<Option<String>, AppError> {
    let backup_path = format!("{}.backup", path);
    let backup = Path::new(&backup_path);

    if backup.exists() {
        Ok(Some(backup_path))
    } else {
        Ok(None)
    }
}

/// Delete backup file
#[tauri::command]
pub async fn delete_backup(path: String) -> Result<(), AppError> {
    let backup_path = format!("{}.backup", path);
    let backup = Path::new(&backup_path);

    if backup.exists() {
        fs::remove_file(backup).map_err(|e| AppError::IoError {
            message: e.to_string(),
        })?;
    }

    Ok(())
}

/// Exit the application with specified code.
/// Uses `std::process::exit` directly to guarantee the exit code is propagated
/// to the parent process (critical for `git mergetool --trustExitCode`).
#[tauri::command]
pub fn exit_app(code: i32) {
    std::process::exit(code);
}
