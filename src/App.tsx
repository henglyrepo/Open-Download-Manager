import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { DownloadList } from './components/DownloadList';
import { AddUrlDialog } from './components/AddUrlDialog';
import { ProgressDialog } from './components/ProgressDialog';
import { StatusBar } from './components/StatusBar';
import { DownloadCompletePopup, shouldShowCompletePopup } from './components/DownloadCompletePopup';
import { useDownloadStore } from './stores/downloadStore';
import { Download, ChunkProgress } from './types/download';

interface DownloadProgressEvent {
  id: string;
  downloaded_size: number;
  total_size: number;
  speed: number;
  chunks: ChunkProgress[];
}

interface DownloadEvent {
  id: string;
  url: string;
  filename: string;
  filepath: string;
  totalSize: number;
  downloadedSize: number;
  speed: number;
  status: string;
  resumeSupported: boolean;
  chunks: ChunkProgress[];
}

export default function App() {
  const { addDownload, updateDownload, removeDownload, selectedId, setAddDialogOpen } = useDownloadStore();
  const [completedDownload, setCompletedDownload] = useState<Download | null>(null);

  useEffect(() => {
    const unlistenProgress = listen<DownloadProgressEvent>('download-progress', (event) => {
      const { id, downloaded_size, total_size, speed, chunks } = event.payload;
      updateDownload(id, {
        downloadedSize: downloaded_size,
        totalSize: total_size,
        speed,
        chunks,
      });
    });

    const unlistenComplete = listen<DownloadEvent>('download-complete', (event) => {
      const download = event.payload;
      updateDownload(download.id, {
        status: 'completed',
        downloadedSize: download.totalSize,
        speed: 0,
        completedAt: new Date().toISOString(),
      });

      // Show completion popup
      if (shouldShowCompletePopup()) {
        const fullDownload: Download = {
          id: download.id,
          url: download.url,
          filename: download.filename,
          filepath: download.filepath,
          totalSize: download.totalSize,
          downloadedSize: download.totalSize,
          speed: 0,
          status: 'completed',
          chunks: download.chunks,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          resumeSupported: download.resumeSupported,
        };
        setCompletedDownload(fullDownload);

        // Handle "show in folder" option
        const showInFolder = localStorage.getItem('opendm_showInFolderWhenComplete');
        if (showInFolder === 'true') {
          invoke('open_file_location', { path: download.filepath });
          localStorage.removeItem('opendm_showInFolderWhenComplete');
        }
      }
    });

    const unlistenError = listen<{ id: string; error: string }>('download-error', (event) => {
      const { id, error } = event.payload;
      updateDownload(id, {
        status: 'error',
        error,
        speed: 0,
      });
    });

    const unlistenStarted = listen<DownloadEvent>('download-started', (event) => {
      const download: Download = {
        id: event.payload.id,
        url: event.payload.url,
        filename: event.payload.filename,
        filepath: event.payload.filepath,
        totalSize: event.payload.totalSize,
        downloadedSize: 0,
        speed: 0,
        status: 'downloading',
        chunks: event.payload.chunks,
        createdAt: new Date().toISOString(),
        resumeSupported: event.payload.resumeSupported,
      };
      addDownload(download);
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenStarted.then((fn) => fn());
    };
  }, [addDownload, updateDownload]);

  const handleStartDownload = async () => {
    if (!selectedId) return;
    try {
      await invoke('resume_download', { id: selectedId });
      updateDownload(selectedId, { status: 'downloading' });
    } catch (err) {
      console.error('Failed to start:', err);
    }
  };

  const handlePauseDownload = async () => {
    if (!selectedId) return;
    try {
      await invoke('pause_download', { id: selectedId });
      updateDownload(selectedId, { status: 'paused' });
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const handleStopDownload = async () => {
    if (!selectedId) return;
    try {
      await invoke('stop_download', { id: selectedId });
      updateDownload(selectedId, { status: 'queued', speed: 0 });
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  };

  const handleDeleteDownload = async () => {
    if (!selectedId) return;
    try {
      await invoke('delete_download', { id: selectedId });
      removeDownload(selectedId);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleCloseCompletePopup = () => {
    setCompletedDownload(null);
  };

  const handleDownloadAnother = () => {
    setCompletedDownload(null);
    setAddDialogOpen(true);
  };

  return (
    <div className="app-container">
      <Toolbar
        onStartDownload={handleStartDownload}
        onPauseDownload={handlePauseDownload}
        onStopDownload={handleStopDownload}
        onDeleteDownload={handleDeleteDownload}
      />
      <div className="main-content">
        <Sidebar />
        <DownloadList />
      </div>
      <StatusBar />
      <AddUrlDialog />
      <ProgressDialog />
      {completedDownload && (
        <DownloadCompletePopup
          download={completedDownload}
          onClose={handleCloseCompletePopup}
          onDownloadAnother={handleDownloadAnother}
        />
      )}
    </div>
  );
}
