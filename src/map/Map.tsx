import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibre, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../data/store';
import { BASEMAPS } from './basemaps';
import { BLENCATHRA_CENTRE, FSC_BLENCATHRA } from '../data/normalise/coords';
import { rampForVariable, normalise } from '../lib/colorScales';
import { decodeShare, applyToMap } from '../lib/share';
import type { Dataset, SampleRecord } from '../data/types';

interface FeatureSel {
  datasetId: string;
  recordIndex?: number;
}

const TERRAIN_SOURCE_ID = 'terrain-dem';
const HILLSHADE_LAYER_ID = 'hillshade-layer';
// Rough Blencathra-area ground elevation used as a fallback when the
// terrain tile hasn't streamed in yet.
const FALLBACK_GROUND_M = 280;

interface DatasetGroundInfo {
  minAlt: number;
  groundElev: number; // metres MSL — where the dataset's tower bases sit
}

export function Map({ basemap }: { basemap: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const datasets = useStore((s) => s.datasets);
  const setSelection = useStore((s) => s.setSelection);
  const altitudeExaggeration = useStore((s) => s.altitudeExaggeration);
  const showAltitudeTowers = useStore((s) => s.showAltitudeTowers);
  const timeWindow = useStore((s) => s.timeWindow);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  // Initialise once
  useEffect(() => {
    if (!containerRef.current) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style ?? BASEMAPS[0].style;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [BLENCATHRA_CENTRE.lon, BLENCATHRA_CENTRE.lat],
      zoom: 12.5,
      pitch: 55,
      bearing: -20,
      attributionControl: { compact: true },
      maxPitch: 85,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    map.addControl(new maplibregl.TerrainControl({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 }), 'top-right');
    mapRef.current = map;
    // Expose the instance for the share-link button to read view state.
    (containerRef.current as any).maplibreInstance = map;

    const onStyleLoad = () => {
      try {
        (map as any).setProjection?.({ type: 'globe' });
      } catch {
        /* ignore */
      }
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        } as any);
      }
      // Hillshade adds visual relief alongside the 3D terrain.
      if (!map.getLayer(HILLSHADE_LAYER_ID)) {
        map.addLayer({
          id: HILLSHADE_LAYER_ID,
          type: 'hillshade',
          source: TERRAIN_SOURCE_ID,
          paint: {
            'hillshade-shadow-color': '#0a0a14',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-exaggeration': 0.5,
          },
        });
      }
      // Re-enable 3D terrain so the mountain is visible. Towers are now
      // explicitly placed above ground using queryTerrainElevation.
      try {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });
      } catch {
        /* older runtime */
      }
      // Sky layer for a horizon when pitched.
      try {
        map.setSky({
          'sky-color': '#0b1220',
          'horizon-color': '#27374d',
          'fog-color': '#0b1220',
          'sky-horizon-blend': 0.4,
          'horizon-fog-blend': 0.4,
          'fog-ground-blend': 0.4,
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 0.8],
        } as any);
      } catch {
        /* ignore */
      }
      // Apply any view state from the URL hash on first load.
      const share = decodeShare(window.location.hash);
      if (share) applyToMap(map, share);
      setReady(true);
    };
    map.on('style.load', onStyleLoad);
    return () => {
      map.off('style.load', onStyleLoad);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style;
    if (style) {
      setReady(false);
      map.setStyle(style as any);
    }
  }, [basemap, ready]);

  // Dataset sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!hoverPopupRef.current) {
      hoverPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hover-popup' });
    }
    const hoverPopup = hoverPopupRef.current;

    syncDatasetLayers(map, datasets, (sel) => setSelection(sel), altitudeExaggeration, showAltitudeTowers, timeWindow, hoverPopup);

    const onIdle = () => syncDatasetLayers(map, datasets, (sel) => setSelection(sel), altitudeExaggeration, showAltitudeTowers, timeWindow, hoverPopup);
    map.once('idle', onIdle);
    return () => {
      map.off('idle', onIdle);
    };
  }, [datasets, ready, setSelection, altitudeExaggeration, showAltitudeTowers, timeWindow]);

  // Fit-to-bounds on dataset count change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const bounds = computeBounds(datasets);
    if (bounds) map.fitBounds(bounds, { padding: 80, animate: true, maxZoom: 14, pitch: 60 } as any);
  }, [datasets.length, ready]);

  return <div ref={containerRef} className="map-container" />;
}

