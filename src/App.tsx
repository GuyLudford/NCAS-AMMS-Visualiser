import { useState } from 'react';
import { Map } from './map/Map';
import { Sidebar } from './ui/Sidebar';
import { Topbar } from './ui/Topbar';
import { Dropzone } from './ui/Dropzone';
import { DetailPanel } from './ui/DetailPanel';

export function App() {
  const [basemap, setBasemap] = useState('osm');
  return (
    <div className="app">
      <Topbar basemap={basemap} setBasemap={setBasemap} />
      <div className="body">
        <Sidebar />
        <main>
          <Map basemap={basemap} />
          <Dropzone />
          <DetailPanel />
        </main>
      </div>
    </div>
  );
}
