mod commands;
mod error;
mod parser;

use commands::{
    check_backup_exists, create_backup, delete_backup, exit_app, generate_commit_message,
    generate_commit_message_from_staged, parse_commit_msg, parse_rebase_todo, read_file,
    restore_backup, serialize_commit_msg, serialize_rebase_todo, validate_commit_msg, write_file,
};
use tauri::Manager;

/// ウィンドウをカーソルがあるモニターの中央に配置する
fn center_window_on_cursor_monitor(
    window: &tauri::WebviewWindow,
) -> Result<(), Box<dyn std::error::Error>> {
    // カーソル位置を取得
    let cursor_position = window.cursor_position()?;

    // 利用可能なモニターを取得
    let monitors = window.available_monitors()?;

    // カーソルがあるモニターを探す
    let target_monitor = monitors.iter().find(|monitor| {
        let pos = monitor.position();
        let size = monitor.size();
        cursor_position.x >= pos.x as f64
            && cursor_position.x < (pos.x + size.width as i32) as f64
            && cursor_position.y >= pos.y as f64
            && cursor_position.y < (pos.y + size.height as i32) as f64
    });

    // モニターが見つかった場合、そのモニターの中央にウィンドウを配置
    if let Some(monitor) = target_monitor {
        let monitor_pos = monitor.position();
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        let x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32) / 2;
        let y = monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32) / 2;

        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            x, y,
        )))?;
    } else {
        // フォールバック: プライマリモニターの中央に配置
        window.center()?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .setup(|app| {
            // メインウィンドウをカーソルがあるモニターの中央に配置
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = center_window_on_cursor_monitor(&window) {
                    log::warn!("Failed to center window on cursor monitor: {}", e);
                    // フォールバック: 通常の中央配置
                    let _ = window.center();
                }
            }
            Ok(())
        })
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
            generate_commit_message_from_staged,
            parse_commit_msg,
            serialize_commit_msg,
            validate_commit_msg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
