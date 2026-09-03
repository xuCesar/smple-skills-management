use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::State;

#[derive(Default)]
struct LifecycleState {
    reviews: Mutex<HashMap<String, ReviewSnapshot>>,
    operation: Mutex<()>,
}

#[derive(Clone, Serialize, Deserialize)]
struct ReviewFile {
    path: String,
    #[serde(skip_serializing)]
    content: Vec<u8>,
    kind: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct ReviewSnapshot {
    source: String,
    revision: String,
    skill_path: String,
    skill_id: String,
    files: Vec<ReviewFile>,
    created_at: u64,
}

#[derive(Deserialize)]
struct ReviewArgs {
    locator: String,
    skill_path: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewView {
    review_id: String,
    source: String,
    revision: String,
    skill_path: String,
    skill_id: String,
    available_skill_paths: Vec<String>,
    files: Vec<ReviewFileView>,
    skill_content: String,
    risk_flags: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewFileView {
    path: String,
    kind: String,
}

#[derive(Deserialize)]
struct GithubCommit {
    sha: String,
}
#[derive(Deserialize)]
struct GithubTreeResponse {
    tree: Vec<GithubTreeEntry>,
    truncated: Option<bool>,
}
#[derive(Deserialize)]
struct GithubTreeEntry {
    path: Option<String>,
    mode: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    sha: Option<String>,
}
#[derive(Deserialize)]
struct GithubBlob {
    content: String,
    encoding: String,
}

fn parse_locator(input: &str) -> Result<(String, String, Option<String>, String), String> {
    let value = input.trim().trim_end_matches('/').trim_end_matches(".git");
    let short = value.strip_prefix("https://github.com/").unwrap_or(value);
    if value.starts_with("http://")
        || value.starts_with("https://") && !value.starts_with("https://github.com/")
    {
        return Err("GitHub 来源格式不正确".into());
    }
    let mut parts = short.split('/');
    let owner = parts.next().unwrap_or("");
    let repo_ref = parts.next().unwrap_or("");
    if parts.next().is_some() || !safe_component(owner) {
        return Err("GitHub 来源格式不正确".into());
    }
    let (repo, reference) = repo_ref
        .split_once('@')
        .map_or((repo_ref, None), |(repo, r)| (repo, Some(r.to_owned())));
    if !safe_component(repo) || reference.as_deref().is_some_and(|r| !safe_component(r)) {
        return Err("GitHub 来源格式不正确".into());
    }
    Ok((
        owner.into(),
        repo.into(),
        reference,
        format!("https://github.com/{owner}/{repo}"),
    ))
}
fn github_json<T: for<'a> Deserialize<'a>>(url: &str) -> Result<T, String> {
    let response = ureq::get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "skill-desk")
        .call()
        .map_err(|e| {
            eprintln!("Skill Desk GitHub request failed: {e}");
            "无法读取 GitHub 来源，请检查网络连接".to_string()
        })?;
    response.into_body().read_json().map_err(|e| {
        eprintln!("Skill Desk GitHub response failed: {e}");
        "无法读取 GitHub 来源，请检查网络连接".to_string()
    })
}
fn classify(path: &str, mode: &str) -> String {
    if path.eq_ignore_ascii_case("SKILL.md") {
        "skill".into()
    } else if mode == "100755" {
        "executable".into()
    } else if [
        "sh", "bash", "zsh", "fish", "py", "rb", "pl", "js", "mjs", "cjs", "ts", "tsx", "jsx",
        "command",
    ]
    .iter()
    .any(|ext| path.ends_with(&format!(".{ext}")))
    {
        "script".into()
    } else {
        "file".into()
    }
}
fn skill_id(content: &str, fallback: &str) -> String {
    content
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("name:")
                .map(|v| v.trim().trim_matches(['\'', '"']).to_owned())
        })
        .filter(|v| safe_component(v))
        .unwrap_or_else(|| fallback.to_owned())
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn new_review_id() -> Result<String, String> {
    use std::io::Read;
    let mut bytes = [0_u8; 16];
    fs::File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut bytes))
        .map_err(|e| storage_error("生成 review 标识", e))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[tauri::command]
