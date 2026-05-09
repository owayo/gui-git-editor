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

/// ファイルを読み込み、種別を判定する。
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

/// 内容をファイルへ書き込む。
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

/// ファイルのバックアップを作成する。
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

/// バックアップからファイルを復元する。
#[tauri::command]
pub async fn restore_backup(backup_path: String, target_path: String) -> Result<(), AppError> {
    let backup = Path::new(&backup_path);

    if !backup.exists() {
        return Err(AppError::FileNotFound { path: backup_path });
    }

    fs::copy(backup, &target_path).map_err(|e| AppError::IoError {
        message: e.to_string(),
    })?;

    // 復元後はバックアップファイルを削除する。
    let _ = fs::remove_file(backup);

    Ok(())
}

/// バックアップファイルが存在するか確認する。
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

/// バックアップファイルを削除する。
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

/// 指定した終了コードでアプリケーションを終了する。
#[tauri::command]
pub fn exit_app(code: i32) {
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gui-git-editor-file-command-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup_test_dir(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn test_read_file_returns_content_and_detected_type() {
        let dir = create_test_dir();
        let path = dir.join("COMMIT_EDITMSG");
        fs::write(&path, "subject\n\nbody\n").unwrap();

        let file =
            tauri::async_runtime::block_on(read_file(path.to_string_lossy().to_string())).unwrap();

        cleanup_test_dir(&dir);

        assert_eq!(file.path, path.to_string_lossy());
        assert_eq!(file.content, "subject\n\nbody\n");
        assert_eq!(file.file_type, GitFileType::CommitMsg);
    }

    #[test]
    fn test_read_file_missing_returns_file_not_found_with_path() {
        let dir = create_test_dir();
        let path = dir.join("missing.txt");

        let error = tauri::async_runtime::block_on(read_file(path.to_string_lossy().to_string()))
            .unwrap_err();

        cleanup_test_dir(&dir);

        assert!(matches!(
            error,
            AppError::FileNotFound { path: actual_path } if actual_path == path.to_string_lossy()
        ));
    }

    #[test]
    fn test_backup_restore_and_delete_backup_lifecycle() {
        let dir = create_test_dir();
        let path = dir.join("MERGE_MSG");
        let path_string = path.to_string_lossy().to_string();
        fs::write(&path, "original\n").unwrap();

        let backup_path =
            tauri::async_runtime::block_on(create_backup(path_string.clone())).unwrap();
        tauri::async_runtime::block_on(write_file(path_string.clone(), "changed\n".to_string()))
            .unwrap();

        let existing_backup =
            tauri::async_runtime::block_on(check_backup_exists(path_string.clone())).unwrap();
        assert_eq!(existing_backup.as_deref(), Some(backup_path.as_str()));

        tauri::async_runtime::block_on(restore_backup(backup_path.clone(), path_string.clone()))
            .unwrap();
        let restored = fs::read_to_string(&path).unwrap();
        let backup_after_restore =
            tauri::async_runtime::block_on(check_backup_exists(path_string.clone())).unwrap();

        tauri::async_runtime::block_on(delete_backup(path_string)).unwrap();
        cleanup_test_dir(&dir);

        assert_eq!(restored, "original\n");
        assert!(backup_after_restore.is_none());
        assert!(!Path::new(&backup_path).exists());
    }
}