function computeBounds(datasets: Dataset[]): LngLatBoundsLike | null {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  let any = false;
  for (const d of datasets) {
    if (!d.style.visible) continue;
    for (const r of d.records) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
      any = true;
      if (r.lat < minLat) minLat = r.lat;
      if (r.lat > maxLat) maxLat = r.lat;
      if (r.lon < minLon) minLon = r.lon;
      if (r.lon > maxLon) maxLon = r.lon;
    }
  }
  if (!any) return null;
  if (Math.abs(maxLat - minLat) < 0.0005) {
    minLat -= 0.002;
    maxLat += 0.002;
  }
  if (Math.abs(maxLon - minLon) < 0.0005) {
    minLon -= 0.002;
    maxLon += 0.002;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

function groundInfoFor(map: MapLibre, d: Dataset): DatasetGroundInfo {
  const alts = d.records.map((r) => r.alt).filter((a): a is number => a != null && Number.isFinite(a));
  const minAlt = alts.length ? Math.min(...alts) : 0;

  // Use the first sample with valid lat/lon as the dataset's "anchor" for a
  // terrain query. Falls back to the FSC if the data lacks fixes (sky-camera
  // etc.), or finally to a constant Blencathra ground elevation.
  const anchor = d.records.find((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)) ?? null;
  const lat = anchor?.lat ?? FSC_BLENCATHRA.lat;
  const lon = anchor?.lon ?? FSC_BLENCATHRA.lon;
  let terrain: number | null = null;
  try {
    terrain = map.queryTerrainElevation([lon, lat]);
  } catch {
    terrain = null;
  }
  const groundElev = terrain ?? Math.max(minAlt, FALLBACK_GROUND_M);
  return { minAlt, groundElev };
}

function syncDatasetLayers(
  map: MapLibre,
  datasets: Dataset[],
  onSelect: (sel: FeatureSel | null) => void,
  altExaggeration: number,
  showTowers: boolean,
  timeWindow: { start: number; end: number } | null,
  hoverPopup: maplibregl.Popup,
) {
  const filterTime = timeWindow
    ? ['all',
        ['has', '__t'],
        ['>=', ['get', '__t'], timeWindow.start],
        ['<=', ['get', '__t'], timeWindow.end],
      ] as any
    : null;
  const wantedSrcIds = new Set<string>();
  const wantedLayerIds = new Set<string>();
  for (const d of datasets) {
    wantedSrcIds.add(`ds-${d.id}-src`);
    wantedSrcIds.add(`ds-${d.id}-towers-src`);
    wantedLayerIds.add(`ds-${d.id}-pts`);
    wantedLayerIds.add(`ds-${d.id}-line`);
    wantedLayerIds.add(`ds-${d.id}-towers`);
  }
  const style = map.getStyle();
  for (const layer of style?.layers ?? []) {
    if (layer.id.startsWith('ds-') && !wantedLayerIds.has(layer.id) && map.getLayer(layer.id)) {
      map.removeLayer(layer.id);
    }
  }
  for (const srcId of Object.keys(style?.sources ?? {})) {
    if (srcId.startsWith('ds-') && !wantedSrcIds.has(srcId) && map.getSource(srcId)) {
      map.removeSource(srcId);
    }
  }

  for (const d of datasets) {
    const srcId = `ds-${d.id}-src`;
    const towersSrcId = `ds-${d.id}-towers-src`;
    const ptsLayer = `ds-${d.id}-pts`;
    const lineLayer = `ds-${d.id}-line`;
    const towersLayer = `ds-${d.id}-towers`;

    const ground = groundInfoFor(map, d);
    const { points: ptsFC, line, towers: towersFC } = datasetToGeoJSON(d, altExaggeration, ground);
    // Pre-compute __t (epoch seconds) on each feature so the time filter
    // can be a single MapLibre filter expression rather than rebuilding
    // GeoJSON every slider tick.
    const baseFilter = ['all', ['==', ['geometry-type'], 'Point']] as any;
    const pointsTimeFilter = filterTime ? ['all', baseFilter, filterTime] : baseFilter;
    const towersTimeFilter = filterTime ? ['all', filterTime] : null;

    const flatFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [...ptsFC.features, ...(line ? [line] : [])],
    };
    const existing = map.getSource(srcId);
    if (existing) (existing as maplibregl.GeoJSONSource).setData(flatFC);
    else map.addSource(srcId, { type: 'geojson', data: flatFC });

    const existingT = map.getSource(towersSrcId);
    if (existingT) (existingT as maplibregl.GeoJSONSource).setData(towersFC);
    else map.addSource(towersSrcId, { type: 'geojson', data: towersFC });

    // Track LINE — only for tracks (not profiles, whose records share lat/lon
    // and would render as a degenerate line). MapLibre drapes lines onto the
    // terrain surface, so this is the path-on-the-ground projection.
    if (d.kind === 'track' && line) {
      if (!map.getLayer(lineLayer)) {
        map.addLayer({
          id: lineLayer,
          type: 'line',
          source: srcId,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': d.style.color,
            'line-width': 3,
            'line-opacity': d.style.opacity,
          },
        });
      } else {
        map.setPaintProperty(lineLayer, 'line-color', d.style.color);
        map.setPaintProperty(lineLayer, 'line-opacity', d.style.opacity);
      }
      map.setLayoutProperty(lineLayer, 'visibility', d.style.visible ? 'visible' : 'none');
    } else if (map.getLayer(lineLayer)) {
      map.setLayoutProperty(lineLayer, 'visibility', 'none');
    }

    // 3D towers
    const hasTowers = towersFC.features.length > 0 && showTowers;
    if (hasTowers) {
      if (!map.getLayer(towersLayer)) {
        map.addLayer({
          id: towersLayer,
          type: 'fill-extrusion',
          source: towersSrcId,
          paint: {
            'fill-extrusion-color': ['coalesce', ['get', '__color'], d.style.color],
            'fill-extrusion-base': ['get', '__base'],
            'fill-extrusion-height': ['get', '__height'],
            'fill-extrusion-opacity': 0.6,
            'fill-extrusion-vertical-gradient': true,
          },
        });
        map.on('click', towersLayer, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const ri = (f.properties as any).__recordIndex as number;
          onSelect({ datasetId: d.id, recordIndex: ri });
        });
        map.on('mouseenter', towersLayer, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', towersLayer, () => (map.getCanvas().style.cursor = ''));
      } else {
        map.setPaintProperty(towersLayer, 'fill-extrusion-color', ['coalesce', ['get', '__color'], d.style.color]);
      }
      map.setFilter(towersLayer, (towersTimeFilter ?? null) as any);
      map.setLayoutProperty(towersLayer, 'visibility', d.style.visible && d.style.show3D !== false ? 'visible' : 'none');
    } else {
      if (map.getLayer(towersLayer)) map.setLayoutProperty(towersLayer, 'visibility', 'none');
    }

    // Ground points (always)
    if (!map.getLayer(ptsLayer)) {
      map.addLayer({
        id: ptsLayer,
        type: 'circle',
        source: srcId,
        filter: pointsTimeFilter as any,
        paint: {
          'circle-radius': d.kind === 'photos' ? 8 : 4,
          'circle-color': ['coalesce', ['get', '__color'], d.style.color],
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1,
          'circle-opacity': d.style.opacity,
        },
      });
      map.on('click', ptsLayer, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const ri = (f.properties as any).__recordIndex as number;
        onSelect({ datasetId: d.id, recordIndex: ri });
      });
      map.on('mouseenter', ptsLayer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', ptsLayer, () => (map.getCanvas().style.cursor = ''));
      map.on('mousemove', ptsLayer, (e) => {
        const f = e.features?.[0];
        if (!f) {
          hoverPopup.remove();
          return;
        }
        const ri = (f.properties as any).__recordIndex as number;
        const r = d.records[ri];
        if (!r) return;
        hoverPopup
          .setLngLat([r.lon, r.lat])
          .setHTML(renderHoverHtml(d, r))
          .addTo(map);
      });
      map.on('mouseleave', ptsLayer, () => hoverPopup.remove());
    } else {
      map.setPaintProperty(ptsLayer, 'circle-opacity', d.style.opacity);
      map.setFilter(ptsLayer, pointsTimeFilter as any);
    }
    map.setLayoutProperty(ptsLayer, 'visibility', d.style.visible ? 'visible' : 'none');
  }
}

