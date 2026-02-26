import { useState } from 'react';
import { X } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';
import { invoke } from '@tauri-apps/api/core';

interface FileInfo {
  filename: string;
  size: number;
  mimeType: string;
}

export function AddUrlDialog() {
  const { isAddDialogOpen, setAddDialogOpen } = useDownloadStore();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [savePath, setSavePath] = useState('');
  const [error, setError] = useState('');

  if (!isAddDialogOpen) return null;

  const handleFetchInfo = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    setError('');
    setFileInfo(null);

    try {
      const info = await invoke<FileInfo>('get_file_info', { url: url.trim() });
      setFileInfo(info);
      const downloadsPath = await invoke<string>('get_downloads_path');
      setSavePath(`${downloadsPath}\\${info.filename}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDownload = async () => {
    if (!url.trim() || !savePath.trim()) return;

    try {
      await invoke('start_download', { url: url.trim(), savePath: savePath.trim() });
      setUrl('');
      setFileInfo(null);
      setSavePath('');
      setAddDialogOpen(false);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleClose = () => {
    setUrl('');
    setFileInfo(null);
    setSavePath('');
    setError('');
    setAddDialogOpen(false);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Add New Download</span>
          <button className="btn" onClick={handleClose} style={{ float: 'right', border: 'none', background: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">URL</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter download URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !fileInfo && handleFetchInfo()}
            />
          </div>

          {!fileInfo && (
            <button className="btn btn-secondary" onClick={handleFetchInfo} disabled={isLoading || !url.trim()} style={{ width: '100%' }}>
              {isLoading ? 'Fetching...' : 'Get File Info'}
            </button>
          )}

          {error && (
            <div style={{ color: 'var(--error-color)', marginTop: 12, fontSize: 13 }}>{error}</div>
          )}

          {fileInfo && (
            <>
              <div className="file-info">
                <div className="file-info-row">
                  <span className="file-info-label">File Name:</span>
                  <span className="file-info-value">{fileInfo.filename}</span>
                </div>
                <div className="file-info-row">
                  <span className="file-info-label">Size:</span>
                  <span className="file-info-value">{formatSize(fileInfo.size)}</span>
                </div>
                <div className="file-info-row">
                  <span className="file-info-label">Type:</span>
                  <span className="file-info-value">{fileInfo.mimeType || 'Unknown'}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Save to</label>
                <input
                  type="text"
                  className="form-input"
                  value={savePath}
                  onChange={(e) => setSavePath(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
          {fileInfo && (
            <button className="btn btn-primary" onClick={handleStartDownload}>
              Start Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
