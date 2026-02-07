pub mod codex;
pub mod commit;
pub mod file;
pub mod merge;
pub mod rebase;
pub mod staging;

pub use codex::{check_codex_available, open_codex_terminal};
pub use commit::{parse_commit_msg, serialize_commit_msg, validate_commit_msg};
pub use file::{
    check_backup_exists, create_backup, delete_backup, exit_app, read_file, restore_backup,
    write_file,
};
pub use merge::{git_blame_for_merge, parse_conflicts, read_merge_files};
pub use rebase::{
    check_git_sc_available, generate_commit_message, generate_commit_message_from_staged,
    parse_rebase_todo, serialize_rebase_todo,
};
pub use staging::{git_diff_file, git_stage_all, git_stage_file, git_status, git_unstage_file};
