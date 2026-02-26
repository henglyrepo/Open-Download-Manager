mod chunk;
mod scheduler;

pub use chunk::{Chunk, ChunkState};
pub use scheduler::Scheduler;

use crate::{ChunkProgress, DownloadEvent};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

#[derive(Debug)]
pub enum DownloadError {
    NotFound(String),
    IoError(std::io::Error),
    HttpError(reqwest::Error),
    AlreadyExists(String),
    InvalidState(String),
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadError::NotFound(s) => write!(f, "Download not found: {}", s),
            DownloadError::IoError(e) => write!(f, "IO error: {}", e),
            DownloadError::HttpError(e) => write!(f, "HTTP error: {}", e),
            DownloadError::AlreadyExists(s) => write!(f, "Download already exists: {}", s),
            DownloadError::InvalidState(s) => write!(f, "Invalid state: {}", s),
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
}

#[derive(Clone, Debug, PartialEq)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Error,
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
        
        let _accept_ranges = response
            .headers()
            .get("accept-ranges")
            .and_then(|v| v.to_str().ok())
            .map(|v| v == "bytes")
            .unwrap_or(false);

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
                        Self::download_chunk(&app_clone, downloads_clone, id_clone, chunk_id).await;
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
            if task.status == DownloadStatus::Downloading {
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
                        downloaded: c.end - c.start + 1,
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

    async fn download_chunk(
        app: &AppHandle,
        downloads: Arc<RwLock<HashMap<String, DownloadTask>>>,
        id: String,
        chunk_id: u32,
    ) {
        let chunk_info = {
            let downloads_read = downloads.read().await;
            downloads_read.get(&id).and_then(|t| {
                t.chunks.iter().find(|c| c.id == chunk_id).map(|c| {
                    (c.start, c.end, c.url.clone(), c.filepath.clone(), c.downloaded)
                })
            })
        };

        if let Some((start, end, url, filepath, already_downloaded)) = chunk_info {
            if already_downloaded >= end - start + 1 {
                tracing::info!("Chunk {} already complete", chunk_id);
                return;
            }

            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Failed to create HTTP client: {}", e);
                    return;
                }
            };

            let range_header = if already_downloaded > 0 {
                format!("bytes={}-{}", start + already_downloaded, end)
            } else {
                format!("bytes={}-{}", start, end)
            };

            let request = client.get(&url).header("Range", range_header);
            
            match request.send().await {
                Ok(response) => {
                    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                        tracing::error!("HTTP error: {}", response.status());
                        return;
                    }
                    
                    let filepath_with_chunk = format!("{}.chunk_{}", filepath, chunk_id);
                    
                    let mut file = match tokio::fs::OpenOptions::new()
                        .create(true)
                        .append(already_downloaded > 0)
                        .write(true)
                        .open(&filepath_with_chunk)
                        .await
                    {
                        Ok(f) => f,
                        Err(e) => {
                            tracing::error!("Failed to open file: {}", e);
                            return;
                        }
                    };

                    let mut stream = response.bytes_stream();
                    let mut downloaded: u64 = already_downloaded;
                    let mut last_update = std::time::Instant::now();
                    let mut bytes_since_last_update: u64 = 0;

                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(data) => {
                                if let Err(e) = file.write_all(&data).await {
                                    tracing::error!("Failed to write to file: {}", e);
                                    break;
                                }
                                
                                downloaded += data.len() as u64;
                                bytes_since_last_update += data.len() as u64;
                                
                                let now = std::time::Instant::now();
                                let elapsed = now.duration_since(last_update).as_secs_f64();
                                
                                if elapsed >= 0.5 {
                                    let speed = (bytes_since_last_update as f64 / elapsed) as u64;
                                    
                                    {
                                        let mut downloads_write = downloads.write().await;
                                        if let Some(task) = downloads_write.get_mut(&id) {
                                            if let Some(chunk) = task.chunks.iter_mut().find(|c| c.id == chunk_id) {
                                                chunk.downloaded = downloaded;
                                                chunk.speed = speed;
                                                chunk.state = ChunkState::Downloading;
                                            }
                                            
                                            let total_downloaded: u64 = task.chunks.iter().map(|c| c.downloaded).sum();
                                            let total_speed: u64 = task.chunks.iter().map(|c| c.speed).sum::<u64>() / task.chunks.len() as u64;
                                            
                                            task.downloaded = total_downloaded;
                                            task.speed = total_speed;
                                            
                                            let event = DownloadEvent {
                                                id: id.clone(),
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
                                    
                                    last_update = now;
                                    bytes_since_last_update = 0;
                                }
                            }
                            Err(e) => {
                                tracing::error!("Stream error: {}", e);
                                break;
                            }
                        }
                    }
                    
                    {
                        let mut downloads_write = downloads.write().await;
                        if let Some(task) = downloads_write.get_mut(&id) {
                            if let Some(chunk) = task.chunks.iter_mut().find(|c| c.id == chunk_id) {
                                chunk.state = ChunkState::Completed;
                            }
                        }
                    }
                    
                    tracing::info!("Chunk {} completed", chunk_id);
                }
                Err(e) => {
                    tracing::error!("Request failed: {}", e);
                }
            }
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
            }
        }
        
        tracing::info!("Merge completed: {}", filepath);
        Ok(())
    }

    pub async fn pause_download(&self, id: &str) -> Result<(), DownloadError> {
        let mut downloads = self.downloads.write().await;
        if let Some(task) = downloads.get_mut(id) {
            if task.status == DownloadStatus::Downloading {
                task.status = DownloadStatus::Paused;
                tracing::info!("Download paused: {}", id);
            }
        }
        Ok(())
    }

    pub async fn resume_download(&self, id: &str) -> Result<(), DownloadError> {
        let should_resume = {
            let downloads = self.downloads.read().await;
            if let Some(task) = downloads.get(id) {
                task.status == DownloadStatus::Paused || task.status == DownloadStatus::Queued
            } else {
                false
            }
        };
        
        if should_resume {
            let mut downloads = self.downloads.write().await;
            if let Some(task) = downloads.get_mut(id) {
                task.status = DownloadStatus::Downloading;
            }
            tracing::info!("Download resumed: {}", id);
        }
        Ok(())
    }

    pub async fn stop_download(&self, id: &str) -> Result<(), DownloadError> {
        let mut downloads = self.downloads.write().await;
        if let Some(task) = downloads.get_mut(id) {
            task.status = DownloadStatus::Queued;
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
            }
        }
        
        let mut downloads = self.downloads.write().await;
        downloads.remove(id);
        
        tracing::info!("Download deleted: {}", id);
        Ok(())
    }
}

use futures::stream::StreamExt;
use tokio::io::AsyncWriteExt;
