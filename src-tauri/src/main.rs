use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};

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

fn expand_path(path: &str) -> PathBuf {
  if let Some(rest) = path.strip_prefix("~/") { if let Some(home) = std::env::var_os("HOME") { return PathBuf::from(home).join(rest); } }
  PathBuf::from(path)
}

#[tauri::command]
fn scan_directories(directories: Vec<String>, installations: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
  let mut skills = Vec::new(); let mut invalid = Vec::new(); let mut warnings = Vec::new();
  for raw in directories {
    let root = expand_path(&raw);
    let entries = match fs::read_dir(&root) { Ok(entries) => entries, Err(error) => { if error.kind() == std::io::ErrorKind::PermissionDenied { warnings.push(serde_json::json!({"path": raw, "message": "目录无读取权限"})); } else { invalid.push(raw); } continue; } };
    for entry in entries.flatten() {
      let path = entry.path();
      if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) || !path.is_dir() { continue; }
      let skill_file = path.join("SKILL.md");
      if !skill_file.is_file() { invalid.push(path.to_string_lossy().to_string()); continue; }
      let content = match fs::read_to_string(&skill_file) { Ok(value) => value, Err(error) => { warnings.push(serde_json::json!({"path": path, "message": error.to_string()})); continue; } };
      let frontmatter = content.strip_prefix("---").and_then(|v| v.split_once("---")).map(|(_, body)| body).unwrap_or("");
      let field = |name: &str| frontmatter.lines().find_map(|line| line.strip_prefix(name).and_then(|v| v.strip_prefix(':')).map(|v| v.trim().trim_matches('"').to_string()));
      let id = field("name").unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
      let description = field("description").unwrap_or_default();
      skills.push(serde_json::json!({"id": id, "name": id, "description": description, "path": path, "directory": root, "source": "user"}));
    }
  }
  let stale: Vec<_> = installations.into_iter().filter(|item| item.get("path").and_then(|v| v.as_str()).map(|p| !expand_path(p).exists()).unwrap_or(false)).collect();
  Ok(serde_json::json!({"skills": skills, "invalidDirectories": invalid, "warnings": warnings, "staleInstallations": stale, "scannedAt": chrono_now()}))
}
fn chrono_now() -> String { format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()) }

fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![load_config, save_config, scan_directories]).run(tauri::generate_context!()).expect("error while running Skill Desk"); }
