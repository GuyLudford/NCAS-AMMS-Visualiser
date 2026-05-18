import { BASEMAPS } from '../map/basemaps';
import { useStore } from '../data/store';

export function Topbar({
  basemap,
  setBasemap,
}: {
  basemap: string;
  setBasemap: (id: string) => void;
}) {
  const clearAll = useStore((s) => s.clearAll);
  const datasets = useStore((s) => s.datasets);
  return (
    <header className="topbar">
      <div className="brand">
        <strong>NCAS-AMMS</strong> Visualiser
      </div>
      <div className="controls">
        <label className="small">
          Basemap
          <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
            {BASEMAPS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {datasets.length > 0 && (
          <button className="link" onClick={() => confirm('Remove all loaded datasets?') && clearAll()}>
            Clear all
          </button>
        )}
      </div>
    </header>
  );
}
