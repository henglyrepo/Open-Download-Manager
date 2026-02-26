import { ArrowDownCircle, Gauge, HardDrive } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  return formatSize(bytesPerSec) + '/s';
}

export function StatusBar() {
  const { downloads } = useDownloadStore();

  const downloadingCount = downloads.filter((d) => d.status === 'downloading').length;
  const totalSpeed = downloads
    .filter((d) => d.status === 'downloading')
    .reduce((acc, d) => acc + d.speed, 0);
  const totalDownloaded = downloads
    .filter((d) => d.status === 'completed')
    .reduce((acc, d) => acc + d.totalSize, 0);

  return (
    <div className="status-bar">
      <div className="status-item">
        <ArrowDownCircle size={14} />
        <span>{downloadingCount} Downloads</span>
      </div>
      <div className="status-item">
        <Gauge size={14} />
        <span>{formatSpeed(totalSpeed)}</span>
      </div>
      <div className="status-item">
        <HardDrive size={14} />
        <span>{formatSize(totalDownloaded)}</span>
      </div>
    </div>
  );
}
