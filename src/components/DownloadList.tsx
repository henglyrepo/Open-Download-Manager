import { ArrowDownCircle, CheckCircle, PauseCircle, Clock, XCircle } from 'lucide-react';
import { useDownloadStore, selectDownloadsByCategory } from '../stores/downloadStore';
import { Download } from '../types/download';

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
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function DownloadRow({ download, isSelected, onClick, onDoubleClick }: DownloadRowProps) {
  const percent = formatPercent(download.downloadedSize, download.totalSize);

  return (
    <tr
      className={`download-row ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <td>{getStatusIcon(download.status)}</td>
      <td>{download.filename}</td>
      <td>{formatFileSize(download.totalSize)}</td>
      <td className="progress-cell">
        {download.status === 'downloading' || download.status === 'paused' ? (
          <>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: percent }} />
            </div>
            <div className="progress-text">{percent}</div>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>-</span>
        )}
      </td>
      <td>
        {download.status === 'downloading' ? (
          <span className="speed-value">{formatSpeed(download.speed)}</span>
        ) : (
          '-'
        )}
      </td>
      <td>
        <span className={`status-text ${download.status}`}>{getStatusText(download.status)}</span>
      </td>
    </tr>
  );
}

export function DownloadList() {
  const { downloads, category, selectedId, setSelectedId, setProgressDialogOpen } = useDownloadStore();
  const filteredDownloads = selectDownloadsByCategory(downloads, category);

  const handleRowClick = (id: string) => {
    setSelectedId(id);
  };

  const handleRowDoubleClick = (download: Download) => {
    setSelectedId(download.id);
    if (download.status === 'downloading' || download.status === 'paused') {
      setProgressDialogOpen(true);
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
              <th style={{ width: 40 }}></th>
              <th>File Name</th>
              <th style={{ width: 100 }}>Size</th>
              <th style={{ width: 150 }}>Progress</th>
              <th style={{ width: 100 }}>Speed</th>
              <th style={{ width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredDownloads.map((download) => (
              <DownloadRow
                key={download.id}
                download={download}
                isSelected={selectedId === download.id}
                onClick={() => handleRowClick(download.id)}
                onDoubleClick={() => handleRowDoubleClick(download)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
