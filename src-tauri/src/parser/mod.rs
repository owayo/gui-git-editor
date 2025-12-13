pub mod commit;
pub mod detector;
pub mod rebase;

pub use detector::{detect_file_type, GitFileType};
pub use rebase::{parse_rebase_todo, serialize_rebase_todo, RebaseTodoFile};