fn lifecycle_review(
    state: State<'_, LifecycleState>,
    args: ReviewArgs,
) -> Result<ReviewView, String> {
    let (owner, repo, reference, canonical) = parse_locator(&args.locator)?;
    let encoded_ref = reference.as_deref().unwrap_or("HEAD");
    let commit: GithubCommit = github_json(&format!(
        "https://api.github.com/repos/{owner}/{repo}/commits/{encoded_ref}"
    ))?;
    let tree: GithubTreeResponse = github_json(&format!(
        "https://api.github.com/repos/{owner}/{repo}/git/trees/{}?recursive=1",
        commit.sha
    ))?;
    if tree.truncated == Some(true) {
        return Err("GitHub 来源文件过多，无法安全完成 review".into());
    }
    let entries: Vec<(String, String, String)> = tree
        .tree
        .into_iter()
        .map(|entry| {
            let path = entry
                .path
                .ok_or_else(|| "来源包含不安全或不支持的文件路径".to_string())?;
            let mode = entry.mode.unwrap_or_default();
            let sha = entry.sha.unwrap_or_default();
            if !safe_relative(&path)
                || entry.kind.as_deref() != Some("blob")
                || mode == "120000"
                || sha.is_empty()
            {
                return Err("来源包含不安全或不支持的文件路径".to_string());
            }
            Ok((path, mode, sha))
        })
        .collect::<Result<_, _>>()?;
    let paths: Vec<String> = entries
        .iter()
        .filter_map(|(path, _, _)| path.ends_with("SKILL.md").then_some(path.clone()))
        .collect();
    if paths.is_empty() {
        return Err("仓库中未找到有效的 SKILL.md".into());
    }
    let selected = match args.skill_path {
        Some(path) if safe_relative(&path) => paths
            .iter()
            .find(|candidate| **candidate == path)
            .cloned()
            .ok_or_else(|| "仓库中未找到有效的 SKILL.md".to_string())?,
        Some(_) => return Err("来源包含不安全或不支持的文件路径".into()),
        None if paths.len() == 1 => paths[0].clone(),
        None => return Err("仓库包含多个 Skill，请选择具体的 SKILL.md".into()),
    };
    let root = selected
        .rsplit_once('/')
        .map(|(root, _)| format!("{root}/"));
    let scoped: Vec<_> = entries
        .into_iter()
        .filter(|(path, _, _)| {
            root.as_deref()
                .map_or(true, |prefix| path.starts_with(prefix))
        })
        .collect();
    if scoped.is_empty() || scoped.len() > 500 {
        return Err("GitHub 来源文件数量超出安全限制".into());
    }
    let mut files = Vec::new();
    let mut display = Vec::new();
    let mut declaration = None;
    let mut total_size = 0_usize;
    let mut risk_flags = Vec::new();
    for (path, mode, sha) in scoped {
        let relative = root
            .as_deref()
            .map_or(path.as_str(), |prefix| {
                path.strip_prefix(prefix).unwrap_or(&path)
            })
            .to_owned();
        let blob: GithubBlob = github_json(&format!(
            "https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}"
        ))?;
        if blob.encoding != "base64" {
            return Err("无法读取 GitHub 来源，请检查网络连接".into());
        }
        let bytes = STANDARD
            .decode(blob.content.replace(['\n', '\r'], ""))
            .map_err(|_| "无法读取 GitHub 来源，请检查网络连接")?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err("GitHub 来源包含超出安全限制的大文件".into());
        }
        total_size += bytes.len();
        if total_size > 10 * 1024 * 1024 {
            return Err("GitHub 来源总大小超出安全限制".into());
        }
        let kind = classify(&relative, &mode);
        if (kind == "script" || kind == "executable")
            && !risk_flags.iter().any(|flag| flag == "包含可执行或脚本文件")
        {
            risk_flags.push("包含可执行或脚本文件".to_string());
        }
        if relative
            == selected
                .strip_prefix(root.as_deref().unwrap_or(""))
                .unwrap_or(&selected)
        {
            declaration =
                Some(String::from_utf8(bytes.clone()).map_err(|_| "SKILL.md 不是有效文本")?);
        }
        display.push(ReviewFileView {
            path: relative.clone(),
            kind: kind.clone(),
        });
        files.push(ReviewFile {
            path: relative,
            content: bytes,
            kind,
        });
    }
    let content = declaration.ok_or_else(|| "仓库中未找到有效的 SKILL.md".to_string())?;
    let id = skill_id(&content, "skill");
    let review_id = new_review_id()?;
    let created_at = now_seconds();
    let mut reviews = state.reviews.lock().map_err(|_| "生命周期状态不可用")?;
    reviews.retain(|_, snapshot| created_at.saturating_sub(snapshot.created_at) < 15 * 60);
    reviews.insert(
        review_id.clone(),
        ReviewSnapshot {
            source: canonical.clone(),
            revision: commit.sha.clone(),
            skill_path: selected.clone(),
            skill_id: id.clone(),
            files,
            created_at,
        },
    );
    Ok(ReviewView {
        review_id,
        source: canonical,
        revision: commit.sha,
        skill_path: selected,
        skill_id: id,
        available_skill_paths: paths,
        files: display,
        skill_content: content,
        risk_flags,
    })
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}
fn safe_relative(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('/')
        && !value.contains('\\')
        && value
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}
fn expand_path(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}
fn target_path(directory: &str, name: &str) -> Result<PathBuf, String> {
    if directory.trim().is_empty() || !safe_component(name) {
        return Err("安装目标不可用，请检查 Skill directory".into());
    }
    Ok(expand_path(directory).join(name))
}

