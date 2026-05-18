import { create } from 'zustand';
import type { Dataset } from './types';

interface Selection {
  datasetId: string;
  recordIndex?: number;
}

interface AppState {
  datasets: Dataset[];
  selection: Selection | null;
  hover: Selection | null;
  warnings: { source: string; messages: string[] }[];
  timeWindow: { start: string; end: string } | null;
  addDatasets: (datasets: Dataset[]) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, patch: Partial<Dataset>) => void;
  setSelection: (sel: Selection | null) => void;
  setHover: (sel: Selection | null) => void;
  addWarnings: (source: string, messages: string[]) => void;
  clearAll: () => void;
}

export const useStore = create<AppState>((set) => ({
  datasets: [],
  selection: null,
  hover: null,
  warnings: [],
  timeWindow: null,
  addDatasets: (ds) =>
    set((s) => ({ datasets: [...s.datasets, ...ds] })),
  removeDataset: (id) =>
    set((s) => ({
      datasets: s.datasets.filter((d) => d.id !== id),
      selection: s.selection?.datasetId === id ? null : s.selection,
    })),
  updateDataset: (id, patch) =>
    set((s) => ({
      datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...patch, style: { ...d.style, ...(patch.style ?? {}) } } : d)),
    })),
  setSelection: (sel) => set({ selection: sel }),
  setHover: (sel) => set({ hover: sel }),
  addWarnings: (source, messages) =>
    messages.length > 0 ? set((s) => ({ warnings: [...s.warnings, { source, messages }] })) : undefined,
  clearAll: () => set({ datasets: [], selection: null, hover: null, warnings: [], timeWindow: null }),
}));
