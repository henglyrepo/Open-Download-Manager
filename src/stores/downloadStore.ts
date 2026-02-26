import { create } from 'zustand';
import { Download, CategoryFilter, ChunkProgress } from '../types/download';

interface DownloadStore {
  downloads: Download[];
  selectedId: string | null;
  category: CategoryFilter;
  isAddDialogOpen: boolean;
  isProgressDialogOpen: boolean;
  
  setDownloads: (downloads: Download[]) => void;
  addDownload: (download: Download) => void;
  updateDownload: (id: string, updates: Partial<Download>) => void;
  removeDownload: (id: string) => void;
  setSelectedId: (id: string | null) => void;
  setCategory: (category: CategoryFilter) => void;
  setAddDialogOpen: (open: boolean) => void;
  setProgressDialogOpen: (open: boolean) => void;
  updateChunkProgress: (downloadId: string, chunkId: number, progress: Partial<ChunkProgress>) => void;
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: [],
  selectedId: null,
  category: 'all',
  isAddDialogOpen: false,
  isProgressDialogOpen: false,

  setDownloads: (downloads) => set({ downloads }),

  addDownload: (download) => set((state) => ({
    downloads: [...state.downloads, download]
  })),

  updateDownload: (id, updates) => set((state) => ({
    downloads: state.downloads.map((d) =>
      d.id === id ? { ...d, ...updates } : d
    )
  })),

  removeDownload: (id) => set((state) => ({
    downloads: state.downloads.filter((d) => d.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId
  })),

  setSelectedId: (id) => set({ selectedId: id }),

  setCategory: (category) => set({ category }),

  setAddDialogOpen: (open) => set({ isAddDialogOpen: open }),

  setProgressDialogOpen: (open) => set({ isProgressDialogOpen: open }),

  updateChunkProgress: (downloadId, chunkId, progress) => set((state) => ({
    downloads: state.downloads.map((d) => {
      if (d.id !== downloadId) return d;
      return {
        ...d,
        chunks: d.chunks.map((c) =>
          c.id === chunkId ? { ...c, ...progress } : c
        )
      };
    })
  })),
}));

export const selectDownloadsByCategory = (downloads: Download[], category: CategoryFilter): Download[] => {
  switch (category) {
    case 'downloading':
      return downloads.filter((d) => d.status === 'downloading');
    case 'completed':
      return downloads.filter((d) => d.status === 'completed');
    case 'queued':
      return downloads.filter((d) => d.status === 'queued');
    case 'scheduled':
      return downloads.filter((d) => d.status === 'queued');
    default:
      return downloads;
  }
};

export const getCategoryCount = (downloads: Download[], category: CategoryFilter): number => {
  return selectDownloadsByCategory(downloads, category).length;
};
