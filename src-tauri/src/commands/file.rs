use crate::error::AppError;
use crate::parser::{detect_file_type, GitFileType};
use serde::{Deserialize, Serialize};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
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

/// OS 標準のキャッシュディレクトリを返す。
/// - macOS: `$HOME/Library/Caches`
/// - Linux: `$XDG_CACHE_HOME` または `$HOME/.cache`
/// - Windows: `%LOCALAPPDATA%`
/// - その他: `$HOME/.cache` フォールバック
fn cache_base_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library").join("Caches"))
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(xdg) = std::env::var_os("XDG_CACHE_HOME") {
            Some(PathBuf::from(xdg))
        } else {
            std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache"))
        }
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache"))
    }
}

/// gui-git-editor 用のバックアップ保管ディレクトリを返す。
/// `git rebase -i` 等が `.git/rebase-merge/git-rebase-todo.backup` を内部用に作るため、
/// 元ファイルと同じディレクトリに `.backup` を作ると衝突する。これを避けるため、
/// バックアップは OS のキャッシュ領域へ隔離する。
fn backup_base_dir() -> Result<PathBuf, AppError> {
    let base = cache_base_dir().ok_or_else(|| AppError::IoError {
        message: "Cache directory not found".to_string(),
    })?;
    Ok(base.join("gui-git-editor").join("backups"))
}

/// 指定ベース直下に、`original_path` に対応する一意なバックアップパスを組み立てる。
/// 形式: `<base>/<16桁hex hash>-<basename>.backup`
/// `original_path` 全体を hash することで別ディレクトリの同名ファイル衝突を回避し、
/// basename を末尾に残してキャッシュ内をのぞいたユーザーが由来を辨別できるようにする。
fn backup_path_in(base: &Path, original_path: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    original_path.hash(&mut hasher);
    let hash = hasher.finish();
    let basename = Path::new(original_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    base.join(format!("{:016x}-{}.backup", hash, basename))
}

/// 内部実装: 指定ベース直下にバックアップを作成する。テスト用。
async fn create_backup_in(base: &Path, source_path: &str) -> Result<String, AppError> {
    let backup_path = backup_path_in(base, source_path);

    // バックアップ保管ディレクトリは初回利用時に作成する。
    if let Some(parent) = backup_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| map_write_error(&parent.to_string_lossy(), e))?;
    }

    // 事前 exists() を行わず copy 失敗時に NotFound を判定する（TOCTOU 回避）。
    // source（読み込み対象）側のエラー分類を採用するため from_io_with_path を使う。
    fs::copy(source_path, &backup_path)
        .await
        .map_err(|e| AppError::from_io_with_path(source_path.to_string(), e))?;

    Ok(backup_path.to_string_lossy().to_string())
}

/// 内部実装: 指定ベース直下のバックアップ存在を確認する。テスト用。
async fn check_backup_exists_in(base: &Path, source_path: &str) -> Option<String> {
    let backup_path = backup_path_in(base, source_path);
    // 権限不足や symlink loop など metadata エラーは旧 Path::exists() 同様 false 扱いとし、
    // 呼び出し側へ伝搬しない。
    if fs::try_exists(&backup_path).await.unwrap_or(false) {
        Some(backup_path.to_string_lossy().to_string())
    } else {
        None
    }
}

/// 内部実装: 指定ベース直下のバックアップを削除する。テスト用。
async fn delete_backup_in(base: &Path, source_path: &str) -> Result<(), AppError> {
    let backup_path = backup_path_in(base, source_path);
    match fs::remove_file(&backup_path).await {
        Ok(()) => Ok(()),
        // バックアップが既に存在しない場合は成功とみなす。
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::from_io_with_path(
            backup_path.to_string_lossy().to_string(),
            e,
        )),
    }
}

/// ファイルのバックアップを作成する。
#[tauri::command]
pub async fn create_backup(path: String) -> Result<String, AppError> {
    let base = backup_base_dir()?;
    create_backup_in(&base, &path).await
}

