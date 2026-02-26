use crate::ChunkProgress;

#[derive(Clone, Debug)]
pub struct Chunk {
    pub id: u32,
    pub start: u64,
    pub end: u64,
    pub downloaded: u64,
    pub speed: u64,
    pub state: ChunkState,
    pub url: String,
    pub filepath: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ChunkState {
    Pending,
    Downloading,
    Completed,
    Error,
}

impl Chunk {
    pub fn new(id: u32, start: u64, end: u64, filepath: String, url: String) -> Self {
        Self {
            id,
            start,
            end,
            downloaded: 0,
            speed: 0,
            state: ChunkState::Pending,
            url,
            filepath,
        }
    }

    pub fn total(&self) -> u64 {
        self.end - self.start + 1
    }

    pub fn progress(&self) -> f64 {
        if self.total() == 0 {
            return 0.0;
        }
        (self.downloaded as f64 / self.total() as f64) * 100.0
    }

    pub fn to_progress(&self) -> ChunkProgress {
        ChunkProgress {
            id: self.id,
            downloaded: self.downloaded,
            total: self.total(),
            speed: self.speed,
        }
    }
}
