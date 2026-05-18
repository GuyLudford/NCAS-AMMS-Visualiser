export type DatasetKind = 'points' | 'track' | 'profile' | 'stations' | 'photos' | 'attachment';

export const GROUP_CODES = ['CC', 'SL', 'MG', 'PN', 'GL'] as const;
export type GroupCode = (typeof GROUP_CODES)[number];

export const GROUP_INFO: Record<GroupCode, { name: string; color: string }> = {
  CC: { name: 'Curiously Cirrus', color: '#3b82f6' },
  SL: { name: 'Silver Linings', color: '#a3a3a3' },
  MG: { name: 'Mountain Goats', color: '#84cc16' },
  PN: { name: 'Precipitation Nation', color: '#0ea5e9' },
  GL: { name: "Gail's", color: '#f59e0b' },
};

export interface Variable {
  key: string;
  label: string;
  unit: string;
  range?: [number, number];
}

export interface SampleRecord {
  time?: string;
  lat: number;
  lon: number;
  alt?: number;
  values: Record<string, number | string | null>;
  notes?: string;
}

export interface DatasetStyle {
  color: string;
  colorBy?: string;
  visible: boolean;
  opacity: number;
}

export interface Dataset {
  id: string;
  name: string;
  source: { filename: string; sheet?: string };
  kind: DatasetKind;
  variables: Variable[];
  records: SampleRecord[];
  style: DatasetStyle;
  meta: {
    instrument: string;
    group?: GroupCode;
    sourceTz?: string;
    warnings?: string[];
    attachmentUrl?: string;
    attachmentType?: string;
    [k: string]: unknown;
  };
}

export interface ParseResult {
  datasets: Dataset[];
  warnings: string[];
}

export interface Parser {
  name: string;
  match(file: { name: string; size: number }): number;
  parse(file: File): Promise<ParseResult>;
}
