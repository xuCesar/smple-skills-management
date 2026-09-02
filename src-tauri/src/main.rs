use std::{fs, path::PathBuf};

fn storage_error(operation: &str, error: impl std::fmt::Display) -> String {
    eprintln!("Skill Desk {operation} failed: {error}");
    format!("{operation}失败，请检查应用数据目录权限")
}

fn config_path() -> Result<PathBuf, String> {
    let base = dirs_path().ok_or_else(|| "无法定位 macOS Application Support 目录".to_string())?;
    let dir = base.join("Skill Desk");
    fs::create_dir_all(&dir).map_err(|e| storage_error("创建配置目录", e))?;
    Ok(dir.join("config.json"))
}
fn dirs_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
}

#[tauri::command]
fn load_config() -> Result<serde_json::Value, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(
            serde_json::json!({"version":1,"directories":[{"path":"~/.agents/skills","source":"default"},{"path":"~/.codex/skills","source":"default"},{"path":"~/.claude/skills","source":"default"}],"hiddenSkillIds":[],"installations":[],"updatedAt": unix_timestamp_seconds()}),
        );
    }
    let raw = fs::read_to_string(&path).map_err(|e| storage_error("读取配置", e))?;
    match serde_json::from_str(&raw) {
        Ok(value) => Ok(value),
        Err(_) => {
            fs::rename(
                &path,
                path.with_extension(format!("corrupt.{}", unix_timestamp_seconds())),
            )
            .map_err(|e| storage_error("备份损坏配置", e))?;
            Ok(
                serde_json::json!({"version":1,"directories":[{"path":"~/.agents/skills","source":"default"},{"path":"~/.codex/skills","source":"default"},{"path":"~/.claude/skills","source":"default"}],"hiddenSkillIds":[],"installations":[],"updatedAt":unix_timestamp_seconds()}),
            )
        }
    }
}
#[tauri::command]
fn save_config(config: serde_json::Value) -> Result<(), String> {
    let path = config_path()?;
    let temp = path.with_extension("tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|e| storage_error("序列化配置", e))?,
    )
    .map_err(|e| storage_error("写入配置", e))?;
    fs::rename(temp, path).map_err(|e| storage_error("替换配置", e))
}

fn expand_path(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

#[tauri::command]
fn scan_directories(
    directories: Vec<String>,
    installations: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mut skills = Vec::new();
    let mut invalid = Vec::new();
    let mut warnings = Vec::new();
    let mut conflicts = Vec::new();
    for raw in directories {
        let root = expand_path(&raw);
        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(error) => {
                if error.kind() == std::io::ErrorKind::PermissionDenied {
                    warnings.push(serde_json::json!({"path": raw, "message": "目录无读取权限"}));
                } else {
                    invalid.push(raw);
                }
                continue;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) || !path.is_dir() {
                continue;
            }
            let skill_file = path.join("SKILL.md");
            if !skill_file.is_file() {
                invalid.push(path.to_string_lossy().to_string());
                continue;
            }
            let content = match fs::read_to_string(&skill_file) {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("Skill Desk read skill failed: {error}");
                    warnings
                        .push(serde_json::json!({"path": path, "message": "技能声明文件无法读取"}));
                    continue;
                }
            };
            let frontmatter = content
                .strip_prefix("---")
                .and_then(|v| v.split_once("---"))
                .map(|(_, body)| body)
                .unwrap_or("");
            let field = |name: &str| {
                frontmatter.lines().find_map(|line| {
                    line.strip_prefix(name)
                        .and_then(|v| v.strip_prefix(':'))
                        .map(|v| v.trim().trim_matches('"').to_string())
                })
            };
            let directory_name = entry.file_name().to_string_lossy().to_string();
            let declared_name = field("name");
            if declared_name
                .as_deref()
                .map(|name| name != directory_name)
                .unwrap_or(true)
            {
                conflicts.push(serde_json::json!({"path": path, "directoryName": directory_name, "declaredName": declared_name}));
                continue;
            }
            let id = declared_name.unwrap_or(directory_name);
            let description = field("description").unwrap_or_default();
            skills.push(serde_json::json!({"id": id, "name": id, "description": description, "path": path, "directory": root, "source": "user"}));
        }
    }
    let stale: Vec<_> = installations
        .into_iter()
        .filter(|item| {
            item.get("path")
                .and_then(|v| v.as_str())
                .map(|p| !expand_path(p).exists())
                .unwrap_or(false)
        })
        .collect();
    Ok(
        serde_json::json!({"skills": skills, "invalidDirectories": invalid, "conflicts": conflicts, "warnings": warnings, "staleInstallations": stale, "scannedAt": unix_timestamp_seconds()}),
    )
}
fn unix_timestamp_seconds() -> String {
    format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    )
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            scan_directories
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skill Desk");
}
