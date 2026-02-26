pub mod db {
    use crate::DownloadEvent;
    use rusqlite::{Connection, params};
    use std::path::Path;
    use thiserror::Error;
    use tokio::task;
    use tracing::info;

    #[derive(Error, Debug)]
    pub enum DbError {
        #[error("SQLite error: {0}")]
        Sqlite(#[from] rusqlite::Error),
        #[error("IO error: {0}")]
        Io(#[from] std::io::Error),
    }

    pub struct Database {
        conn: Connection,
    }

    impl Database {
        pub fn new(path: &Path) -> Result<Self, DbError> {
            let conn = Connection::open(path)?;
            
            conn.execute(
                "CREATE TABLE IF NOT EXISTS downloads (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    filepath TEXT NOT NULL,
                    total_size INTEGER NOT NULL,
                    downloaded_size INTEGER NOT NULL,
                    speed INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    resume_supported INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )",
                [],
            )?;

            conn.execute(
                "CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT NOT NULL,
                    chunk_id INTEGER NOT NULL,
                    start_pos INTEGER NOT NULL,
                    end_pos INTEGER NOT NULL,
                    downloaded INTEGER NOT NULL,
                    PRIMARY KEY (id, chunk_id),
                    FOREIGN KEY (id) REFERENCES downloads(id)
                )",
                [],
            )?;

            info!("Database initialized at {:?}", path);
            
            Ok(Self { conn })
        }

        pub async fn insert_download(&self, id: &str, event: &DownloadEvent) -> Result<(), DbError> {
            let id = id.to_string();
            let url = event.url.clone();
            let filename = event.filename.clone();
            let filepath = event.filepath.clone();
            let total_size = event.total_size as i64;
            let downloaded_size = event.downloaded_size as i64;
            let speed = event.speed as i64;
            let status = event.status.clone();
            let resume_supported = if event.resume_supported { 1 } else { 0 };
            let created_at = chrono::Utc::now().to_rfc3339();
            
            task::spawn_blocking(move || {
                let conn = Connection::open(format!("{}/downloads.db", std::env::temp_dir().to_string_lossy()))?;
                conn.execute(
                    "INSERT OR REPLACE INTO downloads (id, url, filename, filepath, total_size, downloaded_size, speed, status, resume_supported, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![id, url, filename, filepath, total_size, downloaded_size, speed, status, resume_supported, created_at],
                )?;
                Ok::<(), DbError>(())
            }).await.map_err(|e| DbError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
            
            Ok(())
        }

        pub async fn delete_download(&self, id: &str) -> Result<(), DbError> {
            let id = id.to_string();
            
            task::spawn_blocking(move || {
                let conn = Connection::open(format!("{}/downloads.db", std::env::temp_dir().to_string_lossy()))?;
                conn.execute("DELETE FROM chunks WHERE id = ?1", params![id])?;
                conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
                Ok::<(), DbError>(())
            }).await.map_err(|e| DbError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
            
            Ok(())
        }

        pub async fn get_all_downloads(&self) -> Result<Vec<DownloadEvent>, DbError> {
            task::spawn_blocking(|| {
                let conn = Connection::open(format!("{}/downloads.db", std::env::temp_dir().to_string_lossy()))?;
                let mut stmt = conn.prepare(
                    "SELECT id, url, filename, filepath, total_size, downloaded_size, speed, status, resume_supported FROM downloads"
                )?;
                
                let downloads = stmt.query_map([], |row| {
                    Ok(DownloadEvent {
                        id: row.get(0)?,
                        url: row.get(1)?,
                        filename: row.get(2)?,
                        filepath: row.get(3)?,
                        total_size: row.get::<_, i64>(4)? as u64,
                        downloaded_size: row.get::<_, i64>(5)? as u64,
                        speed: row.get::<_, i64>(6)? as u64,
                        status: row.get(7)?,
                        resume_supported: row.get::<_, i32>(8)? != 0,
                        chunks: vec![],
                    })
                })?.collect::<Result<Vec<_>, _>>()?;
                
                Ok(downloads)
            }).await.map_err(|e| DbError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?
        }
    }
}
