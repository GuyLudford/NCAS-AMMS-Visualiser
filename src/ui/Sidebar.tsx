import { useMemo, useRef } from 'react';
import { useStore } from '../data/store';
import { GROUP_INFO } from '../data/types';
import type { Dataset } from '../data/types';
import { parseFiles } from '../data/parsers';

function categoryFor(d: Dataset): string {
  const inst = String(d.meta.instrument ?? '');
  if (inst.startsWith('UAV')) return 'UAV';
  if (inst.startsWith('Windsond')) return 'Windsond';
  if (inst.startsWith('Sky-camera')) return 'Sky-camera met';
  if (inst.startsWith('Kestrel')) return 'Kestrel 5500L';
  if (inst.startsWith('Hill traverse')) return 'Hill traverse';
  if (inst.startsWith('HOBO')) return 'HOBO reference';
  if (inst.startsWith('NCAS backpack')) return 'Backpack logger';
  if (inst.startsWith('KML') || inst.startsWith('GPX')) return 'GPS tracks';
  if (inst === 'Photo') return 'Photo';
  return 'Other';
}

const CATEGORY_ORDER = [
  'UAV',
  'Windsond',
  'Sky-camera met',
  'Kestrel 5500L',
  'Hill traverse',
  'HOBO reference',
  'Backpack logger',
  'GPS tracks',
  'Photo',
  'Other',
];

export function Sidebar() {
  const datasets = useStore((s) => s.datasets);
  const updateDataset = useStore((s) => s.updateDataset);
  const removeDataset = useStore((s) => s.removeDataset);
  const expandDataset = useStore((s) => s.expandDataset);
  const addDatasets = useStore((s) => s.addDatasets);
  const addWarnings = useStore((s) => s.addWarnings);
  const warnings = useStore((s) => s.warnings);
  const altitudeExaggeration = useStore((s) => s.altitudeExaggeration);
  const setAltitudeExaggeration = useStore((s) => s.setAltitudeExaggeration);
  const showAltitudeTowers = useStore((s) => s.showAltitudeTowers);
  const setShowAltitudeTowers = useStore((s) => s.setShowAltitudeTowers);
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const groups = new Map<string, Dataset[]>();
    for (const d of datasets) {
      const c = categoryFor(d);
      const arr = groups.get(c) ?? [];
      arr.push(d);
      groups.set(c, arr);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [datasets]);

  const onPick = async (files: FileList | null) => {
    if (!files) return;
    const { datasets: parsed, warnings: w } = await parseFiles(Array.from(files));
    if (parsed.length) addDatasets(parsed);
    if (w.length) addWarnings('upload', w);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="primary" onClick={() => inputRef.current?.click()}>
          + Add data
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="sidebar-globe-controls">
        <label className="row">
          <input
            type="checkbox"
            checked={showAltitudeTowers}
            onChange={(e) => setShowAltitudeTowers(e.target.checked)}
          />
          <span className="small">3D altitude towers</span>
        </label>
        <label className="row small">
          <span>Altitude × {altitudeExaggeration}</span>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={altitudeExaggeration}
            onChange={(e) => setAltitudeExaggeration(parseInt(e.target.value, 10))}
          />
        </label>
      </div>

      <h2>Datasets ({datasets.length})</h2>
      {datasets.length === 0 && <p className="muted small">No data loaded yet. Drop files anywhere or use Add data.</p>}

      {grouped.map(({ category, items }) => (
        <section key={category} className="dataset-group">
          <h3 className="group-title">
            {category} <span className="count">{items.length}</span>
          </h3>
          {items.map((d) => (
            <div key={d.id} className="dataset-card">
              <div className="row">
                <input
                  type="checkbox"
                  checked={d.style.visible}
                  onChange={(e) => updateDataset(d.id, { style: { ...d.style, visible: e.target.checked } })}
                />
                <span className="swatch" style={{ background: d.style.color }} />
                <span className="dataset-name" title={d.source.filename}>
                  {d.name}
                </span>
                <button className="link" onClick={() => removeDataset(d.id)} title="Remove">
                  ×
                </button>
              </div>
              <div className="row small muted">
                {d.meta.group && `${GROUP_INFO[d.meta.group as keyof typeof GROUP_INFO]?.name ?? d.meta.group} · `}
                {d.records.length} samples
              </div>
              {d.variables.length > 0 && d.kind !== 'photos' && (
                <div className="row">
                  <label className="small">Colour by</label>
                  <select
                    value={d.style.colorBy ?? ''}
                    onChange={(e) => updateDataset(d.id, { style: { ...d.style, colorBy: e.target.value || undefined } })}
                  >
                    <option value="">(uniform)</option>
                    <option value="alt">Altitude</option>
                    {d.variables.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {d.kind !== 'photos' && (
                <button className="plots-button" onClick={() => expandDataset(d.id)}>
                  View all plots →
                </button>
              )}
            </div>
          ))}
        </section>
      ))}

      {warnings.length > 0 && (
        <details className="warnings">
          <summary>Warnings ({warnings.reduce((n, w) => n + w.messages.length, 0)})</summary>
          {warnings.map((w, i) => (
            <ul key={i}>
              {w.messages.map((m, j) => (
                <li key={j}>{m}</li>
              ))}
            </ul>
          ))}
        </details>
      )}
    </aside>
  );
}
