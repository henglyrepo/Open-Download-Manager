import { useEffect, useRef } from 'react';
import { Play, Pause, FolderOpen, Copy, File, ArrowUp, ArrowDown, Settings, RefreshCw, Trash2 } from 'lucide-react';
import { Download } from '../types/download';

interface ContextMenuProps {
  x: number;
  y: number;
  download: Download;
  onClose: () => void;
  onStart: () => void;
  onPause: () => void;
  onOpenFolder: () => void;
  onCopyUrl: () => void;
  onOpenFile: () => void;
  onMoveToTop: () => void;
  onMoveToBottom: () => void;
  onProperties: () => void;
  onRedownload: () => void;
  onDelete: () => void;
}

export function ContextMenu({
  x,
  y,
  download,
  onClose,
  onStart,
  onPause,
  onOpenFolder,
  onCopyUrl,
  onOpenFile,
  onMoveToTop,
  onMoveToBottom,
  onProperties,
  onRedownload,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  const menuItems = [
    {
      icon: download.status === 'downloading' ? Pause : Play,
      label: download.status === 'downloading' ? 'Pause' : 'Start',
      action: download.status === 'downloading' ? onPause : onStart,
      show: download.status === 'downloading' || download.status === 'paused' || download.status === 'queued',
      dividerAfter: true,
    },
    {
      icon: FolderOpen,
      label: 'Open File Location',
      action: onOpenFolder,
      show: true,
    },
    {
      icon: Copy,
      label: 'Copy URL',
      action: onCopyUrl,
      show: true,
    },
    {
      icon: File,
      label: 'Open File',
      action: onOpenFile,
      show: download.status === 'completed',
      dividerAfter: true,
    },
    {
      icon: ArrowUp,
      label: 'Move to Top',
      action: onMoveToTop,
      show: true,
    },
    {
      icon: ArrowDown,
      label: 'Move to Bottom',
      action: onMoveToBottom,
      show: true,
      dividerAfter: true,
    },
    {
      icon: Settings,
      label: 'Properties',
      action: onProperties,
      show: true,
    },
    {
      icon: RefreshCw,
      label: 'Re-download',
      action: onRedownload,
      show: download.status === 'error' || download.status === 'completed',
    },
    {
      icon: Trash2,
      label: 'Delete',
      action: onDelete,
      show: true,
      danger: true,
      dividerAfter: false,
    },
  ];

  const visibleItems = menuItems.filter(item => item.show);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
      }}
    >
      {visibleItems.map((item, index) => (
        <div key={index}>
          <div
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            <item.icon size={14} />
            <span>{item.label}</span>
          </div>
          {item.dividerAfter && index < visibleItems.length - 1 && (
            <div className="context-menu-divider" />
          )}
        </div>
      ))}
    </div>
  );
}
