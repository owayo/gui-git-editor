// Windows のリリースビルドで追加のコンソールウィンドウを出さない。削除禁止。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gui_git_editor_lib::run()
}
