import { useEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../data/store';
import type { Dataset, SampleRecord } from '../data/types';

export function DetailPanel() {
  const sel = useStore((s) => s.selection);
  const datasets = useStore((s) => s.datasets);
  const setSelection = useStore((s) => s.setSelection);
  if (!sel) return null;
  const ds = datasets.find((d) => d.id === sel.datasetId);
  if (!ds) return null;
  const rec = sel.recordIndex != null ? ds.records[sel.recordIndex] : null;

  return (
    <aside className="detail-panel">
      <header>
        <div>
          <h2>{ds.name}</h2>
          <div className="muted small">{ds.meta.instrument} · {ds.records.length} samples</div>
        </div>
        <button className="link" onClick={() => setSelection(null)}>×</button>
      </header>
      {rec && <RecordTable record={rec} dataset={ds} />}
      {ds.meta.attachmentUrl && ds.meta.attachmentType?.startsWith('image/') && (
        <img className="photo" src={String(ds.meta.attachmentUrl)} alt={ds.name} />
      )}
      <Plots dataset={ds} />
    </aside>
  );
}

function RecordTable({ record, dataset }: { record: SampleRecord; dataset: Dataset }) {
  return (
    <section>
      <h3>Sample</h3>
      <table className="meta-table">
        <tbody>
          {record.time && (
            <tr>
              <td>Time</td>
              <td>{record.time}</td>
            </tr>
          )}
          <tr>
            <td>Position</td>
            <td>
              {record.lat.toFixed(5)}, {record.lon.toFixed(5)}
              {record.alt != null && ` @ ${record.alt.toFixed(0)} m`}
            </td>
          </tr>
          {dataset.variables.map((v) => {
            const val = record.values[v.key];
            if (val == null) return null;
            return (
              <tr key={v.key}>
                <td>{v.label}</td>
                <td>
                  {typeof val === 'number' ? val.toFixed(2) : val} {v.unit}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Plots({ dataset }: { dataset: Dataset }) {
  if (dataset.kind === 'photos' || dataset.records.length < 2) return null;
  const plots: { title: string; xLabel: string; yLabel: string; x: number[]; y: number[] }[] = [];

  // Profile / track with altitude → T-vs-alt and RH-vs-alt
  const hasAlt = dataset.records.some((r) => r.alt != null);
  if (hasAlt) {
    const tx: number[] = [];
    const ty: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];
    for (const r of dataset.records) {
      const t = pickN(r, 'air_temperature') ?? pickN(r, 'air_temperature_kestrel') ?? pickN(r, 'dry_bulb');
      const rh = pickN(r, 'relative_humidity');
      if (r.alt != null && t != null) {
        tx.push(t);
        ty.push(r.alt);
      }
      if (r.alt != null && rh != null) {
        rx.push(rh);
        ry.push(r.alt);
      }
    }
    if (tx.length > 1) plots.push({ title: 'Temperature vs Altitude', xLabel: '°C', yLabel: 'm', x: tx, y: ty });
    if (rx.length > 1) plots.push({ title: 'RH vs Altitude', xLabel: '%', yLabel: 'm', x: rx, y: ry });
  }

  // Time-series (if no altitude variation, plot variables vs time)
  if (!hasAlt || dataset.kind === 'stations') {
    const timeMs = dataset.records.map((r) => (r.time ? new Date(r.time).getTime() / 1000 : NaN));
    for (const v of dataset.variables.slice(0, 4)) {
      const yArr = dataset.records.map((r) => {
        const n = pickN(r, v.key);
        return n ?? NaN;
      });
      if (yArr.filter((x) => Number.isFinite(x)).length > 1) {
        plots.push({
          title: `${v.label} vs time`,
          xLabel: 'time',
          yLabel: v.unit,
          x: timeMs,
          y: yArr,
        });
      }
    }
  }

  return (
    <section>
      {plots.map((p, i) => (
        <UPlotChart key={i} {...p} />
      ))}
    </section>
  );
}

function UPlotChart({
  title,
  xLabel,
  yLabel,
  x,
  y,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  x: number[];
  y: number[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => [x, y] as uPlot.AlignedData, [x, y]);
  useEffect(() => {
    if (!ref.current) return;
    const opts: uPlot.Options = {
      title,
      width: ref.current.clientWidth || 360,
      height: 200,
      scales: { x: { time: xLabel === 'time' } },
      axes: [
        { label: xLabel },
        { label: yLabel },
      ],
      series: [
        {},
        { stroke: '#3b82f6', width: 2, points: { show: x.length < 200 } },
      ],
    };
    const u = new uPlot(opts, data, ref.current);
    return () => u.destroy();
  }, [data, title, xLabel, yLabel, x.length]);
  return <div className="uplot-host" ref={ref} />;
}

function pickN(r: SampleRecord, key: string): number | null {
  const v = r.values[key];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
