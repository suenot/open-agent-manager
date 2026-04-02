mod claude_history;
mod cmdop;
mod projects;
mod prompts;
mod servers;
mod ssh;
mod tasks;
mod tempfiles;

use tauri::Manager;

#[cfg(feature = "devtools")]
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg(not(feature = "devtools"))]
#[tauri::command]
fn toggle_devtools(_window: tauri::WebviewWindow) {
    // DevTools disabled in release build
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .invoke_handler(tauri::generate_handler![
            projects::get_projects,
            projects::add_project,
            projects::remove_project,
            projects::save_projects,
            projects::archive_project,
            projects::restore_project,
            projects::duplicate_project,
            projects::get_project_icon,
            prompts::get_prompts,
            prompts::save_prompts,
            cmdop::list_cmdop_sessions,
            cmdop::cmdop_agent_run,
            cmdop::cmdop_send_input,
            cmdop::cmdop_start_stream,
            cmdop::cmdop_stop_stream,
            cmdop::cmdop_resize_terminal,
            servers::get_servers,
            servers::add_server,
            servers::update_server,
            servers::remove_server,
            ssh::list_ssh_keys,
            ssh::ssh_mkdir,
            ssh::ssh_list_dirs,
            tasks::get_tasks,
            tasks::save_tasks,
            tempfiles::save_temp_file,
            claude_history::get_claude_auto_name,
            toggle_devtools,
        ])
        .setup(|app| {
            app.manage(cmdop::CmdopState::default());
            
            // Auto-open DevTools during development
            #[cfg(feature = "devtools")]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
