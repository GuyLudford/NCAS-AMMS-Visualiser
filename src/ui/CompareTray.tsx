import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../data/store';
import type { Dataset, SampleRecord } from '../data/types';

const COMPARE_AXES: { key: string; label: string; unit: string }[] = [
  { key: 'air_temperature', label: 'Air temperature', unit: '°C' },
  { key: 'relative_humidity', label: 'Relative humidity', unit: '%' },
  { key: 'pressure', label: 'Pressure', unit: 'hPa' },
  { key: 'dew_point', label: 'Dew point', unit: '°C' },
  { key: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
];

export function CompareTray() {
  const datasets = useStore((s) => s.datasets);
  const compareSelected = useStore((s) => s.compareSelected);
  const clearCompare = useStore((s) => s.clearCompare);
  const expanded = useStore((s) => s.expandedDatasetId);
  const selectedDs = datasets.filter((d) => compareSelected.includes(d.id));
  const [axis, setAxis] = useState<'altitude' | 'time'>('altitude');
  const [variableKey, setVariableKey] = useState('air_temperature');
  const [open, setOpen] = useState(true);

  // Auto-open whenever something gets selected.
  useEffect(() => {
    if (selectedDs.length >= 2) setOpen(true);
  }, [selectedDs.length]);

  if (selectedDs.length === 0 || expanded) return null;

  const variable = COMPARE_AXES.find((v) => v.key === variableKey) ?? COMPARE_AXES[0];

  return (
    <div className={`compare-tray ${open ? '' : 'collapsed'}`}>
      <header className="compare-header">
        <div className="compare-title">
          <strong>Compare</strong>
          <span className="muted small">{selectedDs.length} datasets selected</span>
        </div>
        <div className="compare-controls">
          <label className="small">
            Variable
            <select value={variableKey} onChange={(e) => setVariableKey(e.target.value)}>
              {COMPARE_AXES.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="small">
            Axis
            <select value={axis} onChange={(e) => setAxis(e.target.value as 'altitude' | 'time')}>
              <option value="altitude">vs Altitude</option>
              <option value="time">vs Time</option>
            </select>
          </label>
          <button className="link" onClick={() => setOpen(!open)}>{open ? '▼' : '▲'}</button>
          <button className="link" onClick={clearCompare}>×</button>
        </div>
      </header>
      {open && (
        <div className="compare-body">
          <ComparePlot datasets={selectedDs} variable={variable} axis={axis} />
          <div className="compare-legend">
            {selectedDs.map((d) => (
              <div key={d.id} className="compare-legend-item">
                <span className="swatch" style={{ background: d.style.color }} />
                <span className="small">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparePlot({
  datasets,
  variable,
  axis,
}: {
  datasets: Dataset[];
  variable: { key: string; label: string; unit: string };
  axis: 'altitude' | 'time';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => buildComparison(datasets, variable.key, axis), [datasets, variable.key, axis]);

  useEffect(() => {
    const host = ref.current;
    if (!host || data.x.length < 2 || data.series.length === 0) return;
    let u: uPlot | null = null;
    let ro: ResizeObserver | null = null;
    const raf = requestAnimationFrame(() => {
      if (!ref.current) return;
      const opts: uPlot.Options = {
        width: ref.current.clientWidth || 800,
        height: 260,
        scales: { x: { time: axis === 'time' } },
        axes: [
          { label: axis === 'altitude' ? `${variable.label} (${variable.unit})` : 'Time', stroke: '#94a3b8', grid: { stroke: '#1f2a44' } },
          { label: axis === 'altitude' ? 'Altitude (m)' : `${variable.label} (${variable.unit})`, stroke: '#94a3b8', grid: { stroke: '#1f2a44' } },
        ],
        series: [
          {},
          ...data.series.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: 1.6,
            points: { show: false },
          })),
        ],
      };
      u = new uPlot(opts, [data.x, ...data.ys] as any, ref.current);
      ro = new ResizeObserver(() => u?.setSize({ width: ref.current!.clientWidth, height: 260 }));
      ro.observe(ref.current);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      u?.destroy();
    };
  }, [data, axis, variable.label, variable.unit]);

  if (data.x.length < 2 || data.series.length === 0) {
    return <div className="no-plots small muted">None of the selected datasets contain "{variable.label}" with the chosen axis.</div>;
  }
  return <div ref={ref} className="plot-host compare-plot" />;
}

// Builds an aligned series array where all datasets share the same X axis.
// For "vs altitude" we use a unified altitude grid and forward-fill the Y
// values for each dataset; for "vs time" we use a unified time grid.
function buildComparison(datasets: Dataset[], variableKey: string, axis: 'altitude' | 'time') {
  // Collect (x, y, color, label) per dataset
  const series: { label: string; color: string }[] = [];
  const pairs: { dsIdx: number; x: number; y: number }[] = [];

  datasets.forEach((d, idx) => {
    series.push({ label: d.name, color: d.style.color });
    for (const r of d.records) {
      const y = pickN(r, variableKey);
      if (y == null) continue;
      let x: number | null = null;
      if (axis === 'altitude') {
        if (r.alt == null || !Number.isFinite(r.alt)) continue;
        x = r.alt;
      } else {
        if (!r.time) continue;
        x = new Date(r.time).getTime() / 1000;
      }
      if (!Number.isFinite(x)) continue;
      pairs.push({ dsIdx: idx, x, y });
    }
  });
  if (!pairs.length) return { x: [] as number[], ys: [] as number[][], series };

  // Unify X axis
  const xs = Array.from(new Set(pairs.map((p) => p.x))).sort((a, b) => a - b);
  const xToIdx = new Map<number, number>(xs.map((x, i) => [x, i]));
  const ys: (number | null)[][] = series.map(() => new Array(xs.length).fill(null));
  for (const p of pairs) {
    ys[p.dsIdx][xToIdx.get(p.x)!] = p.y;
  }
  // Convert nulls to NaN for uPlot to skip-draw
  const cleaned: number[][] = ys.map((arr) => arr.map((v) => (v == null ? NaN : v)));
  return { x: xs, ys: cleaned, series };
}

function pickN(r: SampleRecord, key: string): number | null {
  if (key === 'alt') return r.alt ?? null;
  const v = r.values[key];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
