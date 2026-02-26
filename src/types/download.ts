export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'error';

export interface ChunkProgress {
  id: number;
  downloaded: number;
  total: number;
  speed: number;
}

export interface Download {
  id: string;
  url: string;
  filename: string;
  filepath: string;
  totalSize: number;
  downloadedSize: number;
  speed: number;
  status: DownloadStatus;
  chunks: ChunkProgress[];
  createdAt: string;
  completedAt?: string;
  error?: string;
  resumeSupported: boolean;
}

export interface DownloadCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

export type CategoryFilter = 'all' | 'downloading' | 'completed' | 'queued' | 'scheduled';
