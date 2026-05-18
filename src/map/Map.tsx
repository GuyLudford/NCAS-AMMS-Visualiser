import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibre, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../data/store';
import { BASEMAPS } from './basemaps';
import { BLENCATHRA_CENTRE } from '../data/normalise/coords';
import { rampForVariable, normalise } from '../lib/colorScales';
import type { Dataset, SampleRecord } from '../data/types';

interface FeatureSel {
  datasetId: string;
  recordIndex?: number;
}

const TERRAIN_SOURCE_ID = 'terrain-dem';
const HILLSHADE_LAYER_ID = 'hillshade-layer';

// Render altitudes from this Z=0 reference. We use the dataset's minimum
// altitude so each track/profile starts at the visual "ground" — the user
// always sees the climb relative to the launch, regardless of whether the
// raw values are MSL or AGL.
function effectiveAltitude(d: Dataset, raw: number): number {
  const m = d.meta as { __altRef?: number };
  const ref = m.__altRef ?? 0;
  return Math.max(0, raw - ref);
}

function annotateAltRef(d: Dataset) {
  const valid = d.records.map((r) => r.alt).filter((a): a is number => a != null && Number.isFinite(a));
  if (!valid.length) return;
  const min = Math.min(...valid);
  (d.meta as { __altRef?: number }).__altRef = min;
}

export function Map({ basemap }: { basemap: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const datasets = useStore((s) => s.datasets);
  const setSelection = useStore((s) => s.setSelection);
  const altitudeExaggeration = useStore((s) => s.altitudeExaggeration);
  const showAltitudeTowers = useStore((s) => s.showAltitudeTowers);

  // Initialise once
  useEffect(() => {
    if (!containerRef.current) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style ?? BASEMAPS[0].style;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [BLENCATHRA_CENTRE.lon, BLENCATHRA_CENTRE.lat],
      zoom: 12.5,
      pitch: 50,
      bearing: -20,
      attributionControl: { compact: true },
      maxPitch: 85,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    mapRef.current = map;

    const onStyleLoad = () => {
      try {
        (map as any).setProjection?.({ type: 'globe' });
      } catch {
        /* ignore */
      }
      // DEM for hillshade only — we do NOT enable 3D terrain because that
      // would bury fill-extrusion towers (extrusion-base/height are absolute
      // Z metres, not terrain-relative).
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        } as any);
      }
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

  // Swap basemap style
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style;
    if (style) {
      setReady(false);
      map.setStyle(style as any);
    }
  }, [basemap, ready]);

  // Sync datasets → layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncDatasetLayers(map, datasets, (sel) => setSelection(sel), altitudeExaggeration, showAltitudeTowers);
  }, [datasets, ready, setSelection, altitudeExaggeration, showAltitudeTowers]);

  // Fit bounds on dataset count change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const bounds = computeBounds(datasets);
    if (bounds) map.fitBounds(bounds, { padding: 80, animate: true, maxZoom: 14, pitch: 55 } as any);
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
  return any ? [[minLon, minLat], [maxLon, maxLat]] : null;
}

function syncDatasetLayers(
  map: MapLibre,
  datasets: Dataset[],
  onSelect: (sel: FeatureSel | null) => void,
  altExaggeration: number,
  showTowers: boolean,
) {
  const wantedSrcIds = new Set<string>();
  const wantedLayerIds = new Set<string>();
  for (const d of datasets) {
    annotateAltRef(d);
    wantedSrcIds.add(`ds-${d.id}-src`);
    wantedSrcIds.add(`ds-${d.id}-towers-src`);
    wantedLayerIds.add(`ds-${d.id}-pts`);
    wantedLayerIds.add(`ds-${d.id}-line`);
    wantedLayerIds.add(`ds-${d.id}-towers`);
    wantedLayerIds.add(`ds-${d.id}-towercaps`);
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
    const capsLayer = `ds-${d.id}-towercaps`;

    const { points: ptsFC, line, towers: towersFC } = datasetToGeoJSON(d, altExaggeration);

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

    // Track line
    if ((d.kind === 'track' || d.kind === 'profile') && d.records.length > 1) {
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
            'fill-extrusion-base': 0,
            'fill-extrusion-height': ['get', '__height'],
            'fill-extrusion-opacity': 0.55,
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
      map.setLayoutProperty(towersLayer, 'visibility', d.style.visible ? 'visible' : 'none');

      // Bright caps so the tops of towers are visible at distance
      if (!map.getLayer(capsLayer)) {
        map.addLayer({
          id: capsLayer,
          type: 'fill-extrusion',
          source: towersSrcId,
          paint: {
            'fill-extrusion-color': ['coalesce', ['get', '__color'], d.style.color],
            'fill-extrusion-base': ['max', 0, ['-', ['get', '__height'], 6]],
            'fill-extrusion-height': ['get', '__height'],
            'fill-extrusion-opacity': 1,
          },
        });
      }
      map.setLayoutProperty(capsLayer, 'visibility', d.style.visible ? 'visible' : 'none');
    } else {
      if (map.getLayer(towersLayer)) map.setLayoutProperty(towersLayer, 'visibility', 'none');
      if (map.getLayer(capsLayer)) map.setLayoutProperty(capsLayer, 'visibility', 'none');
    }

    // Points
    if (!map.getLayer(ptsLayer)) {
      map.addLayer({
        id: ptsLayer,
        type: 'circle',
        source: srcId,
        filter: ['==', ['geometry-type'], 'Point'],
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
    } else {
      map.setPaintProperty(ptsLayer, 'circle-opacity', d.style.opacity);
    }
    map.setLayoutProperty(ptsLayer, 'visibility', d.style.visible ? 'visible' : 'none');
  }
}

function datasetToGeoJSON(d: Dataset, altExaggeration: number) {
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
  const towerFeatures: GeoJSON.Feature[] = [];
  const lineCoords: [number, number][] = [];

  d.records.forEach((r, i) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return;
    let color: string | undefined;
    if (colorBy && ramp && min < Infinity) {
      const v = pickVal(r, colorBy);
      if (v != null && Number.isFinite(v)) color = ramp(normalise(v, min, max));
    }
    pointFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { __recordIndex: i, __color: color },
    });
    lineCoords.push([r.lon, r.lat]);

    if (r.alt != null && Number.isFinite(r.alt)) {
      const eff = effectiveAltitude(d, r.alt);
      if (eff > 0.5) {
        const height = eff * altExaggeration;
        // Larger footprint so towers are easy to see; for sondes we use a
        // taller-than-wide column. Width adapts to height so very tall
        // sonde towers stay readable.
        const halfWidth = Math.min(40, Math.max(8, Math.log10(height + 10) * 6));
        const poly = squareAround(r.lon, r.lat, halfWidth);
        towerFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [poly] },
          properties: {
            __recordIndex: i,
            __color: color,
            __height: height,
          },
        });
      }
    }
  });

  let line: GeoJSON.Feature | null = null;
  if ((d.kind === 'track' || d.kind === 'profile') && lineCoords.length > 1) {
    line = { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: {} };
  }
  return {
    points: { type: 'FeatureCollection' as const, features: pointFeatures },
    line,
    towers: { type: 'FeatureCollection' as const, features: towerFeatures },
  };
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
