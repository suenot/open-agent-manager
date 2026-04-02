use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptAttachment {
    pub id: String,
    pub name: String,
    pub mime: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptCard {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(default)]
    pub attachments: Vec<PromptAttachment>,
}

type PromptsStore = HashMap<String, Vec<PromptCard>>;

fn prompts_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;

    let file_path = data_dir.join("prompts.json");

    if !file_path.exists() {
        std::fs::write(&file_path, "{}")
            .map_err(|e| format!("Failed to create prompts.json: {}", e))?;
    }

    Ok(file_path)
}

fn load_store(app_handle: &tauri::AppHandle) -> Result<PromptsStore, String> {
    let file_path = prompts_file(app_handle)?;
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read prompts.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse prompts.json: {}", e))
}

fn save_store(app_handle: &tauri::AppHandle, store: &PromptsStore) -> Result<(), String> {
    let file_path = prompts_file(app_handle)?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize prompts: {}", e))?;
    std::fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write prompts.json: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_prompts(app_handle: tauri::AppHandle, project_id: String) -> Result<Vec<PromptCard>, String> {
    let store = load_store(&app_handle)?;
    Ok(store.get(&project_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn save_prompts(
    app_handle: tauri::AppHandle,
    project_id: String,
    prompts: Vec<PromptCard>,
) -> Result<(), String> {
    let mut store = load_store(&app_handle)?;
    if prompts.is_empty() {
        store.remove(&project_id);
    } else {
        store.insert(project_id, prompts);
    }
    save_store(&app_handle, &store)
}
