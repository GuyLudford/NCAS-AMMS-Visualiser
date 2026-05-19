import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../data/store';
import type { Dataset, SampleRecord } from '../data/types';
import {
  dewPointFromRh,
  dryAdiabatT,
  mixingRatio,
  pressureFromAltitude,
  satVapourPressure,
  tFromMixingRatio,
} from '../lib/atmospheric';

// Self-contained skew-T plot rendered to a Canvas. The dataset can come
// from any sonde (SharpPy, sounding, raw, raw_history) or a UAV climb —
// anything with pressure + temperature + dew point (or RH).

interface Sample {
  p: number; // hPa
  T: number; // °C
  Td: number | null; // °C, may be null
  wdir: number | null; // wind direction, deg
  wspd: number | null; // wind speed, m/s
}

const T_LEFT = -45; // °C at top-left
const T_RIGHT = 50; // °C at bottom-right
const P_TOP = 100; // hPa at top
const P_BOT = 1050; // hPa at bottom
const SKEW = 45; // degrees of isotherm rotation

// Translates (T, p) into the unskewed plot axes, then we skew on render.
function yFromP(p: number, height: number): number {
  const r = Math.log(P_BOT / p) / Math.log(P_BOT / P_TOP);
  return height - r * height;
}

function skewedX(T: number, p: number, width: number, height: number): number {
  const ySkew = ((height - yFromP(p, height)) / height) * 0.65 * width; // 45° tan-ish
  return ((T - T_LEFT) / (T_RIGHT - T_LEFT)) * width + ySkew;
}

