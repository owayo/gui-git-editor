mod commands;
mod error;
mod parser;

use commands::{
    create_backup, exit_app, parse_rebase_todo, read_file, restore_backup, serialize_rebase_todo,
    write_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cli::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            create_backup,
            restore_backup,
            exit_app,
            parse_rebase_todo,
            serialize_rebase_todo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
