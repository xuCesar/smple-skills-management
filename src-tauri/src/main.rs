use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Debug, Serialize, Deserialize)]
struct ManagedConfig { version: u8, directories: Vec<serde_json::Value>, hidden_skill_ids: Vec<String>, installations: Vec<serde_json::Value>, updated_at: String }

fn config_path() -> Result<PathBuf, String> {
  let base = dirs_path().ok_or_else(|| "无法定位 macOS Application Support 目录".to_string())?;
  let dir = base.join("Skill Desk"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?; Ok(dir.join("config.json"))
}
fn dirs_path() -> Option<PathBuf> { std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support")) }

#[tauri::command]
fn load_config() -> Result<serde_json::Value, String> {
  let path = config_path()?; if !path.exists() { return Ok(serde_json::json!({"version":1,"directories":[],"hiddenSkillIds":[],"installations":[],"updatedAt": chrono_now()})); }
  let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  match serde_json::from_str(&raw) { Ok(value) => Ok(value), Err(_) => { fs::rename(&path, path.with_extension(format!("corrupt.{}", chrono_now()))).map_err(|e| e.to_string())?; Ok(serde_json::json!({"version":1,"directories":[],"hiddenSkillIds":[],"installations":[],"updatedAt":chrono_now()})) } }
}
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> { let path = config_path()?; let temp = path.with_extension("tmp"); fs::write(&temp, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?; fs::rename(temp, path).map_err(|e| e.to_string()) }
fn chrono_now() -> String { format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()) }

fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![load_config, save_config]).run(tauri::generate_context!()).expect("error while running Skill Desk"); }