#[derive(Deserialize)]
struct InstallArgs {
    review_id: String,
    directory: String,
    skill_directory_name: String,
    confirmed: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LifecycleResult {
    operation: String,
    skill_id: String,
    path: String,
}

#[tauri::command]
fn lifecycle_install(
    state: State<'_, LifecycleState>,
    args: InstallArgs,
) -> Result<LifecycleResult, String> {
    let _operation = state
        .operation
        .lock()
        .map_err(|_| "生命周期操作状态不可用")?;
    if !args.confirmed {
        return Err("需要确认来源和 Installation target".into());
    }
    let snapshot = state
        .reviews
        .lock()
        .map_err(|_| "生命周期状态不可用")?
        .get(&args.review_id)
        .cloned()
        .ok_or_else(|| "Skill review 已过期，请重新 review".to_string())?;
    if now_seconds().saturating_sub(snapshot.created_at) >= 15 * 60 {
        state
            .reviews
            .lock()
            .map_err(|_| "生命周期状态不可用")?
            .remove(&args.review_id);
        return Err("Skill review 已过期，请重新 review".into());
    }
    if args.skill_directory_name != snapshot.skill_id {
        return Err("Skill identity 与安装目录不一致".into());
    }
    let mut config = load_config()?;
    let configured = config
        .get("directories")
        .and_then(|v| v.as_array())
        .is_some_and(|directories| {
            directories
                .iter()
                .filter_map(|item| item.get("path").and_then(|value| value.as_str()))
                .any(|path| expand_path(path) == expand_path(&args.directory))
        });
    if !configured {
        return Err("安装目标不可用，请选择已配置的 Skill directory".into());
    }
    let expanded_directory = expand_path(&args.directory);
    fs::create_dir_all(&expanded_directory).map_err(|e| storage_error("创建安装目录", e))?;
    if fs::canonicalize(&expanded_directory).map_err(|e| storage_error("校验安装目录", e))?
        != expanded_directory
    {
        return Err("安装目标不能经过 symlink 或相对路径".into());
    }
    let target = target_path(&args.directory, &args.skill_directory_name)?;
    if target.exists() {
        return Err("安装目标已存在同名 Skill".into());
    }
    if snapshot.files.is_empty() || snapshot.files.iter().any(|f| !safe_relative(&f.path)) {
        return Err("来源包含不安全或不支持的文件路径".into());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "安装目标不可用，请检查 Skill directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| storage_error("创建安装目录", e))?;
    let staging = parent.join(format!(".skill-desk-staging-{}", args.review_id));
    fs::create_dir(&staging).map_err(|e| storage_error("创建临时目录", e))?;
    let write_result = (|| -> Result<(), String> {
        for file in &snapshot.files {
            let path = staging.join(&file.path);
            if let Some(dir) = path.parent() {
                fs::create_dir_all(dir).map_err(|e| storage_error("创建 Skill 文件目录", e))?;
            }
            fs::write(path, &file.content).map_err(|e| storage_error("写入 Skill 文件", e))?;
        }
        fs::rename(&staging, &target).map_err(|e| storage_error("安装 Skill", e))
    })();
    if write_result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    write_result?;
    let installation = serde_json::json!({
        "skillId": snapshot.skill_id,
        "path": target.to_string_lossy(),
        "repository": snapshot.source,
        "revision": snapshot.revision,
        "skillPath": snapshot.skill_path,
        "manifest": snapshot.files.iter().map(|file| serde_json::json!({"path": file.path, "size": file.content.len()})).collect::<Vec<_>>(),
    });
    let installations = config
        .get_mut("installations")
        .and_then(|value| value.as_array_mut())
        .ok_or_else(|| "配置格式不受支持".to_string())?;
    installations.push(installation);
    config["updatedAt"] = serde_json::Value::String(unix_timestamp_seconds());
    if let Err(error) = save_config(config) {
        let rollback = staging;
        if fs::rename(&target, &rollback).is_ok() {
            let _ = fs::remove_dir_all(&rollback);
        }
        return Err(error);
    }
    state
        .reviews
        .lock()
        .map_err(|_| "生命周期状态不可用")?
        .remove(&args.review_id);
    Ok(LifecycleResult {
        operation: "install".into(),
        skill_id: snapshot.skill_id,
        path: target.to_string_lossy().into(),
    })
}

#[derive(Deserialize)]
struct UninstallArgs {
    installation_path: String,
    confirmed: bool,
}
#[tauri::command]
fn lifecycle_uninstall(
    state: State<'_, LifecycleState>,
    args: UninstallArgs,
) -> Result<LifecycleResult, String> {
    let _operation = state
        .operation
        .lock()
        .map_err(|_| "生命周期操作状态不可用")?;
    if !args.confirmed {
        return Err("需要确认来源和 Installation target".into());
    }
    let mut config = load_config()?;
    let installations = config
        .get("installations")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "配置格式不受支持".to_string())?;
    let managed = installations
        .iter()
        .find(|installation| {
            installation.get("path").and_then(|value| value.as_str())
                == Some(args.installation_path.as_str())
        })
        .ok_or_else(|| "该 Skill installation 不是由 Skill Desk 管理".to_string())?;
    let skill_id = managed
        .get("skillId")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Managed installation metadata 无效".to_string())?
        .to_owned();
    let target = expand_path(&args.installation_path);
    if !target.is_dir() {
        return Err("该 Skill installation 不是由 Skill Desk 管理".into());
    }
    let trash = expand_path("~/.Trash");
    fs::create_dir_all(&trash).map_err(|e| storage_error("访问 macOS Trash", e))?;
    let name = target
        .file_name()
        .ok_or_else(|| "卸载目标不可用".to_string())?
        .to_string_lossy();
    let destination = trash.join(format!("{}-{}", name, new_review_id()?));
    fs::rename(&target, &destination).map_err(|e| storage_error("移动 Skill 到 Trash", e))?;
    let installations = config
        .get_mut("installations")
        .and_then(|value| value.as_array_mut())
        .ok_or_else(|| "配置格式不受支持".to_string())?;
    installations.retain(|installation| {
        installation.get("path").and_then(|value| value.as_str())
            != Some(args.installation_path.as_str())
    });
    config["updatedAt"] = serde_json::Value::String(unix_timestamp_seconds());
    if let Err(error) = save_config(config) {
        if let Err(rollback_error) = fs::rename(&destination, &target) {
            eprintln!("Skill Desk uninstall rollback failed: {rollback_error}");
        }
        return Err(error);
    }
    Ok(LifecycleResult {
        operation: "uninstall".into(),
        skill_id,
        path: args.installation_path,
    })
}

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
    let temp = path.with_extension(format!("tmp.{}", new_review_id()?));
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&config).map_err(|e| storage_error("序列化配置", e))?,
    )
    .map_err(|e| storage_error("写入配置", e))?;
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(storage_error("替换配置", error));
    }
    Ok(())
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
        .manage(LifecycleState::default())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            scan_directories,
            lifecycle_review,
            lifecycle_install,
            lifecycle_uninstall
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skill Desk");
}
