mod chunk;
mod scheduler;

pub use chunk::{Chunk, ChunkState};
pub use scheduler::Scheduler;

use crate::{ChunkProgress, DownloadEvent};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};

#[derive(Debug)]
pub enum DownloadError {
    NotFound(String),
    IoError(std::io::Error),
    HttpError(reqwest::Error),
    HttpStatus(u16),
    AlreadyExists(String),
    InvalidState(String),
    Cancelled,
    MaxRetriesExceeded,
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadError::NotFound(s) => write!(f, "Download not found: {}", s),
            DownloadError::IoError(e) => write!(f, "IO error: {}", e),
            DownloadError::HttpError(e) => write!(f, "HTTP error: {}", e),
            DownloadError::HttpStatus(code) => write!(f, "HTTP error: {}", code),
            DownloadError::AlreadyExists(s) => write!(f, "Download already exists: {}", s),
            DownloadError::InvalidState(s) => write!(f, "Invalid state: {}", s),
            DownloadError::Cancelled => write!(f, "Download cancelled"),
            DownloadError::MaxRetriesExceeded => write!(f, "Max retries exceeded"),
        }
    }
}

impl std::error::Error for DownloadError {}

impl From<std::io::Error> for DownloadError {
    fn from(e: std::io::Error) -> Self {
        DownloadError::IoError(e)
    }
}

impl From<reqwest::Error> for DownloadError {
    fn from(e: reqwest::Error) -> Self {
        DownloadError::HttpError(e)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Error,
}

#[derive(Clone, Debug)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub filepath: String,
    pub chunks: Vec<Chunk>,
    pub total_size: u64,
    pub downloaded: u64,
    pub speed: u64,
    pub status: DownloadStatus,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub is_cancelled: Arc<AtomicBool>,
}

pub struct DownloadManager {
    app: AppHandle,
    downloads: Arc<RwLock<HashMap<String, DownloadTask>>>,
}

