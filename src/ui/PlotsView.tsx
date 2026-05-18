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
      <div className="plots-grid">
        {buildPlots(dataset).map((p, i) => (
          <PlotCard key={i} {...p} />
        ))}
      </div>
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
  inverted?: boolean;
}

function buildPlots(d: Dataset): PlotSpec[] {
  const plots: PlotSpec[] = [];
  const hasAlt = d.records.some((r) => r.alt != null && Number.isFinite(r.alt));
  const hasTime = d.records.some((r) => !!r.time);

  // For every variable on every record, build either a vs-time plot or a vs-altitude plot.
  for (const v of d.variables) {
    // T-vs-altitude is the headline for traverses/profiles/UAV climbs
    if (hasAlt && (d.kind === 'track' || d.kind === 'profile')) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of d.records) {
        const val = pickN(r, v.key);
        if (val != null && r.alt != null && Number.isFinite(r.alt)) {
          xs.push(val);
          ys.push(r.alt);
        }
      }
      if (xs.length > 1) {
        plots.push({
          title: `${v.label} vs Altitude`,
          xLabel: `${v.label} (${v.unit})`,
          yLabel: 'Altitude (m)',
          x: xs,
          y: ys,
        });
      }
    }
    // Time-series
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
      if (xs.length > 1) {
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

  // Altitude vs time for tracks
  if (hasAlt && hasTime) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of d.records) {
      if (!r.time || r.alt == null) continue;
      xs.push(new Date(r.time).getTime() / 1000);
      ys.push(r.alt);
    }
    if (xs.length > 1) {
      plots.unshift({ title: 'Altitude vs time', xLabel: 'Time', yLabel: 'Altitude (m)', x: xs, y: ys, isTime: true });
    }
  }
  return plots;
}

function PlotCard({ title, xLabel, yLabel, x, y, isTime }: PlotSpec) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => [x, y] as uPlot.AlignedData, [x, y]);
  useEffect(() => {
    if (!ref.current) return;
    const opts: uPlot.Options = {
      title,
      width: ref.current.clientWidth || 480,
      height: 280,
      scales: { x: { time: !!isTime } },
      axes: [{ label: xLabel }, { label: yLabel }],
      series: [
        {},
        { stroke: '#3b82f6', width: 1.5, points: { show: x.length < 400 } },
      ],
      cursor: { drag: { x: true, y: true, uni: 10 } },
    };
    const u = new uPlot(opts, data, ref.current);
    const onResize = () => u.setSize({ width: ref.current!.clientWidth, height: 280 });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      u.destroy();
    };
  }, [data, title, xLabel, yLabel, isTime, x.length]);
  return (
    <div className="plot-card">
      <div ref={ref} className="plot-host" />
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
