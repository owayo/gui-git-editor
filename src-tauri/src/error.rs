use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "details")]
pub enum AppError {
    #[error("File not found: {path}")]
    FileNotFound { path: String },

    #[error("Permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("Parse error at line {line}: {message}")]
    ParseError { line: usize, message: String },

    #[error("IO error: {message}")]
    IoError { message: String },

    #[error("Command execution failed: {message}")]
    CommandError { message: String },
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::FileNotFound {
                path: "unknown".to_string(),
            },
            std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
                path: "unknown".to_string(),
            },
            _ => AppError::IoError {
                message: err.to_string(),
            },
        }
    }
}

impl AppError {
    /// パス情報を保持したまま `std::io::Error` を `AppError` に変換する。
    /// `From<std::io::Error>` だとパスが失われるため、ファイル操作の文脈ではこちらを使う。
    pub fn from_io_with_path(path: impl Into<String>, err: std::io::Error) -> Self {
        let path = path.into();
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::FileNotFound { path },
            std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied { path },
            _ => AppError::IoError {
                message: err.to_string(),
            },
        }
    }
}

// Tauri へ返すエラーはシリアライズ可能である必要がある。
impl serde::ser::Serialize for AppErrorWrapper {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        self.0.serialize(serializer)
    }
}

#[allow(dead_code)]
pub struct AppErrorWrapper(pub AppError);

impl From<AppError> for AppErrorWrapper {
    fn from(err: AppError) -> Self {
        AppErrorWrapper(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn from_io_with_path_maps_not_found_with_path() {
        let err = AppError::from_io_with_path(
            "/tmp/missing.txt",
            io::Error::from(io::ErrorKind::NotFound),
        );
        assert!(matches!(
            err,
            AppError::FileNotFound { path } if path == "/tmp/missing.txt"
        ));
    }

    #[test]
    fn from_io_with_path_maps_permission_denied_with_path() {
        let err = AppError::from_io_with_path(
            "/etc/secret",
            io::Error::from(io::ErrorKind::PermissionDenied),
        );
        assert!(matches!(
            err,
            AppError::PermissionDenied { path } if path == "/etc/secret"
        ));
    }

    #[test]
    fn from_io_with_path_maps_other_kinds_to_io_error() {
        let err = AppError::from_io_with_path("/tmp/file", io::Error::other("boom"));
        assert!(matches!(err, AppError::IoError { .. }));
    }

    #[test]
    fn from_io_without_path_loses_path_info() {
        // 既存実装の挙動を固定するため、From<io::Error> 経由ではパスが "unknown" になることを確認する。
        let err: AppError = io::Error::from(io::ErrorKind::NotFound).into();
        assert!(matches!(
            err,
            AppError::FileNotFound { path } if path == "unknown"
        ));
    }
}
