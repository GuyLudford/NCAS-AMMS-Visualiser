import { useState } from 'react';
import { Map } from './map/Map';
import { Sidebar } from './ui/Sidebar';
import { Topbar } from './ui/Topbar';
import { Dropzone } from './ui/Dropzone';
import { DetailPanel } from './ui/DetailPanel';
import { PlotsView } from './ui/PlotsView';
import { SkewT } from './ui/SkewT';
import { TimeSlider } from './ui/TimeSlider';
import { CompareTray } from './ui/CompareTray';
import { useStore } from './data/store';

export function App() {
  const [basemap, setBasemap] = useState('osm');
  const expandedId = useStore((s) => s.expandedDatasetId);
  const expandedMode = useStore((s) => s.expandedMode);
  return (
    <div className="app">
      <Topbar basemap={basemap} setBasemap={setBasemap} />
      <div className="body">
        <Sidebar />
        <main>
          <div className="main-pane" style={{ display: expandedId ? 'none' : 'block' }}>
            <Map basemap={basemap} />
            <DetailPanel />
            <CompareTray />
            <TimeSlider />
          </div>
          {expandedId && expandedMode === 'plots' && <PlotsView />}
          {expandedId && expandedMode === 'skewt' && <SkewT datasetId={expandedId} />}
          <Dropzone />
        </main>
      </div>
    </div>
  );
}
