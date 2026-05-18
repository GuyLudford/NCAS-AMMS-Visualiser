import { useStore } from '../data/store';
import { GROUP_INFO } from '../data/types';

export function Sidebar() {
  const datasets = useStore((s) => s.datasets);
  const updateDataset = useStore((s) => s.updateDataset);
  const removeDataset = useStore((s) => s.removeDataset);
  const warnings = useStore((s) => s.warnings);

  return (
    <aside className="sidebar">
      <h2>Datasets ({datasets.length})</h2>
      {datasets.length === 0 && <p className="muted">No data loaded yet.</p>}
      {datasets.map((d) => (
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
            {d.meta.instrument}
            {d.meta.group && ` · ${GROUP_INFO[d.meta.group as keyof typeof GROUP_INFO]?.name ?? d.meta.group}`}
            {` · ${d.records.length} samples`}
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
        </div>
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
