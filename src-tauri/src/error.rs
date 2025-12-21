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

// Tauri requires errors to be serializable
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
