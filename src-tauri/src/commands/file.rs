use crate::error::AppError;
use crate::parser::{detect_file_type, GitFileType};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

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

    // 事前 exists() による TOCTOU を避けるため、読み込み結果から FileNotFound を派生させる。
    let content = fs::read_to_string(file_path)
        .await
        .map_err(|e| AppError::from_io_with_path(path.clone(), e))?;

    let file_type = detect_file_type(file_path);

    Ok(FileContent {
        path,
        content,
        file_type,
    })
}

/// 書き込み・copy など destination 側の失敗を分類する。
/// 旧実装と挙動を揃え、NotFound を IoError に保持してパス表示の誤導を防ぐ。
fn map_write_error(path: &str, err: std::io::Error) -> AppError {
    match err.kind() {
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
            path: path.to_string(),
        },
        _ => AppError::IoError {
            message: err.to_string(),
        },
    }
}

/// 内容をファイルへ書き込む。
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), AppError> {
    let file_path = Path::new(&path);

    fs::write(file_path, content)
        .await
        .map_err(|e| map_write_error(&path, e))?;

    Ok(())
}

/// ファイルのバックアップを作成する。
#[tauri::command]
pub async fn create_backup(path: String) -> Result<String, AppError> {
    let file_path = Path::new(&path);
    let backup_path = format!("{}.backup", path);

    // 事前 exists() を行わず copy 失敗時に NotFound を判定する（TOCTOU 回避）。
    // source（読み込み対象）側のエラー分類を採用するため from_io_with_path を使う。
    fs::copy(file_path, &backup_path)
        .await
        .map_err(|e| AppError::from_io_with_path(path.clone(), e))?;

    Ok(backup_path)
}

/// バックアップからファイルを復元する。
#[tauri::command]
pub async fn restore_backup(backup_path: String, target_path: String) -> Result<(), AppError> {
    let backup = Path::new(&backup_path);

    // copy はバックアップ（source）の読み込みと target への書き込みのどちらでも失敗しうるため、
    // パス表示の誤導を避けるべく destination 側マッパーで分類する（NotFound は IoError 扱い）。
    fs::copy(backup, &target_path)
        .await
        .map_err(|e| map_write_error(&backup_path, e))?;

    // 復元後はバックアップファイルを削除する（失敗しても呼び出し側へ伝搬しない）。
    let _ = fs::remove_file(backup).await;

    Ok(())
}

/// バックアップファイルが存在するか確認する。
#[tauri::command]
pub async fn check_backup_exists(path: String) -> Result<Option<String>, AppError> {
    let backup_path = format!("{}.backup", path);

    // 権限不足や symlink loop など metadata エラーは旧 Path::exists() 同様 false 扱いとし、
    // 呼び出し側へ伝搬しない。
    if fs::try_exists(&backup_path).await.unwrap_or(false) {
        Ok(Some(backup_path))
    } else {
        Ok(None)
    }
}

/// バックアップファイルを削除する。
#[tauri::command]
pub async fn delete_backup(path: String) -> Result<(), AppError> {
    let backup_path = format!("{}.backup", path);

    match fs::remove_file(&backup_path).await {
        Ok(()) => Ok(()),
        // バックアップが既に存在しない場合は成功とみなす。
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::from_io_with_path(backup_path, e)),
    }
}

/// 指定した終了コードでアプリケーションを終了する。
#[tauri::command]
pub fn exit_app(code: i32) {
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs as std_fs;

    fn create_test_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gui-git-editor-file-command-test-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        std_fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn cleanup_test_dir(dir: &Path) {
        let _ = std_fs::remove_dir_all(dir);
    }

    #[test]
    fn test_read_file_returns_content_and_detected_type() {
        let dir = create_test_dir();
        let path = dir.join("COMMIT_EDITMSG");
        std_fs::write(&path, "subject\n\nbody\n").unwrap();

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
        std_fs::write(&path, "original\n").unwrap();

        let backup_path =
            tauri::async_runtime::block_on(create_backup(path_string.clone())).unwrap();
        tauri::async_runtime::block_on(write_file(path_string.clone(), "changed\n".to_string()))
            .unwrap();

        let existing_backup =
            tauri::async_runtime::block_on(check_backup_exists(path_string.clone())).unwrap();
        assert_eq!(existing_backup.as_deref(), Some(backup_path.as_str()));

        tauri::async_runtime::block_on(restore_backup(backup_path.clone(), path_string.clone()))
            .unwrap();
        let restored = std_fs::read_to_string(&path).unwrap();
        let backup_after_restore =
            tauri::async_runtime::block_on(check_backup_exists(path_string.clone())).unwrap();

        tauri::async_runtime::block_on(delete_backup(path_string)).unwrap();
        cleanup_test_dir(&dir);

        assert_eq!(restored, "original\n");
        assert!(backup_after_restore.is_none());
        assert!(!Path::new(&backup_path).exists());
    }

    #[test]
    fn test_check_backup_exists_returns_none_for_missing() {
        let dir = create_test_dir();
        let path = dir.join("no-such-file");
        let path_string = path.to_string_lossy().to_string();

        let result = tauri::async_runtime::block_on(check_backup_exists(path_string)).unwrap();
        cleanup_test_dir(&dir);

        assert!(result.is_none());
    }

    #[test]
    fn test_delete_backup_is_idempotent_when_missing() {
        let dir = create_test_dir();
        let path = dir.join("file.txt");
        let path_string = path.to_string_lossy().to_string();

        // バックアップが存在しなくてもエラーを返さない。
        tauri::async_runtime::block_on(delete_backup(path_string)).unwrap();
        cleanup_test_dir(&dir);
    }

    #[test]
    fn test_create_backup_missing_returns_file_not_found() {
        let dir = create_test_dir();
        let path = dir.join("missing.txt");
        let path_string = path.to_string_lossy().to_string();

        let error =
            tauri::async_runtime::block_on(create_backup(path_string.clone())).unwrap_err();
        cleanup_test_dir(&dir);

        assert!(matches!(
            error,
            AppError::FileNotFound { path: actual_path } if actual_path == path_string
        ));
    }
}
