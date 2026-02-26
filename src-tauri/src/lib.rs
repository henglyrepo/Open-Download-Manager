pub mod download;
pub mod http;

use download::DownloadManager;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tracing::{error, info};

pub struct AppState {
    pub download_manager: Arc<Mutex<DownloadManager>>,
}

#[derive(Clone, serde::Serialize)]
pub struct FileInfo {
    pub filename: String,
    pub size: u64,
    pub mime_type: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ChunkProgress {
    pub id: u32,
    pub downloaded: u64,
    pub total: u64,
    pub speed: u64,
}

#[derive(Clone, serde::Serialize)]
pub struct DownloadEvent {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub filepath: String,
    pub total_size: u64,
    pub downloaded_size: u64,
    pub speed: u64,
    pub status: String,
    pub chunks: Vec<ChunkProgress>,
    pub resume_supported: bool,
}

#[tauri::command]
async fn get_file_info(url: String) -> Result<FileInfo, String> {
    info!("Getting file info for: {}", url);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .head(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let content_length = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let filename = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            if let Some(pos) = v.find("filename=") {
                let start = pos + 9;
                let end = v.len();
                let filename = &v[start..end];
                let filename = filename.trim_matches('"').trim_matches('\'');
                Some(filename.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| {
            url.split('/')
                .last()
                .unwrap_or("download")
                .split('?')
                .next()
                .unwrap_or("download")
                .to_string()
        });

    Ok(FileInfo {
        filename,
        size: content_length,
        mime_type: content_type,
    })
}

#[tauri::command]
async fn start_download(
    url: String,
    save_path: String,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("Starting download: {} -> {}", url, save_path);
    
    let download_manager = state.download_manager.clone();
    let mut manager = download_manager.lock().await;
    
    let id = uuid::Uuid::new_v4().to_string();
    let filename = std::path::Path::new(&save_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    
    let chunks = manager
        .start_download(id.clone(), url.clone(), save_path.clone())
        .await
        .map_err(|e| {
            error!("Failed to start download: {}", e);
            e.to_string()
        })?;

    let total_size = chunks.iter().map(|c| c.total()).sum();
    
    let event = DownloadEvent {
        id: id.clone(),
        url,
        filename,
        filepath: save_path,
        total_size,
        downloaded_size: 0,
        speed: 0,
        status: "downloading".to_string(),
        chunks: chunks
            .iter()
            .map(|c| ChunkProgress {
                id: c.id,
                downloaded: 0,
                total: c.total(),
                speed: 0,
            })
            .collect(),
        resume_supported: true,
    };

    app.emit("download-started", &event).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn pause_download(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Pausing download: {}", id);
    let manager = state.download_manager.lock().await;
    manager.pause_download(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_download(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Resuming download: {}", id);
    let manager = state.download_manager.lock().await;
    manager.resume_download(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_download(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Stopping download: {}", id);
    let manager = state.download_manager.lock().await;
    manager.stop_download(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_download(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    info!("Deleting download: {}", id);
    let manager = state.download_manager.lock().await;
    manager.delete_download(&id).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_downloads_path() -> Result<String, String> {
    Ok(dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.join("Downloads").to_string_lossy().to_string())
                .unwrap_or_else(|| "C:\\Downloads".to_string())
        }))
}

#[tauri::command]
async fn open_file_location(path: String) -> Result<(), String> {
    info!("Opening file location: {}", path);
    let path = std::path::Path::new(&path);
    let folder = path.parent().unwrap_or(path);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    info!("Opening file: {}", path);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn copy_to_clipboard(text: String) -> Result<(), String> {
    info!("Copying to clipboard");
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "echo", &text, "| clip"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
            .wait_with_output()
            .await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn browse_folder() -> Result<Option<String>, String> {
    info!("Opening folder browse dialog");
    // For now, return the downloads path - a full dialog would require additional Tauri plugins
    Ok(Some(dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "C:\\Downloads".to_string())))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .build(),
        )
        .setup(|app| {
            info!("Starting OpenDM...");
            
            let data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
            
            let download_manager = DownloadManager::new(app.handle().clone());
            
            app.manage(AppState {
                download_manager: Arc::new(Mutex::new(download_manager)),
            });
            
            info!("OpenDM started successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_file_info,
            start_download,
            pause_download,
            resume_download,
            stop_download,
            delete_download,
            get_downloads_path,
            open_file_location,
            open_file,
            copy_to_clipboard,
            browse_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
