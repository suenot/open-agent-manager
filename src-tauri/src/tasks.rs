use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCard {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_status")]
    pub status: String, // "todo" | "in_progress" | "done"
    #[serde(default)]
    pub created_at: f64,
}

fn default_status() -> String {
    "todo".to_string()
}

type TasksStore = HashMap<String, Vec<TaskCard>>;

fn tasks_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let file_path = data_dir.join("tasks.json");

    if !file_path.exists() {
        std::fs::write(&file_path, "{}")
            .map_err(|e| format!("Failed to create tasks.json: {}", e))?;
    }

    Ok(file_path)
}

fn load_store(app_handle: &tauri::AppHandle) -> Result<TasksStore, String> {
    let file_path = tasks_file(app_handle)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read tasks.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse tasks.json: {}", e))
}

fn save_store(app_handle: &tauri::AppHandle, store: &TasksStore) -> Result<(), String> {
    let file_path = tasks_file(app_handle)?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize tasks: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write tasks.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_tasks(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<TaskCard>, String> {
    let store = load_store(&app_handle)?;
    Ok(store.get(&project_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn save_tasks(
    app_handle: tauri::AppHandle,
    project_id: String,
    tasks: Vec<TaskCard>,
) -> Result<(), String> {
    let mut store = load_store(&app_handle)?;
    if tasks.is_empty() {
        store.remove(&project_id);
    } else {
        store.insert(project_id, tasks);
    }
    save_store(&app_handle, &store)
}
