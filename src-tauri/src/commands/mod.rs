pub mod commit;
pub mod file;
pub mod merge;
pub mod rebase;

pub use commit::{parse_commit_msg, serialize_commit_msg, validate_commit_msg};
pub use file::{
    check_backup_exists, create_backup, delete_backup, exit_app, read_file, restore_backup,
    write_file,
};
pub use merge::{parse_conflicts, read_merge_files};
pub use rebase::{
    generate_commit_message, generate_commit_message_from_staged, parse_rebase_todo,
    serialize_rebase_todo,
};