impl DownloadManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            downloads: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_download(
        &mut self,
        id: String,
        url: String,
        filepath: String,
    ) -> Result<Vec<Chunk>, DownloadError> {
        tracing::info!("Starting download: {} -> {}", url, filepath);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()?;

        let response = client.head(&url).send().await?;

        let total_size = response
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        if total_size == 0 {
            return Err(DownloadError::InvalidState("File size is 0 or unknown".to_string()));
        }

        let num_chunks = Self::calculate_chunk_count(total_size);
        let chunk_size = total_size / num_chunks as u64;

        let mut chunks = Vec::new();
        for i in 0..num_chunks {
            let start = i as u64 * chunk_size;
            let end = if i == num_chunks - 1 {
                total_size - 1
            } else {
                start + chunk_size - 1
            };
            
            chunks.push(Chunk::new(
                i as u32,
                start,
                end,
                filepath.clone(),
                url.clone(),
            ));
        }

        let task = DownloadTask {
            id: id.clone(),
            url: url.clone(),
            filepath: filepath.clone(),
            chunks: chunks.clone(),
            total_size,
            downloaded: 0,
            speed: 0,
            status: DownloadStatus::Downloading,
            error_message: None,
            retry_count: 0,
            is_cancelled: Arc::new(AtomicBool::new(false)),
        };

        {
            let mut downloads = self.downloads.write().await;
            downloads.insert(id.clone(), task);
        }

        let app = self.app.clone();
        let downloads = self.downloads.clone();
        let id_clone = id.clone();
        
        tokio::spawn(async move {
            Self::download_chunks(&app, downloads, id_clone).await;
        });

        Ok(chunks)
    }

    fn calculate_chunk_count(file_size: u64) -> usize {
        if file_size < 1024 * 1024 * 10 {
            4
        } else if file_size < 1024 * 1024 * 100 {
            8
        } else if file_size < 1024 * 1024 * 1024 {
            16
        } else {
            32
        }
    }

    async fn download_chunks(app: &AppHandle, downloads: Arc<RwLock<HashMap<String, DownloadTask>>>, id: String) {
        let mut handles = Vec::new();
        
        {
            let downloads_read = downloads.read().await;
            if let Some(task) = downloads_read.get(&id) {
                for chunk in &task.chunks {
                    let downloads_clone = downloads.clone();
                    let id_clone = id.clone();
                    let chunk_id = chunk.id;
                    let app_clone = app.clone();
                    
                    let handle = tokio::spawn(async move {
                        Self::download_chunk_with_retry(&app_clone, downloads_clone, id_clone, chunk_id).await;
                    });
                    handles.push(handle);
                }
            }
        }
        
        for handle in handles {
            let _ = handle.await;
        }

        let downloads_read = downloads.read().await;
        if let Some(task) = downloads_read.get(&id) {
            if task.status == DownloadStatus::Downloading && !task.is_cancelled.load(Ordering::SeqCst) {
                tracing::info!("Download completed: {}", id);
                
                if let Err(e) = Self::merge_chunks(&task.filepath, &task.chunks).await {
                    tracing::error!("Failed to merge chunks: {:?}", e);
                }
                
                let event = DownloadEvent {
                    id: id.clone(),
                    url: task.url.clone(),
                    filename: std::path::Path::new(&task.filepath)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    filepath: task.filepath.clone(),
                    total_size: task.total_size,
                    downloaded_size: task.total_size,
                    speed: 0,
                    status: "completed".to_string(),
                    chunks: task.chunks.iter().map(|c| ChunkProgress {
                        id: c.id,
                        downloaded: c.downloaded,
                        total: c.end - c.start + 1,
                        speed: 0,
                    }).collect(),
                    resume_supported: true,
                };
                
                let _ = app.emit("download-complete", &event);
                
                let mut downloads_write = downloads.write().await;
                if let Some(task) = downloads_write.get_mut(&id) {
                    task.status = DownloadStatus::Completed;
                    task.downloaded = task.total_size;
                }
            }
        }
    }

    async fn download_chunk_with_retry(
        app: &AppHandle,
        downloads: Arc<RwLock<HashMap<String, DownloadTask>>>,
        id: String,
        chunk_id: u32,
    ) {
        const MAX_RETRIES: u32 = 5;
        const INITIAL_BACKOFF_MS: u64 = 1000;
        const MAX_BACKOFF_MS: u64 = 60000;

        let mut retry_count = 0;
        let mut backoff = INITIAL_BACKOFF_MS;

        loop {
            // Check if cancelled
            {
                let downloads_read = downloads.read().await;
                if let Some(task) = downloads_read.get(&id) {
                    if task.is_cancelled.load(Ordering::SeqCst) {
                        tracing::info!("Chunk {} cancelled", chunk_id);
                        return;
                    }
                }
            }

            match Self::download_single_chunk(app, &downloads, &id, chunk_id).await {
                Ok(()) => {
                    tracing::info!("Chunk {} completed successfully", chunk_id);
                    return;
                }
                Err(e) => {
                    retry_count += 1;
                    tracing::warn!("Chunk {} error (attempt {}): {:?}", chunk_id, retry_count, e);
                    
                    if retry_count >= MAX_RETRIES {
                        tracing::error!("Chunk {} max retries exceeded", chunk_id);
                        
                        let mut downloads_write = downloads.write().await;
                        if let Some(task) = downloads_write.get_mut(&id) {
                            task.status = DownloadStatus::Error;
                            task.error_message = Some(format!("Max retries exceeded: {}", e));
                            
                            let _ = app.emit("download-error", serde_json::json!({
                                "id": id,
                                "error": format!("Chunk {} failed after {} retries: {}", chunk_id, MAX_RETRIES, e)
                            }));
                        }
                        return;
                    }

                    // Exponential backoff
                    tracing::info!("Retrying chunk {} in {}ms", chunk_id, backoff);
                    sleep(Duration::from_millis(backoff)).await;
                    backoff = (backoff * 2).min(MAX_BACKOFF_MS);
                }
            }
        }
    }

    async fn download_single_chunk(
        app: &AppHandle,
        downloads: &Arc<RwLock<HashMap<String, DownloadTask>>>,
        id: &str,
        chunk_id: u32,
    ) -> Result<(), DownloadError> {
        let chunk_info = {
            let downloads_read = downloads.read().await;
            downloads_read.get(id).and_then(|t| {
                t.chunks.iter().find(|c| c.id == chunk_id).map(|c| {
                    (c.start, c.end, c.url.clone(), c.filepath.clone(), c.downloaded)
                })
            })
        };

        if let Some((start, end, url, filepath, already_downloaded)) = chunk_info {
            if already_downloaded >= end - start + 1 {
                tracing::info!("Chunk {} already complete", chunk_id);
                return Ok(());
            }

            // Check cancellation before starting
            {
                let downloads_read = downloads.read().await;
                if let Some(task) = downloads_read.get(id) {
                    if task.is_cancelled.load(Ordering::SeqCst) {
                        return Err(DownloadError::Cancelled);
                    }
                }
            }

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()?;

            let range_header = if already_downloaded > 0 {
                format!("bytes={}-{}", start + already_downloaded, end)
            } else {
                format!("bytes={}-{}", start, end)
            };

            let request = client.get(&url).header("Range", range_header);
            
            match request.send().await {
                Ok(response) => {
                    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                        let status = response.status().as_u16();
                        return Err(DownloadError::HttpStatus(status));
                    }
                    
                    let filepath_with_chunk = format!("{}.chunk_{}", filepath, chunk_id);
                    
                    let mut file = tokio::fs::OpenOptions::new()
                        .create(true)
                        .append(already_downloaded > 0)
                        .write(true)
                        .open(&filepath_with_chunk)
                        .await?;

                    let mut stream = response.bytes_stream();
                    let mut downloaded: u64 = already_downloaded;
                    let mut last_update = std::time::Instant::now();
                    let mut bytes_since_last_update: u64 = 0;
                    let mut last_save = std::time::Instant::now();

                    while let Some(chunk_result) = stream.next().await {
                        // Check cancellation periodically
                        {
                            let downloads_read = downloads.read().await;
                            if let Some(task) = downloads_read.get(id) {
                                if task.is_cancelled.load(Ordering::SeqCst) {
                                    tracing::info!("Chunk {} cancelled during download", chunk_id);
                                    return Err(DownloadError::Cancelled);
                                }
                            }
                        }

                        match chunk_result {
                            Ok(data) => {
                                if let Err(e) = file.write_all(&data).await {
                                    tracing::error!("Failed to write to file: {}", e);
                                    return Err(DownloadError::IoError(e));
                                }
                                
                                downloaded += data.len() as u64;
                                bytes_since_last_update += data.len() as u64;
                                
                                let now = std::time::Instant::now();
                                let elapsed = now.duration_since(last_update).as_secs_f64();
                                let save_elapsed = now.duration_since(last_save).as_secs_f64();
                                
                                if elapsed >= 0.5 {
                                    let speed = (bytes_since_last_update as f64 / elapsed) as u64;
                                    
                                    Self::update_progress(app, downloads, id, chunk_id, downloaded, speed).await;
                                    
                                    last_update = now;
                                    bytes_since_last_update = 0;
                                }

                                // Save progress every 5 seconds for crash safety
                                if save_elapsed >= 5.0 {
                                    Self::save_progress_to_file(id, chunk_id, downloaded, &filepath_with_chunk).await;
                                    last_save = now;
                                }
                            }
                            Err(e) => {
                                tracing::error!("Stream error: {}", e);
                                return Err(DownloadError::HttpError(e));
                            }
                        }
                    }

                    // Final save on completion
                    Self::save_progress_to_file(id, chunk_id, downloaded, &filepath_with_chunk).await;
                    
                    // Update chunk state
                    {
                        let mut downloads_write = downloads.write().await;
                        if let Some(task) = downloads_write.get_mut(id) {
                            if let Some(chunk) = task.chunks.iter_mut().find(|c| c.id == chunk_id) {
                                chunk.downloaded = downloaded;
                                chunk.state = ChunkState::Completed;
                            }
                        }
                    }
                    
                    tracing::info!("Chunk {} completed", chunk_id);
                    Ok(())
                }
                Err(e) => {
                    tracing::error!("Request failed: {}", e);
                    Err(DownloadError::HttpError(e))
                }
            }
        } else {
            Err(DownloadError::NotFound(format!("Chunk {} not found", chunk_id)))
        }
    }

    async fn update_progress(
        app: &AppHandle,
        downloads: &Arc<RwLock<HashMap<String, DownloadTask>>>,
        id: &str,
        chunk_id: u32,
        downloaded: u64,
        speed: u64,
    ) {
        let mut downloads_write = downloads.write().await;
        if let Some(task) = downloads_write.get_mut(id) {
            if let Some(chunk) = task.chunks.iter_mut().find(|c| c.id == chunk_id) {
                chunk.downloaded = downloaded;
                chunk.speed = speed;
                chunk.state = ChunkState::Downloading;
            }
            
            let total_downloaded: u64 = task.chunks.iter().map(|c| c.downloaded).sum();
            let total_speed: u64 = task.chunks.iter().map(|c| c.speed).sum::<u64>() / task.chunks.len().max(1) as u64;
            
            task.downloaded = total_downloaded;
            task.speed = total_speed;
            
            let event = DownloadEvent {
                id: id.to_string(),
                url: task.url.clone(),
                filename: std::path::Path::new(&task.filepath)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                filepath: task.filepath.clone(),
                total_size: task.total_size,
                downloaded_size: total_downloaded,
                speed: total_speed,
                status: "downloading".to_string(),
                chunks: task.chunks.iter().map(|c| ChunkProgress {
                    id: c.id,
                    downloaded: c.downloaded,
                    total: c.end - c.start + 1,
                    speed: c.speed,
                }).collect(),
                resume_supported: true,
            };
            
            let _ = app.emit("download-progress", &event);
        }
    }

    async fn save_progress_to_file(id: &str, chunk_id: u32, downloaded: u64, filepath: &str) {
        // Save progress to a .progress file
        let progress_file = format!("{}.progress_{}", filepath, chunk_id);
        let progress_data = format!("{}:{}\n", id, downloaded);
        let _ = tokio::fs::write(&progress_file, progress_data).await;
        tracing::debug!("Saved progress for chunk {}: {} bytes", chunk_id, downloaded);
    }

    pub async fn load_progress_from_file(filepath: &str, chunk_id: u32) -> u64 {
        let progress_file = format!("{}.progress_{}", filepath, chunk_id);
        match tokio::fs::read_to_string(&progress_file).await {
            Ok(data) => {
                let parts: Vec<&str> = data.trim().split(':').collect();
                if parts.len() == 2 {
                    parts[1].parse::<u64>().unwrap_or(0)
                } else {
                    0
                }
            }
            Err(_) => 0,
        }
    }

    async fn merge_chunks(filepath: &str, chunks: &[Chunk]) -> Result<(), DownloadError> {
        tracing::info!("Merging chunks to: {}", filepath);
        
        let mut output_file = tokio::fs::File::create(filepath).await?;
        
        let mut chunk_files: Vec<_> = chunks.iter().map(|c| {
            format!("{}.chunk_{}", filepath, c.id)
        }).collect();
        
        chunk_files.sort_by(|a, b| {
            let a_id = a.rsplit('_').next().unwrap_or("0").parse::<u32>().unwrap_or(0);
            let b_id = b.rsplit('_').next().unwrap_or("0").parse::<u32>().unwrap_or(0);
            a_id.cmp(&b_id)
        });
        
        for chunk_file in chunk_files {
            if let Ok(data) = tokio::fs::read(&chunk_file).await {
                output_file.write_all(&data).await?;
                let _ = tokio::fs::remove_file(&chunk_file).await;
                
                // Also remove progress file
                let progress_file = format!("{}.progress", chunk_file);
                let _ = tokio::fs::remove_file(&progress_file).await;
            }
        }
        
        tracing::info!("Merge completed: {}", filepath);
        Ok(())
    }

    pub async fn pause_download(&self, id: &str) -> Result<(), DownloadError> {
        let mut downloads = self.downloads.write().await;
        if let Some(task) = downloads.get_mut(id) {
            if task.status == DownloadStatus::Downloading {
                // Set cancellation flag
                task.is_cancelled.store(true, Ordering::SeqCst);
                task.status = DownloadStatus::Paused;
                
                // Save current progress
                for chunk in &task.chunks {
                    let filepath_with_chunk = format!("{}.chunk_{}", task.filepath, chunk.id);
                    Self::save_progress_to_file(id, chunk.id, chunk.downloaded, &filepath_with_chunk).await;
                }
                
                tracing::info!("Download paused: {}", id);
            }
        }
        Ok(())
    }

    pub async fn resume_download(&self, id: &str) -> Result<(), DownloadError> {
        let should_resume = {
            let downloads = self.downloads.read().await;
            if let Some(task) = downloads.get(id) {
                task.status == DownloadStatus::Paused
            } else {
                false
            }
        };
        
        if should_resume {
            let mut downloads = self.downloads.write().await;
            if let Some(task) = downloads.get_mut(id) {
                // Reset cancellation flag
                task.is_cancelled.store(false, Ordering::SeqCst);
                task.status = DownloadStatus::Downloading;
                task.error_message = None;
                
                // Reset chunk states for incomplete chunks
                for chunk in &mut task.chunks {
                    if chunk.downloaded < chunk.end - chunk.start + 1 {
                        chunk.state = ChunkState::Pending;
                    }
                }
            }
            
            let downloads = self.downloads.clone();
            let id = id.to_string();
            let app = self.app.clone();
            
            tracing::info!("Download resumed: {}", id);
            
            tokio::spawn(async move {
                Self::download_chunks(&app, downloads, id).await;
            });
        }
        Ok(())
    }

    pub async fn stop_download(&self, id: &str) -> Result<(), DownloadError> {
        let mut downloads = self.downloads.write().await;
        if let Some(task) = downloads.get_mut(id) {
            task.is_cancelled.store(true, Ordering::SeqCst);
            task.status = DownloadStatus::Queued;
            
            // Save progress before stopping
            for chunk in &task.chunks {
                let filepath_with_chunk = format!("{}.chunk_{}", task.filepath, chunk.id);
                Self::save_progress_to_file(id, chunk.id, chunk.downloaded, &filepath_with_chunk).await;
            }
            
            tracing::info!("Download stopped: {}", id);
        }
        Ok(())
    }

    pub async fn delete_download(&self, id: &str) -> Result<(), DownloadError> {
        let filepath = {
            let downloads = self.downloads.read().await;
            downloads.get(id).map(|t| t.filepath.clone())
        };
        
        if let Some(filepath) = filepath {
            let _ = tokio::fs::remove_file(&filepath).await;
            
            for i in 0..32 {
                let chunk_file = format!("{}.chunk_{}", filepath, i);
                let _ = tokio::fs::remove_file(&chunk_file).await;
                
                let progress_file = format!("{}.progress_{}", filepath, i);
                let _ = tokio::fs::remove_file(&progress_file).await;
            }
        }
        
        let mut downloads = self.downloads.write().await;
        downloads.remove(id);
        
        tracing::info!("Download deleted: {}", id);
        Ok(())
    }

    pub async fn get_downloads(&self) -> Vec<DownloadTask> {
        let downloads = self.downloads.read().await;
        downloads.values().cloned().collect()
    }

    pub async fn add_download(&self, task: DownloadTask) {
        let mut downloads = self.downloads.write().await;
        downloads.insert(task.id.clone(), task);
    }
}

use futures::stream::StreamExt;
use tokio::io::AsyncWriteExt;