function renderHoverHtml(d: Dataset, r: SampleRecord): string {
  const rows: string[] = [];
  rows.push(`<div class="hover-name">${escapeHtml(d.name)}</div>`);
  if (r.time) rows.push(`<div class="hover-row"><span>time</span><b>${escapeHtml(r.time)}</b></div>`);
  if (r.alt != null) rows.push(`<div class="hover-row"><span>alt</span><b>${r.alt.toFixed(0)} m</b></div>`);
  const keys = ['air_temperature', 'relative_humidity', 'pressure', 'wind_speed', 'wind_direction', 'dew_point'];
  for (const v of d.variables) {
    if (rows.length > 8) break;
    if (!keys.includes(v.key)) continue;
    const val = r.values[v.key];
    if (val == null) continue;
    const display = typeof val === 'number' ? val.toFixed(2) : String(val);
    rows.push(`<div class="hover-row"><span>${escapeHtml(v.label)}</span><b>${display} ${escapeHtml(v.unit)}</b></div>`);
  }
  return rows.join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function datasetToGeoJSON(d: Dataset, altExaggeration: number, ground: DatasetGroundInfo) {
  const colorBy = d.style.colorBy;
  let min = Infinity;
  let max = -Infinity;
  if (colorBy) {
    for (const r of d.records) {
      const v = pickVal(r, colorBy);
      if (v != null && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const ramp = colorBy ? rampForVariable(colorBy) : null;

  const pointFeatures: GeoJSON.Feature[] = [];
  const lineCoords: [number, number][] = [];

  d.records.forEach((r, i) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return;
    let color: string | undefined;
    if (colorBy && ramp && min < Infinity) {
      const v = pickVal(r, colorBy);
      if (v != null && Number.isFinite(v)) color = ramp(normalise(v, min, max));
    }
    const t = r.time ? Math.floor(new Date(r.time).getTime() / 1000) : null;
    pointFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { __recordIndex: i, __color: color, __t: t },
    });
    lineCoords.push([r.lon, r.lat]);
  });

  const towerFeatures = buildTowers(d, ramp, min, max, ground, altExaggeration);

  // Line: only emit for genuine tracks (kind='track') where lat/lon vary.
  let line: GeoJSON.Feature | null = null;
  if (d.kind === 'track' && lineCoords.length > 1) {
    const distinct = new Set<string>();
    for (const c of lineCoords) {
      distinct.add(`${c[0].toFixed(5)},${c[1].toFixed(5)}`);
      if (distinct.size > 1) break;
    }
    if (distinct.size > 1) {
      line = { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: {} };
    }
  }
  return {
    points: { type: 'FeatureCollection' as const, features: pointFeatures },
    line,
    towers: { type: 'FeatureCollection' as const, features: towerFeatures },
  };
}

const MAX_TOWERS = 100;

// Build per-sample 3D extrusion features. Two strategies depending on whether
// the dataset is essentially a vertical profile at one location or a
// horizontally-extended track.
function buildTowers(
  d: Dataset,
  ramp: ((t: number) => string) | null,
  vMin: number,
  vMax: number,
  ground: DatasetGroundInfo,
  altExaggeration: number,
): GeoJSON.Feature[] {
  const colorBy = d.style.colorBy;
  // Index records that have a real altitude and a position.
  const indexed = d.records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.alt != null && Number.isFinite(r.alt));
  if (!indexed.length) return [];

  const fixedPos = isFixedPosition(indexed.map((x) => x.r));
  const thinned = thinTo(indexed, MAX_TOWERS);
  const features: GeoJSON.Feature[] = [];

  if (fixedPos) {
    // STACKED segments: each tower starts where the previous one ended so the
    // column shows the full climb as a continuous gradient of coloured slices.
    const anchor = thinned[0].r;
    const sorted = [...thinned].sort((a, b) => (a.r.alt! - b.r.alt!));
    for (let k = 0; k < sorted.length; k++) {
      const { r, i } = sorted[k];
      const prevAlt = k === 0 ? ground.minAlt : sorted[k - 1].r.alt!;
      const segLowClimb = Math.max(0, prevAlt - ground.minAlt);
      const segHighClimb = Math.max(0, r.alt! - ground.minAlt);
      if (segHighClimb <= segLowClimb) continue;
      const base = ground.groundElev + segLowClimb * altExaggeration;
      const height = ground.groundElev + segHighClimb * altExaggeration;
      const halfWidth = 20;
      const poly = squareAround(anchor.lon, anchor.lat, halfWidth);
      const color = colorBy && ramp ? ramp(normalise(pickVal(r, colorBy) ?? 0, vMin, vMax)) : undefined;
      const t = r.time ? Math.floor(new Date(r.time).getTime() / 1000) : null;
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [poly] },
        properties: {
          __recordIndex: i,
          __color: color,
          __base: base,
          __height: height,
          __t: t,
        },
      });
    }
  } else {
    // Variable-position track: build a continuous "ribbon" by connecting
    // each thinned pair with a thin polygon extruded to the segment's
    // mid-altitude. Renders as a wall snaking through 3D space — much
    // cleaner than N discrete poles.
    for (let k = 0; k < thinned.length - 1; k++) {
      const a = thinned[k];
      const b = thinned[k + 1];
      const climbA = Math.max(0, a.r.alt! - ground.minAlt);
      const climbB = Math.max(0, b.r.alt! - ground.minAlt);
      const climb = (climbA + climbB) / 2;
      if (climb < 1) continue;
      const base = ground.groundElev;
      const height = base + climb * altExaggeration;
      // Build a thin quad along the line from a → b with a small
      // perpendicular offset so it has area to extrude.
      const widthM = 8;
      const dLatPerM = 1 / 111320;
      const dLonPerM = 1 / (111320 * Math.cos((a.r.lat * Math.PI) / 180));
      const dLat = b.r.lat - a.r.lat;
      const dLon = b.r.lon - a.r.lon;
      const horiz = Math.hypot(dLat / dLatPerM, dLon / dLonPerM) || 1;
      // Perpendicular unit vector in metres → degrees
      const px = (-dLon / dLonPerM / horiz) * widthM * dLonPerM;
      const py = (dLat / dLatPerM / horiz) * widthM * dLatPerM;
      const poly: [number, number][] = [
        [a.r.lon - px, a.r.lat - py],
        [a.r.lon + px, a.r.lat + py],
        [b.r.lon + px, b.r.lat + py],
        [b.r.lon - px, b.r.lat - py],
        [a.r.lon - px, a.r.lat - py],
      ];
      const color = colorBy && ramp ? ramp(normalise(pickVal(a.r, colorBy) ?? 0, vMin, vMax)) : undefined;
      const t = a.r.time ? Math.floor(new Date(a.r.time).getTime() / 1000) : null;
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [poly] },
        properties: {
          __recordIndex: a.i,
          __color: color,
          __base: base,
          __height: height,
          __t: t,
        },
      });
    }
  }
  return features;
}

// Roughly 50 m of horizontal spread → still treat as "fixed location".
function isFixedPosition(records: SampleRecord[]): boolean {
  if (records.length < 2) return true;
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const r of records) {
    if (r.lat < latMin) latMin = r.lat;
    if (r.lat > latMax) latMax = r.lat;
    if (r.lon < lonMin) lonMin = r.lon;
    if (r.lon > lonMax) lonMax = r.lon;
  }
  return latMax - latMin < 0.0006 && lonMax - lonMin < 0.001;
}

function thinTo<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) {
    out.push(arr[Math.min(arr.length - 1, Math.floor(i))]);
  }
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

function squareAround(lon: number, lat: number, halfWidthMeters: number): [number, number][] {
  const dLat = halfWidthMeters / 111320;
  const dLon = halfWidthMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

function pickVal(r: SampleRecord, key: string): number | null {
  if (key === 'alt') return r.alt ?? null;
  if (key === 'lat') return r.lat;
  if (key === 'lon') return r.lon;
  const v = r.values[key];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
