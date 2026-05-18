import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../data/store';
import type { Dataset, SampleRecord } from '../data/types';

export function PlotsView() {
  const id = useStore((s) => s.expandedDatasetId);
  const dataset = useStore((s) => s.datasets.find((d) => d.id === id) ?? null);
  const close = useStore((s) => s.expandDataset);
  if (!dataset) return null;
  const plots = buildPlots(dataset);

  return (
    <div className="plots-view">
      <header className="plots-header">
        <button className="link back" onClick={() => close(null)}>
          ← Back to map
        </button>
        <div className="plots-title">
          <h2>{dataset.name}</h2>
          <div className="muted small">
            {String(dataset.meta.instrument)} · {dataset.records.length} samples · {dataset.source.filename}
            {dataset.source.sheet ? ` · sheet "${dataset.source.sheet}"` : ''}
          </div>
        </div>
        <div />
      </header>
      {plots.length === 0 ? (
        <div className="no-plots">
          No plottable variables found for this dataset (no time-series and no altitude profile).
        </div>
      ) : (
        <div className="plots-grid">
          {plots.map((p, i) => (
            <PlotCard key={`${dataset.id}-${i}-${p.title}`} {...p} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PlotSpec {
  title: string;
  xLabel: string;
  yLabel: string;
  x: number[];
  y: number[];
  isTime?: boolean;
}

// Variables whose value isn't physically a function of altitude — we keep
// their time-series but skip the "vs Altitude" plot to avoid noise.
const NON_ATMOSPHERIC_KEYS = new Set([
  'roll',
  'pitch',
  'yaw',
  'heading',
  'speed',
  'wind_direction',
  'battery',
  'internal_temperature',
  'pp_temperature',
  'true_dir',
  'density_alt',
]);

function buildPlots(d: Dataset): PlotSpec[] {
  const plots: PlotSpec[] = [];
  const hasAlt = d.records.some((r) => r.alt != null && Number.isFinite(r.alt));
  const hasTime = d.records.some((r) => !!r.time);

  if (hasAlt && hasTime) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of d.records) {
      if (!r.time || r.alt == null) continue;
      xs.push(new Date(r.time).getTime() / 1000);
      ys.push(r.alt);
    }
    if (xs.length > 1) {
      plots.push({ title: 'Altitude vs time', xLabel: 'Time', yLabel: 'Altitude (m)', x: xs, y: ys, isTime: true });
    }
  }

  for (const v of d.variables) {
    // Variable vs altitude — only meaningful for atmospheric quantities.
    const altitudeMeaningful =
      hasAlt && (d.kind === 'track' || d.kind === 'profile') && !NON_ATMOSPHERIC_KEYS.has(v.key);
    if (altitudeMeaningful) {
      const pairs: [number, number][] = [];
      for (const r of d.records) {
        const val = pickN(r, v.key);
        if (val != null && r.alt != null && Number.isFinite(r.alt)) {
          pairs.push([val, r.alt]);
        }
      }
      if (pairs.length > 1 && variableHasRange(pairs.map((p) => p[0]))) {
        pairs.sort((a, b) => a[1] - b[1]);
        plots.push({
          title: `${v.label} vs Altitude`,
          xLabel: `${v.label} (${v.unit})`,
          yLabel: 'Altitude (m)',
          x: pairs.map((p) => p[0]),
          y: pairs.map((p) => p[1]),
        });
      }
    }
    if (hasTime) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of d.records) {
        if (!r.time) continue;
        const val = pickN(r, v.key);
        if (val != null && Number.isFinite(val)) {
          xs.push(new Date(r.time).getTime() / 1000);
          ys.push(val);
        }
      }
      if (xs.length > 1 && variableHasRange(ys)) {
        plots.push({
          title: `${v.label} vs time`,
          xLabel: 'Time',
          yLabel: `${v.label} (${v.unit})`,
          x: xs,
          y: ys,
          isTime: true,
        });
      }
    }
  }
  return plots;
}

// Skip plots where the variable doesn't change — they're flat lines that
// tell the user nothing.
function variableHasRange(values: number[]): boolean {
  if (values.length < 2) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min > 1e-3;
}

function PlotCard({ title, xLabel, yLabel, x, y, isTime }: PlotSpec) {
  const hostRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => [x, y] as uPlot.AlignedData, [x, y]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || x.length < 2) return;
    let u: uPlot | null = null;
    let ro: ResizeObserver | null = null;

    // Defer one frame so the host has its grid-cell width when uPlot mounts.
    const raf = requestAnimationFrame(() => {
      if (!hostRef.current) return;
      const opts: uPlot.Options = {
        title,
        width: hostRef.current.clientWidth || 420,
        height: 260,
        scales: { x: { time: !!isTime } },
        axes: [
          { label: xLabel, stroke: '#94a3b8', grid: { stroke: '#1f2a44' } },
          { label: yLabel, stroke: '#94a3b8', grid: { stroke: '#1f2a44' } },
        ],
        series: [
          {},
          {
            label: yLabel,
            stroke: '#60a5fa',
            width: 1.6,
            points: { show: x.length < 600, size: 3, fill: '#60a5fa' },
          },
        ],
        cursor: { drag: { x: true, y: true } },
      };
      u = new uPlot(opts, data, hostRef.current);
      ro = new ResizeObserver(() => {
        if (!u || !hostRef.current) return;
        u.setSize({ width: hostRef.current.clientWidth, height: 260 });
      });
      ro.observe(hostRef.current);
    });

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      u?.destroy();
    };
  }, [data, title, xLabel, yLabel, isTime, x.length]);

  if (x.length < 2) {
    return (
      <div className="plot-card">
        <h4 className="plot-title">{title}</h4>
        <div className="muted small">Not enough data points</div>
      </div>
    );
  }

  return (
    <div className="plot-card">
      <div ref={hostRef} className="plot-host" />
    </div>
  );
}

function pickN(r: SampleRecord, key: string): number | null {
  if (key === 'alt') return r.alt ?? null;
  const v = r.values[key];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
