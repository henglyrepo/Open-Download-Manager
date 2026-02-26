import { Plus, Play, Pause, Square, Trash2, Settings } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';

interface ToolbarProps {
  onStartDownload: () => void;
  onPauseDownload: () => void;
  onStopDownload: () => void;
  onDeleteDownload: () => void;
}

export function Toolbar({ onStartDownload, onPauseDownload, onStopDownload, onDeleteDownload }: ToolbarProps) {
  const { selectedId, downloads, setAddDialogOpen } = useDownloadStore();
  const selectedDownload = downloads.find((d) => d.id === selectedId);

  const hasSelection = !!selectedId;
  const isDownloading = selectedDownload?.status === 'downloading';
  const isPaused = selectedDownload?.status === 'paused';
  const canStart = hasSelection && (isPaused || selectedDownload?.status === 'queued');
  const canPause = hasSelection && isDownloading;
  const canStop = hasSelection && (isDownloading || isPaused);

  return (
    <div className="toolbar">
      <button className="toolbar-btn primary" onClick={() => setAddDialogOpen(true)}>
        <Plus size={16} />
        Add URL
      </button>
      <button className="toolbar-btn" onClick={onStartDownload} disabled={!canStart}>
        <Play size={16} />
        Start
      </button>
      <button className="toolbar-btn" onClick={onPauseDownload} disabled={!canPause}>
        <Pause size={16} />
        Pause
      </button>
      <button className="toolbar-btn" onClick={onStopDownload} disabled={!canStop}>
        <Square size={16} />
        Stop
      </button>
      <button className="toolbar-btn" onClick={onDeleteDownload} disabled={!hasSelection || isDownloading}>
        <Trash2 size={16} />
        Delete
      </button>
      <div style={{ flex: 1 }} />
      <button className="toolbar-btn">
        <Settings size={16} />
        Settings
      </button>
    </div>
  );
}
