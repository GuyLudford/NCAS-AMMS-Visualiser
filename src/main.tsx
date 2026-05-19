import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { decodeShare } from './lib/share';
import { useStore } from './data/store';
import './index.css';

// Apply non-map share state (exaggeration, towers, time window) before
// the first render so we don't get a flash of the defaults.
const share = decodeShare(window.location.hash);
if (share) {
  const s = useStore.getState();
  if (share.ex != null) s.setAltitudeExaggeration(share.ex);
  if (share.t3 != null) s.setShowAltitudeTowers(share.t3 === 1);
  if (share.tw) s.setTimeWindow({ start: share.tw[0], end: share.tw[1] });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
