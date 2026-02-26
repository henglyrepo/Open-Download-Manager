import { X, Pause, Play, Square } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';
import { invoke } from '@tauri-apps/api/core';

function formatSpeed(bytesPerSec: number | undefined | null): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  if (i < 0 || i >= sizes.length) return '0 B/s';
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i] + '/s';
}

function formatTime(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProgressDialog() {
  const { isProgressDialogOpen, setProgressDialogOpen, downloads, selectedId, updateDownload } = useDownloadStore();
  const download = downloads.find((d) => d.id === selectedId);

  if (!isProgressDialogOpen || !download) return null;

  const percent = download.totalSize > 0 ? Math.round((download.downloadedSize / download.totalSize) * 100) : 0;
  const eta = download.speed > 0 ? (download.totalSize - download.downloadedSize) / download.speed : 0;

  const handlePause = async () => {
    try {
      await invoke('pause_download', { id: download.id });
      updateDownload(download.id, { status: 'paused' });
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const handleResume = async () => {
    try {
      await invoke('resume_download', { id: download.id });
      updateDownload(download.id, { status: 'downloading' });
    } catch (err) {
      console.error('Failed to resume:', err);
    }
  };

  const handleStop = async () => {
    try {
      await invoke('stop_download', { id: download.id });
      updateDownload(download.id, { status: 'queued' });
      setProgressDialogOpen(false);
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  };

  const handleClose = () => {
    setProgressDialogOpen(false);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 500 }}>
        <div className="modal-header">
          <span>Downloading: {download.filename}</span>
          <button className="btn" onClick={handleClose} style={{ float: 'right', border: 'none', background: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 600 }}>{percent}%</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {formatSpeed(download.speed)}
              </span>
            </div>
            <div className="progress-bar" style={{ height: 10 }}>
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="chunk-list">
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
              Chunk Progress ({download.chunks.length} chunks)
            </div>
            {download.chunks.map((chunk, index) => {
              const chunkPercent = chunk.total > 0 ? Math.round((chunk.downloaded / chunk.total) * 100) : 0;
              return (
                <div key={chunk.id} className="chunk-item">
                  <span className="chunk-label">Chunk {index + 1}</span>
                  <div className="chunk-progress">
                    <div className="chunk-progress-fill" style={{ width: `${chunkPercent}%` }} />
                  </div>
                  <span className="chunk-percent">{chunkPercent}%</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 6 }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Speed: </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{formatSpeed(download.speed)}</span>
            </div>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ETA: </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{formatTime(eta)}</span>
            </div>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Resume: </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: download.resumeSupported ? 'var(--success-color)' : 'var(--error-color)' }}>
                {download.resumeSupported ? 'Supported' : 'Not Supported'}
              </span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {download.status === 'downloading' ? (
            <button className="btn btn-secondary" onClick={handlePause}>
              <Pause size={16} /> Pause
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleResume}>
              <Play size={16} /> Resume
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleStop}>
            <Square size={16} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
