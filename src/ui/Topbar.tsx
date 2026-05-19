import { useState } from 'react';
import { BASEMAPS } from '../map/basemaps';
import { useStore } from '../data/store';
import { encodeShare, type ShareState } from '../lib/share';

export function Topbar({
  basemap,
  setBasemap,
}: {
  basemap: string;
  setBasemap: (id: string) => void;
}) {
  const clearAll = useStore((s) => s.clearAll);
  const datasets = useStore((s) => s.datasets);
  const altitudeExaggeration = useStore((s) => s.altitudeExaggeration);
  const showAltitudeTowers = useStore((s) => s.showAltitudeTowers);
  const timeWindow = useStore((s) => s.timeWindow);
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    // Pick map state off the live MapLibre instance if available.
    let mapState: Partial<ShareState> = {};
    const mapEl = document.querySelector('.map-container') as any;
    if (mapEl?.maplibreInstance) {
      const m = mapEl.maplibreInstance;
      const c = m.getCenter();
      mapState = { c: [c.lng, c.lat], z: m.getZoom(), p: m.getPitch(), b: m.getBearing() };
    }
    const state: ShareState = {
      ...mapState,
      bm: basemap,
      ex: altitudeExaggeration,
      t3: showAltitudeTowers ? 1 : 0,
      tw: timeWindow ? [timeWindow.start, timeWindow.end] : undefined,
    };
    const hash = '#' + encodeShare(state);
    const url = `${location.origin}${location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      history.replaceState(null, '', hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this share link:', url);
    }
  };

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
        <button className="link" onClick={onShare} title="Copy a share link to the current view">
          {copied ? '✓ copied' : 'Share link'}
        </button>
        {datasets.length > 0 && (
          <button className="link" onClick={() => confirm('Remove all loaded datasets?') && clearAll()}>
            Clear all
          </button>
        )}
      </div>
    </header>
  );
}
