import { useState } from 'react';
import { ArrowDownCircle, CheckCircle, PauseCircle, Clock, XCircle } from 'lucide-react';
import { useDownloadStore, selectDownloadsByCategory } from '../stores/downloadStore';
import { Download } from '../types/download';
import { ContextMenu } from './ContextMenu';
import { invoke } from '@tauri-apps/api/core';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  return formatFileSize(bytesPerSec) + '/s';
}

function formatPercent(downloaded: number, total: number): string {
  if (total === 0) return '0%';
  return Math.round((downloaded / total) * 100) + '%';
}

function formatETA(seconds: number, speed: number): string {
  if (speed <= 0 || seconds <= 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSizeDetail(downloaded: number, total: number): string {
  if (total === 0) return '-';
  return `${formatFileSize(downloaded)} / ${formatFileSize(total)}`;
}

function getStatusIcon(status: Download['status']) {
  switch (status) {
    case 'downloading':
      return <ArrowDownCircle className="status-icon downloading" size={18} />;
    case 'completed':
      return <CheckCircle className="status-icon completed" size={18} />;
    case 'paused':
      return <PauseCircle className="status-icon paused" size={18} />;
    case 'error':
      return <XCircle className="status-icon error" size={18} />;
    default:
      return <Clock className="status-icon" size={18} />;
  }
}

function getStatusText(status: Download['status']): string {
  switch (status) {
    case 'downloading':
      return 'Downloading';
    case 'completed':
      return 'Completed';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Error';
    case 'queued':
      return 'Queued';
    default:
      return 'Unknown';
  }
}

interface DownloadRowProps {
  download: Download;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function DownloadRow({ download, index, isSelected, onClick, onDoubleClick, onContextMenu }: DownloadRowProps) {
  const percent = formatPercent(download.downloadedSize, download.totalSize);
  const eta = download.speed > 0 ? (download.totalSize - download.downloadedSize) / download.speed : 0;

  return (
    <tr
      className={`download-row ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{index + 1}</td>
      <td>{getStatusIcon(download.status)}</td>
      <td className="filename-cell" title={download.filename}>{download.filename}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {download.status === 'downloading' || download.status === 'paused' ? (
          <span>{formatSizeDetail(download.downloadedSize, download.totalSize)}</span>
        ) : download.status === 'completed' ? (
          <span>{formatFileSize(download.totalSize)}</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>
      <td className="progress-cell">
        {download.status === 'downloading' || download.status === 'paused' ? (
          <>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: percent }} />
            </div>
            <div className="progress-text">{percent}</div>
          </>
        ) : download.status === 'completed' ? (
          <span style={{ color: 'var(--success-color)' }}>100%</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>
      <td>
        {download.status === 'downloading' ? (
          <span className="speed-value">{formatSpeed(download.speed)}</span>
        ) : download.status === 'paused' ? (
          <span style={{ color: 'var(--warning-color)' }}>Paused</span>
        ) : download.status === 'completed' ? (
          <span style={{ color: 'var(--text-secondary)' }}>-</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {download.status === 'downloading' ? (
          <span>ETA: {formatETA(eta, download.speed)}</span>
        ) : download.status === 'paused' ? (
          <span style={{ color: 'var(--warning-color)' }}>Paused</span>
        ) : download.status === 'completed' ? (
          <span style={{ color: 'var(--success-color)' }}>Done</span>
        ) : download.status === 'error' ? (
          <span style={{ color: 'var(--error-color)' }}>Failed</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>Waiting</span>
        )}
      </td>
      <td>
        <span className={`status-text ${download.status}`}>{getStatusText(download.status)}</span>
      </td>
    </tr>
  );
}

export function DownloadList() {
  const { downloads, category, selectedId, setSelectedId, setProgressDialogOpen, updateDownload, removeDownload } = useDownloadStore();
  const filteredDownloads = selectDownloadsByCategory(downloads, category);
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    download: Download;
  } | null>(null);

  const handleRowClick = (id: string) => {
    setSelectedId(id);
  };

  const handleRowDoubleClick = (download: Download) => {
    setSelectedId(download.id);
    if (download.status === 'downloading' || download.status === 'paused') {
      setProgressDialogOpen(true);
    } else if (download.status === 'completed') {
      handleOpenFile(download);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, download: Download) => {
    e.preventDefault();
    setSelectedId(download.id);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      download,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleStart = async () => {
    if (!contextMenu) return;
    try {
      await invoke('resume_download', { id: contextMenu.download.id });
      updateDownload(contextMenu.download.id, { status: 'downloading' });
    } catch (err) {
      console.error('Failed to start:', err);
    }
  };

  const handlePause = async () => {
    if (!contextMenu) return;
    try {
      await invoke('pause_download', { id: contextMenu.download.id });
      updateDownload(contextMenu.download.id, { status: 'paused' });
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const handleOpenFolder = async () => {
    if (!contextMenu) return;
    try {
      await invoke('open_file_location', { path: contextMenu.download.filepath });
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const handleCopyUrl = async () => {
    if (!contextMenu) return;
    try {
      await invoke('copy_to_clipboard', { text: contextMenu.download.url });
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleOpenFile = async (download?: Download) => {
    const d = download || contextMenu?.download;
    if (!d) return;
    try {
      await invoke('open_file', { path: d.filepath });
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleMoveToTop = () => {
    if (!contextMenu) return;
    const { downloads: allDownloads, setDownloads } = useDownloadStore.getState();
    const idx = allDownloads.findIndex(d => d.id === contextMenu.download.id);
    if (idx > 0) {
      const newDownloads = [...allDownloads];
      const [removed] = newDownloads.splice(idx, 1);
      newDownloads.unshift(removed);
      setDownloads(newDownloads);
    }
  };

  const handleMoveToBottom = () => {
    if (!contextMenu) return;
    const { downloads: allDownloads, setDownloads } = useDownloadStore.getState();
    const idx = allDownloads.findIndex(d => d.id === contextMenu.download.id);
    if (idx < allDownloads.length - 1) {
      const newDownloads = [...allDownloads];
      const [removed] = newDownloads.splice(idx, 1);
      newDownloads.push(removed);
      setDownloads(newDownloads);
    }
  };

  const handleProperties = () => {
    if (!contextMenu) return;
    setSelectedId(contextMenu.download.id);
    if (contextMenu.download.status === 'downloading' || contextMenu.download.status === 'paused') {
      setProgressDialogOpen(true);
    }
  };

  const handleRedownload = async () => {
    if (!contextMenu) return;
    try {
      await invoke('start_download', { 
        url: contextMenu.download.url, 
        savePath: contextMenu.download.filepath 
      });
    } catch (err) {
      console.error('Failed to re-download:', err);
    }
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    try {
      await invoke('delete_download', { id: contextMenu.download.id });
      removeDownload(contextMenu.download.id);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  if (filteredDownloads.length === 0) {
    return (
      <div className="download-list-container">
        <div className="empty-state">
          <ArrowDownCircle className="empty-state-icon" />
          <p className="empty-state-text">No downloads yet. Click "Add URL" to start downloading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="download-list-container">
      <div className="download-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 40 }}></th>
              <th>File Name</th>
              <th style={{ width: 140 }}>Size</th>
              <th style={{ width: 150 }}>Progress</th>
              <th style={{ width: 100 }}>Speed</th>
              <th style={{ width: 100 }}>ETA</th>
              <th style={{ width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDownloads.map((download, index) => (
              <DownloadRow
                key={download.id}
                download={download}
                index={index}
                isSelected={selectedId === download.id}
                onClick={() => handleRowClick(download.id)}
                onDoubleClick={() => handleRowDoubleClick(download)}
                onContextMenu={(e) => handleContextMenu(e, download)}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          download={contextMenu.download}
          onClose={closeContextMenu}
          onStart={handleStart}
          onPause={handlePause}
          onOpenFolder={handleOpenFolder}
          onCopyUrl={handleCopyUrl}
          onOpenFile={() => handleOpenFile()}
          onMoveToTop={handleMoveToTop}
          onMoveToBottom={handleMoveToBottom}
          onProperties={handleProperties}
          onRedownload={handleRedownload}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
