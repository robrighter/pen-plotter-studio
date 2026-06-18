// Prevent an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

#[tauri::command]
fn save_export(filename: String, contents: String) -> Result<String, String> {
    let safe_name = Path::new(&filename)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid export filename.".to_string())?;

    let extension = Path::new(safe_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "svg" | "gcode" | "ppstudio") {
        return Err("Only SVG, GCode, and PPStudio exports are supported.".to_string());
    }

    let mut dir = downloads_dir().unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    dir.push("Pen Plotter Studio");
    fs::create_dir_all(&dir).map_err(|err| format!("Could not create export folder: {err}"))?;

    let path = unique_path(&dir, safe_name);
    fs::write(&path, contents).map_err(|err| format!("Could not write export file: {err}"))?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn save_project_to_path(path: String, contents: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension != "ppstudio" {
        return Err("Only PPStudio project files can be overwritten.".to_string());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create project folder: {err}"))?;
    }

    fs::write(&path, contents).map_err(|err| format!("Could not save project file: {err}"))?;
    Ok(path.display().to_string())
}

fn downloads_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .map(|home| home.join("Downloads"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        env::var_os("HOME")
            .map(PathBuf::from)
            .map(|home| home.join("Downloads"))
    }
}

fn unique_path(dir: &Path, filename: &str) -> PathBuf {
    let original = Path::new(filename);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("drawing");
    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    let first = dir.join(filename);
    if !first.exists() {
        return first;
    }

    for index in 1..1000 {
        let candidate_name = if extension.is_empty() {
            format!("{stem}-{index}")
        } else {
            format!("{stem}-{index}.{extension}")
        };
        let candidate = dir.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(filename)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_export, save_project_to_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
