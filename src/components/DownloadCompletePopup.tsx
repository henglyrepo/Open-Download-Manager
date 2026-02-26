import { useState, useEffect } from 'react';
import { CheckCircle, FolderOpen, Play, Clipboard, Plus } from 'lucide-react';
import { Download } from '../types/download';
import { invoke } from '@tauri-apps/api/core';

interface DownloadCompletePopupProps {
  download: Download;
  onClose: () => void;
  onDownloadAnother: () => void;
}

export function DownloadCompletePopup({ download, onClose, onDownloadAnother }: DownloadCompletePopupProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Auto-close countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('opendm_showCompletePopup', 'false');
    }
    onClose();
  };

  const handleOpenFolder = async () => {
    try {
      await invoke('open_file_location', { path: download.filepath });
      handleClose();
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const handleOpenFile = async () => {
    try {
      await invoke('open_file', { path: download.filepath });
      handleClose();
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await invoke('copy_to_clipboard', { text: download.url });
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  if (false) { // Hidden when minimized to tray
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal complete-popup" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body">
          <CheckCircle className="complete-icon" size={64} />
          
          <h3 style={{ marginBottom: 16 }}>Download Complete!</h3>
          
          <div className="complete-filename">{download.filename}</div>
          <div className="complete-path">Saved to: {download.filepath}</div>
          
          <div className="complete-actions">
            <button className="btn btn-primary" onClick={handleOpenFolder}>
              <FolderOpen size={16} />
              Open File Location
            </button>
            <button className="btn btn-secondary" onClick={handleOpenFile}>
              <Play size={16} />
              Open File
            </button>
            <button className="btn btn-secondary" onClick={handleCopyUrl}>
              <Clipboard size={16} />
              Copy URL
            </button>
            <button className="btn btn-secondary" onClick={() => { handleClose(); onDownloadAnother(); }}>
              <Plus size={16} />
              Download Another
            </button>
          </div>
          
          <div className="complete-dont-show">
            <label>
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              Don't show this again
            </label>
            <span style={{ marginLeft: 'auto' }}>
              Auto-close in {countdown}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Check if we should show the popup
export function shouldShowCompletePopup(): boolean {
  const show = localStorage.getItem('opendm_showCompletePopup');
  return show !== 'false';
}
