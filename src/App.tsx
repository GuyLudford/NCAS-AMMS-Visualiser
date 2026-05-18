import { useState } from 'react';
import { Map } from './map/Map';
import { Sidebar } from './ui/Sidebar';
import { Topbar } from './ui/Topbar';
import { Dropzone } from './ui/Dropzone';
import { DetailPanel } from './ui/DetailPanel';
import { PlotsView } from './ui/PlotsView';
import { useStore } from './data/store';

export function App() {
  const [basemap, setBasemap] = useState('osm');
  const expandedId = useStore((s) => s.expandedDatasetId);
  return (
    <div className="app">
      <Topbar basemap={basemap} setBasemap={setBasemap} />
      <div className="body">
        <Sidebar />
        <main>
          {/* Map is kept mounted so the WebGL context isn't torn down when toggling plots. */}
          <div className="main-pane" style={{ display: expandedId ? 'none' : 'block' }}>
            <Map basemap={basemap} />
            <DetailPanel />
          </div>
          {expandedId && <PlotsView />}
          <Dropzone />
        </main>
      </div>
    </div>
  );
}
