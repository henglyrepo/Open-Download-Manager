import { useState, useEffect, useRef } from 'react';
import { X, Clipboard, FolderOpen, RefreshCw, CheckCircle, AlertCircle, FolderInput, Link2 } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';
import { invoke } from '@tauri-apps/api/core';

interface FileInfo {
  filename: string;
  size: number;
  mimeType: string;
  chunks?: number;
  resumeSupported?: boolean;
}

interface DownloadOptions {
  startImmediately: boolean;
  addToQueue: boolean;
  showInFolderWhenComplete: boolean;
  playSoundWhenComplete: boolean;
}

function validateUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDownloadableUrl(url: string): boolean {
  const extensions = [
    '.exe', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
    '.iso', '.dmg', '.deb', '.rpm', '.msi',
    '.apk', '.ipa', '.jar',
    '.json', '.xml', '.csv', '.txt',
  ];
  const lowerUrl = url.toLowerCase();
  return extensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('download');
}

export function AddUrlDialog() {
  const { isAddDialogOpen, setAddDialogOpen } = useDownloadStore();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [savePath, setSavePath] = useState('');
  const [error, setError] = useState('');
  const [isValidUrl, setIsValidUrl] = useState(false);
  const [options, setOptions] = useState<DownloadOptions>({
    startImmediately: true,
    addToQueue: false,
    showInFolderWhenComplete: false,
    playSoundWhenComplete: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAddDialogOpen) {
      // Auto-paste from clipboard when dialog opens
      handlePasteFromClipboard();
      // Focus the URL input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAddDialogOpen]);

  // Validate URL whenever it changes
  useEffect(() => {
    setIsValidUrl(validateUrl(url) && isDownloadableUrl(url));
  }, [url]);

  if (!isAddDialogOpen) return null;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (validateUrl(text) && isDownloadableUrl(text)) {
        setUrl(text.trim());
        // Auto-fetch info for valid URLs
        await handleFetchInfo(text.trim());
      }
    } catch (err) {
      // Clipboard access denied - that's okay
      console.log('Could not access clipboard');
    }
  };

  const handleFetchInfo = async (urlToFetch?: string) => {
    const targetUrl = urlToFetch || url.trim();
    if (!targetUrl) return;
    
    setIsLoading(true);
    setError('');
    setFileInfo(null);

    try {
      const info = await invoke<FileInfo>('get_file_info', { url: targetUrl });      // Determine chunk count based on file size
      let chunks = 4;
      if (info.size > 100 * 1024 * 1024) chunks = 8;
      if (info.size > 1024 * 1024 * 1024) chunks = 16;
      if (info.size > 5 * 1024 * 1024 * 1024) chunks = 32;
      
      setFileInfo({
        ...info,
        chunks,
        resumeSupported: true,
      });
      
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
      
      if (options.showInFolderWhenComplete) {
        // Store preference for later - could be handled in the completion event
        localStorage.setItem('opendm_showInFolderWhenComplete', 'true');
      }
      
      if (options.playSoundWhenComplete) {
        localStorage.setItem('opendm_playSoundWhenComplete', 'true');
      }
      
      handleClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleAddToQueue = async () => {
    if (!url.trim() || !savePath.trim()) return;

    try {
      await invoke('start_download', { url: url.trim(), savePath: savePath.trim() });
      handleClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleBrowse = async () => {
    try {
      const folder = await invoke<string>('get_downloads_path');
      // For now, we'll just use the downloads folder
      // A full file dialog would require additional Tauri plugins
      setSavePath(folder);
    } catch (err) {
      console.error('Failed to browse:', err);
    }
  };

  const handleClose = () => {
    setUrl('');
    setFileInfo(null);
    setSavePath('');
    setError('');
    setOptions({
      startImmediately: true,
      addToQueue: false,
      showInFolderWhenComplete: false,
      playSoundWhenComplete: false,
    });
    setAddDialogOpen(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const text = e.dataTransfer.getData('text/plain');
    if (text && validateUrl(text) && isDownloadableUrl(text)) {
      setUrl(text.trim());
      await handleFetchInfo(text.trim());
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatBytes = (bytes: number): string => {
    return bytes.toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal add-url-dialog" 
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minWidth: 550 }}
      >
        <div className="modal-header">
          <span>Add New Download</span>
          <button 
            className="btn" 
            onClick={handleClose} 
            style={{ float: 'right', border: 'none', background: 'none', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="modal-body">
          {/* Quick Actions */}
          <div className="quick-actions">
            <button 
              className="quick-action-btn" 
              onClick={handlePasteFromClipboard}
              title="Paste from clipboard"
            >
              <Clipboard size={16} />
              <span>Paste</span>
            </button>
            <div className={`drop-zone ${isDragging ? 'dragging' : ''}`} ref={dropZoneRef}>
              <FolderInput size={16} />
              <span>Drop URL here</span>
            </div>
          </div>

          {/* URL Input */}
          <div className="form-group">
            <div className="url-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="form-input"
                placeholder="Enter download URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !fileInfo && url.trim()) {
                    handleFetchInfo();
                  }
                }}
              />
              {url.trim() && (
                <span className={`url-validity ${isValidUrl ? 'valid' : 'invalid'}`}>
                  {isValidUrl ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                </span>
              )}
            </div>
            {!fileInfo && (
              <button 
                className="btn btn-secondary fetch-btn" 
                onClick={() => handleFetchInfo()} 
                disabled={isLoading || !url.trim()}
                style={{ width: '100%', marginTop: 8 }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Fetching...</span>
                  </>
                ) : (
                  <>
                    <Link2 size={16} />
                    <span>Get File Info</span>
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* File Info */}
          {fileInfo && (
            <>
              <div className="file-info-panel">
                <div className="file-info-header">
                  <span>File Information</span>
                  <button 
                    className="btn-icon" 
                    onClick={() => handleFetchInfo()}
                    title="Refresh"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <div className="file-info-grid">
                  <div className="file-info-item">
                    <span className="label">File Name:</span>
                    <span className="value" title={fileInfo.filename}>{fileInfo.filename}</span>
                  </div>
                  <div className="file-info-item">
                    <span className="label">File Size:</span>
                    <span className="value">{formatSize(fileInfo.size)} ({formatBytes(fileInfo.size)} bytes)</span>
                  </div>
                  <div className="file-info-item">
                    <span className="label">MIME Type:</span>
                    <span className="value">{fileInfo.mimeType || 'Unknown'}</span>
                  </div>
                  <div className="file-info-item">
                    <span className="label">Chunks:</span>
                    <span className="value">{fileInfo.chunks} (dynamic)</span>
                  </div>
                  <div className="file-info-item">
                    <span className="label">Resume:</span>
                    <span className="value success">{fileInfo.resumeSupported ? 'Supported ✓' : 'Not Supported'}</span>
                  </div>
                </div>
              </div>

              {/* Save Path */}
              <div className="form-group">
                <label className="form-label">Save to</label>
                <div className="save-path-wrapper">
                  <input
                    type="text"
                    className="form-input"
                    value={savePath}
                    onChange={(e) => setSavePath(e.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={handleBrowse}>
                    <FolderOpen size={16} />
                    Browse
                  </button>
                </div>
              </div>

              {/* Download Options */}
              <div className="download-options">
                <div className="options-header">Options</div>
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={options.startImmediately}
                    onChange={(e) => setOptions({ ...options, startImmediately: e.target.checked })}
                  />
                  <span>Start immediately after adding</span>
                </label>
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={options.addToQueue}
                    onChange={(e) => setOptions({ ...options, addToQueue: e.target.checked })}
                  />
                  <span>Add to queue instead of starting now</span>
                </label>
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={options.showInFolderWhenComplete}
                    onChange={(e) => setOptions({ ...options, showInFolderWhenComplete: e.target.checked })}
                  />
                  <span>Show in folder when completed</span>
                </label>
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={options.playSoundWhenComplete}
                    onChange={(e) => setOptions({ ...options, playSoundWhenComplete: e.target.checked })}
                  />
                  <span>Play sound when completed</span>
                </label>
              </div>
            </>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          {fileInfo && options.addToQueue ? (
            <button className="btn btn-secondary" onClick={handleAddToQueue}>
              Add to Queue
            </button>
          ) : fileInfo && (
            <button className="btn btn-primary" onClick={handleStartDownload}>
              Start Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
