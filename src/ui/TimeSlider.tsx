import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';

// Bottom-docked time slider. Spans the min/max time across every visible
// dataset; drag the window edges or the whole window to filter all map
// layers via their __t feature properties.
export function TimeSlider() {
  const datasets = useStore((s) => s.datasets);
  const window = useStore((s) => s.timeWindow);
  const setWindow = useStore((s) => s.setTimeWindow);
  const expanded = useStore((s) => s.expandedDatasetId);

  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of datasets) {
      if (!d.style.visible) continue;
      for (const r of d.records) {
        if (!r.time) continue;
        const t = Math.floor(new Date(r.time).getTime() / 1000);
        if (!Number.isFinite(t)) continue;
        if (t < min) min = t;
        if (t > max) max = t;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1) return null;
    return { min, max };
  }, [datasets]);

  // When the data range changes, reset the window to "all"
  useEffect(() => {
    if (!range) {
      if (window) setWindow(null);
      return;
    }
    if (!window || window.start < range.min || window.end > range.max) {
      setWindow({ start: range.min, end: range.max });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.min, range?.max]);

  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(60); // seconds advanced per frame

  // Animation
  useEffect(() => {
    if (!playing || !range || !window) return;
    const id = setInterval(() => {
      const w = useStore.getState().timeWindow;
      const r = range;
      if (!w) return;
      const span = w.end - w.start;
      let nextEnd = w.end + step;
      if (nextEnd > r.max) {
        nextEnd = r.min + span;
      }
      setWindow({ start: nextEnd - span, end: nextEnd });
    }, 100);
    return () => clearInterval(id);
  }, [playing, range, step, setWindow, window]);

  if (!range || expanded) return null;
  const w: { start: number; end: number } = window ?? { start: range.min, end: range.max };
  const span = range.max - range.min;
  const startFrac = (w.start - range.min) / span;
  const endFrac = (w.end - range.min) / span;

  const onDrag = (which: 'start' | 'end' | 'window') => (e: React.PointerEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const startWindow = { ...w };
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const t = range.min + frac * span;
      if (which === 'start') {
        const newStart = Math.min(t, w.end - 60);
        setWindow({ start: Math.round(newStart), end: w.end });
      } else if (which === 'end') {
        const newEnd = Math.max(t, w.start + 60);
        setWindow({ start: w.start, end: Math.round(newEnd) });
      } else {
        const fracStart = (startWindow.start - range.min) / span;
        const delta = frac - (fracStart + (startWindow.end - startWindow.start) / span / 2);
        const halfSpan = (startWindow.end - startWindow.start) / 2;
        const centre = range.min + (fracStart + (startWindow.end - startWindow.start) / span / 2 + delta) * span;
        const newStart = Math.max(range.min, Math.min(range.max - 2 * halfSpan, centre - halfSpan));
        setWindow({ start: Math.round(newStart), end: Math.round(newStart + 2 * halfSpan) });
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const reset = () => setWindow({ start: range.min, end: range.max });

  return (
    <div className="time-slider">
      <button className="link" onClick={() => setPlaying(!playing)}>{playing ? '⏸' : '▶'}</button>
      <select value={step} onChange={(e) => setStep(parseInt(e.target.value, 10))} className="step-select">
        <option value={10}>10 s/frame</option>
        <option value={60}>1 min/frame</option>
        <option value={600}>10 min/frame</option>
        <option value={3600}>1 hr/frame</option>
      </select>
      <span className="time-label">{fmt(w.start)}</span>
      <div className="time-track" ref={trackRef}>
        <div className="time-window" style={{ left: `${startFrac * 100}%`, width: `${(endFrac - startFrac) * 100}%` }} onPointerDown={onDrag('window')}>
          <div className="time-handle left" onPointerDown={onDrag('start')} />
          <div className="time-handle right" onPointerDown={onDrag('end')} />
        </div>
      </div>
      <span className="time-label">{fmt(w.end)}</span>
      <button className="link" onClick={reset} title="Reset to full range">↺</button>
    </div>
  );
}

function fmt(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${day}/${m} ${hh}:${mm}`;
}