/// バックアップからファイルを復元する。
#[tauri::command]
pub async fn restore_backup(backup_path: String, target_path: String) -> Result<(), AppError> {
    let backup = Path::new(&backup_path);

    // copy はバックアップ（source）の読み込みと target への書き込みのどちらでも失敗しうるため、
    // PermissionDenied は書き込み側で発生するケースが多い。destination のパスを渡して
    // ユーザーが実際の問題箇所（target_path）を特定できるようにする（NotFound は IoError 扱い）。
    fs::copy(backup, &target_path)
        .await
        .map_err(|e| map_write_error(&target_path, e))?;

    // 復元後はバックアップファイルを削除する（失敗しても呼び出し側へ伝搬しない）。
    let _ = fs::remove_file(backup).await;

    Ok(())
}

/// バックアップファイルが存在するか確認する。
#[tauri::command]
pub async fn check_backup_exists(path: String) -> Result<Option<String>, AppError> {
    let base = backup_base_dir()?;
    Ok(check_backup_exists_in(&base, &path).await)
}

/// バックアップファイルを削除する。
#[tauri::command]
pub async fn delete_backup(path: String) -> Result<(), AppError> {
    let base = backup_base_dir()?;
    delete_backup_in(&base, &path).await
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
        let backup_base = dir.join("backups");
        let path = dir.join("MERGE_MSG");
        let path_string = path.to_string_lossy().to_string();
        std_fs::write(&path, "original\n").unwrap();

        let backup_path =
            tauri::async_runtime::block_on(create_backup_in(&backup_base, &path_string)).unwrap();
        tauri::async_runtime::block_on(write_file(path_string.clone(), "changed\n".to_string()))
            .unwrap();

        let existing_backup =
            tauri::async_runtime::block_on(check_backup_exists_in(&backup_base, &path_string));
        assert_eq!(existing_backup.as_deref(), Some(backup_path.as_str()));

        tauri::async_runtime::block_on(restore_backup(backup_path.clone(), path_string.clone()))
            .unwrap();
        let restored = std_fs::read_to_string(&path).unwrap();
        let backup_after_restore =
            tauri::async_runtime::block_on(check_backup_exists_in(&backup_base, &path_string));

        tauri::async_runtime::block_on(delete_backup_in(&backup_base, &path_string)).unwrap();
        cleanup_test_dir(&dir);

        assert_eq!(restored, "original\n");
        assert!(backup_after_restore.is_none());
        assert!(!Path::new(&backup_path).exists());
    }

    #[test]
    fn test_check_backup_exists_returns_none_for_missing() {
        let dir = create_test_dir();
        let backup_base = dir.join("backups");
        let path = dir.join("no-such-file");
        let path_string = path.to_string_lossy().to_string();

        let result =
            tauri::async_runtime::block_on(check_backup_exists_in(&backup_base, &path_string));
        cleanup_test_dir(&dir);

        assert!(result.is_none());
    }

    #[test]
    fn test_delete_backup_is_idempotent_when_missing() {
        let dir = create_test_dir();
        let backup_base = dir.join("backups");
        let path = dir.join("file.txt");
        let path_string = path.to_string_lossy().to_string();

        // バックアップが存在しなくてもエラーを返さない。
        tauri::async_runtime::block_on(delete_backup_in(&backup_base, &path_string)).unwrap();
        cleanup_test_dir(&dir);
    }

    #[test]
    fn test_create_backup_missing_returns_file_not_found() {
        let dir = create_test_dir();
        let backup_base = dir.join("backups");
        let path = dir.join("missing.txt");
        let path_string = path.to_string_lossy().to_string();

        let error = tauri::async_runtime::block_on(create_backup_in(&backup_base, &path_string))
            .unwrap_err();
        cleanup_test_dir(&dir);

        assert!(matches!(
            error,
            AppError::FileNotFound { path: actual_path } if actual_path == path_string
        ));
    }

    #[test]
    fn test_backup_path_is_isolated_from_source_directory() {
        // git rebase -i が `.git/rebase-merge/git-rebase-todo.backup` を作っても、
        // gui-git-editor のバックアップはキャッシュ側に隔離され衝突しないことを検証する。
        let dir = create_test_dir();
        let backup_base = dir.join("backups");
        let rebase_dir = dir.join("rebase-merge");
        std_fs::create_dir_all(&rebase_dir).unwrap();
        let todo_path = rebase_dir.join("git-rebase-todo");
        std_fs::write(&todo_path, "pick abc\n").unwrap();
        let todo_path_string = todo_path.to_string_lossy().to_string();

        // git 側が作る backup を模擬
        let git_internal_backup = rebase_dir.join("git-rebase-todo.backup");
        std_fs::write(&git_internal_backup, "pick abc\npick def\n").unwrap();

        // create_backup は git 側 backup を上書きしない（別ロケーション）
        let our_backup_path =
            tauri::async_runtime::block_on(create_backup_in(&backup_base, &todo_path_string))
                .unwrap();
        assert_ne!(
            our_backup_path,
            git_internal_backup.to_string_lossy().to_string()
        );
        assert!(our_backup_path.starts_with(backup_base.to_string_lossy().as_ref()));

        // check_backup_exists も git 側 backup を誤検出しない
        // gui-git-editor 側の backup を消すと「存在しない」と返るべき
        tauri::async_runtime::block_on(delete_backup_in(&backup_base, &todo_path_string)).unwrap();
        let after_delete =
            tauri::async_runtime::block_on(check_backup_exists_in(&backup_base, &todo_path_string));
        assert!(after_delete.is_none());

        // delete_backup は git 側 backup を削除しない
        assert!(git_internal_backup.exists());

        cleanup_test_dir(&dir);
    }

    #[test]
    fn test_backup_path_in_is_deterministic_and_distinct_for_distinct_paths() {
        let base = PathBuf::from("/tmp/dummy-base");
        let a1 = backup_path_in(&base, "/home/user/a/git-rebase-todo");
        let a2 = backup_path_in(&base, "/home/user/a/git-rebase-todo");
        let b = backup_path_in(&base, "/home/user/b/git-rebase-todo");

        assert_eq!(a1, a2, "same path must produce same backup path");
        assert_ne!(a1, b, "distinct paths must produce distinct backup paths");

        // basename がファイル名末尾に残ること
        let file_name = a1.file_name().unwrap().to_string_lossy().into_owned();
        assert!(
            file_name.ends_with("-git-rebase-todo.backup"),
            "{}",
            file_name
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_restore_backup_permission_denied_reports_target_path() {
        // destination 側で PermissionDenied が起きたとき、エラーに残るパスが
        // backup_path ではなく target_path であることを検証する（リグレッション防止）。
        use std::os::unix::fs::PermissionsExt;

        let dir = create_test_dir();
        let backup_base = dir.join("backups");
        let target_path = dir.join("file.txt");
        let target_path_string = target_path.to_string_lossy().to_string();
        std_fs::write(&target_path, "original\n").unwrap();

        let backup_path =
            tauri::async_runtime::block_on(create_backup_in(&backup_base, &target_path_string))
                .unwrap();

        // target を読み取り専用にして restore（書き込み）で PermissionDenied を発生させる。
        let mut perms = std_fs::metadata(&target_path).unwrap().permissions();
        perms.set_mode(0o444);
        std_fs::set_permissions(&target_path, perms).unwrap();

        // root 実行など permission を無視できる環境では PermissionDenied が起きないためスキップ。
        let probe_writable = std_fs::OpenOptions::new()
            .write(true)
            .open(&target_path)
            .is_ok();
        if probe_writable {
            let mut perms = std_fs::metadata(&target_path).unwrap().permissions();
            perms.set_mode(0o644);
            std_fs::set_permissions(&target_path, perms).unwrap();
            cleanup_test_dir(&dir);
            return;
        }

        let error =
            tauri::async_runtime::block_on(restore_backup(backup_path, target_path_string.clone()))
                .unwrap_err();

        // クリーンアップのため書き込み可能に戻す。
        let mut perms = std_fs::metadata(&target_path).unwrap().permissions();
        perms.set_mode(0o644);
        std_fs::set_permissions(&target_path, perms).unwrap();
        cleanup_test_dir(&dir);

        assert!(matches!(
            error,
            AppError::PermissionDenied { path: actual_path } if actual_path == target_path_string
        ));
    }
}