export function SkewT({ datasetId }: { datasetId: string }) {
  const dataset = useStore((s) => s.datasets.find((d) => d.id === datasetId) ?? null);
  const close = useStore((s) => s.expandDataset);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const samples = useMemo(() => (dataset ? extractSamples(dataset) : []), [dataset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      renderSkewT(ctx, cssW, cssH, samples);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [samples]);

  if (!dataset) return null;

  return (
    <div className="plots-view">
      <header className="plots-header">
        <button className="link back" onClick={() => close(null)}>
          ← Back to map
        </button>
        <div className="plots-title">
          <h2>Skew-T · {dataset.name}</h2>
          <div className="muted small">
            {samples.length} levels · {dataset.source.filename}
          </div>
        </div>
        <button
          className="link"
          onClick={() => {
            const c = canvasRef.current;
            if (!c) return;
            const a = document.createElement('a');
            a.download = `${dataset.name.replace(/[^a-z0-9]+/gi, '_')}_skewT.png`;
            a.href = c.toDataURL('image/png');
            a.click();
          }}
        >
          ⤓ PNG
        </button>
      </header>
      {samples.length < 2 ? (
        <div className="no-plots">Not enough levels with temperature + pressure to build a skew-T.</div>
      ) : (
        <div ref={wrapRef} className="skewt-wrap">
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}

function extractSamples(d: Dataset): Sample[] {
  const out: Sample[] = [];
  for (const r of d.records) {
    const t = pickN(r, 'air_temperature');
    if (t == null) continue;
    let p = pickN(r, 'pressure');
    if (p == null && r.alt != null) p = pressureFromAltitude(r.alt);
    if (p == null || !Number.isFinite(p)) continue;
    let td = pickN(r, 'dew_point');
    if (td == null) {
      const rh = pickN(r, 'relative_humidity');
      if (rh != null) td = dewPointFromRh(t, rh);
    }
    out.push({
      p,
      T: t,
      Td: td != null && Number.isFinite(td) ? td : null,
      wdir: pickN(r, 'wind_direction'),
      wspd: pickN(r, 'wind_speed'),
    });
  }
  // Sort by descending pressure (surface first) and dedupe near-identical levels
  out.sort((a, b) => b.p - a.p);
  return out;
}

function pickN(r: SampleRecord, key: string): number | null {
  const v = r.values[key];
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function renderSkewT(ctx: CanvasRenderingContext2D, W: number, H: number, samples: Sample[]) {
  const PAD = { top: 20, right: 60, bottom: 40, left: 50 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(PAD.left, PAD.top);

  // Isobars
  ctx.strokeStyle = '#1f2a44';
  ctx.fillStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui';
  for (const p of [1000, 850, 700, 500, 400, 300, 250, 200, 150, 100]) {
    const y = yFromP(p, ch);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
    ctx.stroke();
    ctx.fillText(`${p}`, -36, y + 4);
  }

  // Skewed isotherms every 10°C
  ctx.strokeStyle = '#1f2a44';
  for (let T = T_LEFT; T <= T_RIGHT + 30; T += 10) {
    ctx.beginPath();
    let first = true;
    for (let p = P_BOT; p >= P_TOP; p -= 30) {
      const x = skewedX(T, p, cw, ch);
      const y = yFromP(p, ch);
      if (x < -10 || x > cw + 10) continue;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // T label along the bottom axis
    const xLabel = skewedX(T, P_BOT, cw, ch);
    if (xLabel >= 0 && xLabel <= cw) {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${T}°`, xLabel - 8, ch + 14);
    }
  }

  // Dry adiabats (θ in K)
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
  for (const thetaC of [-20, 0, 20, 40, 60, 80, 100, 120, 140, 160]) {
    const thetaK = thetaC + 273.15;
    ctx.beginPath();
    let first = true;
    for (let p = P_BOT; p >= P_TOP; p -= 10) {
      const T = dryAdiabatT(thetaK, p);
      const x = skewedX(T, p, cw, ch);
      const y = yFromP(p, ch);
      if (x < -50 || x > cw + 50) {
        first = true;
        continue;
      }
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Saturation mixing-ratio lines (g/kg)
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
  ctx.setLineDash([4, 4]);
  for (const w of [0.5, 1, 2, 5, 10, 20]) {
    ctx.beginPath();
    let first = true;
    for (let p = P_BOT; p >= 200; p -= 10) {
      const T = tFromMixingRatio(w, p);
      const x = skewedX(T, p, cw, ch);
      const y = yFromP(p, ch);
      if (x < -50 || x > cw + 50) continue;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // T and Td profiles
  drawProfile(ctx, samples.map((s) => ({ x: s.T, p: s.p })), '#ef4444', 2.2, cw, ch);
  drawProfile(
    ctx,
    samples.filter((s) => s.Td != null).map((s) => ({ x: s.Td!, p: s.p })),
    '#10b981',
    2.2,
    cw,
    ch,
  );

  // Wind barbs on the right margin
  const barbX = cw + 30;
  ctx.strokeStyle = '#94a3b8';
  ctx.fillStyle = '#94a3b8';
  const seen = new Set<number>();
  for (const s of samples) {
    if (s.wspd == null || s.wdir == null) continue;
    const pBucket = Math.round(s.p / 50) * 50;
    if (seen.has(pBucket)) continue;
    seen.add(pBucket);
    const y = yFromP(s.p, ch);
    drawBarb(ctx, barbX, y, s.wdir, s.wspd);
  }

  ctx.restore();

  // Title / legend
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui';
  ctx.fillText('— T (°C)', W - 130, 14);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(W - 144, 8, 10, 2);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('— Td (°C)', W - 130, 28);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(W - 144, 22, 10, 2);

  ctx.font = '10px system-ui';
  ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
  ctx.fillText('· dry adiabat', 6, ch + PAD.top + 30);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
  ctx.fillText('· saturation mixing ratio', 6, ch + PAD.top + 42);
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; p: number }[],
  stroke: string,
  width: number,
  cw: number,
  ch: number,
) {
  if (pts.length < 2) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  let first = true;
  for (const pt of pts) {
    const x = skewedX(pt.x, pt.p, cw, ch);
    const y = yFromP(pt.p, ch);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawBarb(ctx: CanvasRenderingContext2D, cx: number, cy: number, dirDeg: number, speedMs: number) {
  // Convert m/s to knots
  const knots = speedMs * 1.94384;
  const rad = ((dirDeg + 180) * Math.PI) / 180; // points FROM the wind
  const len = 20;
  const dx = Math.sin(rad) * len;
  const dy = -Math.cos(rad) * len;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + dx, cy + dy);
  ctx.stroke();
  // Feathers
  const perpRad = rad + Math.PI / 2;
  const px = Math.sin(perpRad);
  const py = -Math.cos(perpRad);
  let remaining = knots;
  let offset = len;
  while (remaining >= 50) {
    // Pennant (filled triangle, 50 kt)
    const bx = cx + (Math.sin(rad) * offset);
    const by = cy + (-Math.cos(rad) * offset);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + px * 10, by + py * 10);
    ctx.lineTo(bx - Math.sin(rad) * 6, by + Math.cos(rad) * 6);
    ctx.closePath();
    ctx.fill();
    remaining -= 50;
    offset -= 6;
  }
  while (remaining >= 10) {
    const bx = cx + Math.sin(rad) * offset;
    const by = cy - Math.cos(rad) * offset;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + px * 8, by + py * 8);
    ctx.stroke();
    remaining -= 10;
    offset -= 4;
  }
  if (remaining >= 5) {
    const bx = cx + Math.sin(rad) * offset;
    const by = cy - Math.cos(rad) * offset;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + px * 4, by + py * 4);
    ctx.stroke();
  }
}
