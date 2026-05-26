import { create } from 'zustand';
import type { Dataset } from './types';

interface Selection {
  datasetId: string;
  recordIndex?: number;
}

export type ExpandedMode = 'plots' | 'skewt';

interface AppState {
  datasets: Dataset[];
  selection: Selection | null;
  hover: Selection | null;
  warnings: { source: string; messages: string[] }[];
  timeWindow: { start: number; end: number } | null;
  expandedDatasetId: string | null;
  expandedMode: ExpandedMode;
  altitudeExaggeration: number;
  showAltitudeTowers: boolean;
  compareSelected: string[];
  addDatasets: (datasets: Dataset[]) => void;
  removeDataset: (id: string) => void;
  updateDataset: (id: string, patch: Partial<Dataset>) => void;
  setSelection: (sel: Selection | null) => void;
  setHover: (sel: Selection | null) => void;
  addWarnings: (source: string, messages: string[]) => void;
  expandDataset: (id: string | null, mode?: ExpandedMode) => void;
  setAltitudeExaggeration: (n: number) => void;
  setShowAltitudeTowers: (v: boolean) => void;
  setTimeWindow: (w: { start: number; end: number } | null) => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  clearAll: () => void;
}

export const useStore = create<AppState>((set) => ({
  datasets: [],
  selection: null,
  hover: null,
  warnings: [],
  timeWindow: null,
  expandedDatasetId: null,
  expandedMode: 'plots',
  altitudeExaggeration: 5,
  showAltitudeTowers: true,
  compareSelected: [],
  addDatasets: (ds) =>
    set((s) => ({ datasets: [...s.datasets, ...ds] })),
  removeDataset: (id) =>
    set((s) => ({
      datasets: s.datasets.filter((d) => d.id !== id),
      selection: s.selection?.datasetId === id ? null : s.selection,
      expandedDatasetId: s.expandedDatasetId === id ? null : s.expandedDatasetId,
    })),
  updateDataset: (id, patch) =>
    set((s) => ({
      datasets: s.datasets.map((d) => (d.id === id ? { ...d, ...patch, style: { ...d.style, ...(patch.style ?? {}) } } : d)),
    })),
  setSelection: (sel) => set({ selection: sel }),
  setHover: (sel) => set({ hover: sel }),
  addWarnings: (source, messages) =>
    messages.length > 0 ? set((s) => ({ warnings: [...s.warnings, { source, messages }] })) : undefined,
  expandDataset: (id, mode = 'plots') => set({ expandedDatasetId: id, expandedMode: mode }),
  setAltitudeExaggeration: (n) => set({ altitudeExaggeration: n }),
  setShowAltitudeTowers: (v) => set({ showAltitudeTowers: v }),
  setTimeWindow: (w) => set({ timeWindow: w }),
  toggleCompare: (id) =>
    set((s) => ({
      compareSelected: s.compareSelected.includes(id)
        ? s.compareSelected.filter((x) => x !== id)
        : [...s.compareSelected, id],
    })),
  clearCompare: () => set({ compareSelected: [] }),
  clearAll: () => set({ datasets: [], selection: null, hover: null, warnings: [], timeWindow: null, expandedDatasetId: null, compareSelected: [] }),
}));
