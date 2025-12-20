mod commands;
mod error;
mod parser;

use commands::{
    check_backup_exists, create_backup, delete_backup, exit_app, generate_commit_message,
    parse_commit_msg, parse_rebase_todo, read_file, restore_backup, serialize_commit_msg,
    serialize_rebase_todo, validate_commit_msg, write_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            create_backup,
            restore_backup,
            check_backup_exists,
            delete_backup,
            exit_app,
            parse_rebase_todo,
            serialize_rebase_todo,
            generate_commit_message,
            parse_commit_msg,
            serialize_commit_msg,
            validate_commit_msg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
