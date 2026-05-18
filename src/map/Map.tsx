import { useEffect, useMemo, useRef, useState } from 'react';
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

export function Map({ basemap }: { basemap: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const datasets = useStore((s) => s.datasets);
  const setSelection = useStore((s) => s.setSelection);

  // Initialise map
  useEffect(() => {
    if (!containerRef.current) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style ?? BASEMAPS[0].style;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [BLENCATHRA_CENTRE.lon, BLENCATHRA_CENTRE.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    mapRef.current = map;
    map.on('load', () => setReady(true));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []); // basemap changes handled separately

  // Swap style on basemap change without re-creating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style;
    if (style) {
      setReady(false);
      map.setStyle(style as any);
      map.once('idle', () => setReady(true));
    }
  }, [basemap, ready]);

  // Sync datasets → map layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncDatasetLayers(map, datasets, (sel) => setSelection(sel));
  }, [datasets, ready, setSelection]);

  // Fit bounds when datasets change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const bounds = computeBounds(datasets);
    if (bounds) {
      map.fitBounds(bounds, { padding: 60, animate: true, maxZoom: 15 });
    }
  }, [datasets.length, ready]);

  const attribution = useMemo(
    () => BASEMAPS.find((b) => b.id === basemap)?.style.sources ?? {},
    [basemap],
  );

  return <div ref={containerRef} className="map-container" data-attrib={JSON.stringify(attribution).slice(0, 0)} />;
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

// For each dataset, ensure a source + layer combo exists. Idempotent.
function syncDatasetLayers(
  map: MapLibre,
  datasets: Dataset[],
  onSelect: (sel: FeatureSel | null) => void,
) {
  const wantedIds = new Set<string>();
  for (const d of datasets) {
    wantedIds.add(`ds-${d.id}-pts`);
    wantedIds.add(`ds-${d.id}-line`);
  }
  // Remove stale layers/sources
  const style = map.getStyle();
  for (const layer of style?.layers ?? []) {
    if (layer.id.startsWith('ds-') && !wantedIds.has(layer.id)) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    }
  }
  for (const srcId of Object.keys(style?.sources ?? {})) {
    if (srcId.startsWith('ds-')) {
      const stillWanted = datasets.some((d) => srcId === `ds-${d.id}-src`);
      if (!stillWanted && map.getSource(srcId)) map.removeSource(srcId);
    }
  }

  for (const d of datasets) {
    const sourceId = `ds-${d.id}-src`;
    const pointsLayerId = `ds-${d.id}-pts`;
    const lineLayerId = `ds-${d.id}-line`;
    const geojson = datasetToGeoJSON(d);
    const existing = map.getSource(sourceId);
    if (existing) {
      (existing as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojson });
    }
    // Line for tracks
    if ((d.kind === 'track' || d.kind === 'profile') && d.records.length > 1) {
      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': d.style.color,
            'line-width': 3,
            'line-opacity': d.style.opacity,
          },
        });
      } else {
        map.setPaintProperty(lineLayerId, 'line-color', d.style.color);
        map.setPaintProperty(lineLayerId, 'line-opacity', d.style.opacity);
      }
    }
    // Points (always)
    if (!map.getLayer(pointsLayerId)) {
      map.addLayer({
        id: pointsLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': d.kind === 'photos' ? 8 : 5,
          'circle-color': ['coalesce', ['get', '__color'], d.style.color],
          'circle-stroke-color': '#000',
          'circle-stroke-width': 1,
          'circle-opacity': d.style.opacity,
        },
      });
      map.on('click', pointsLayerId, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const ri = (f.properties as any).__recordIndex as number;
        onSelect({ datasetId: d.id, recordIndex: ri });
      });
      map.on('mouseenter', pointsLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', pointsLayerId, () => {
        map.getCanvas().style.cursor = '';
      });
    } else {
      map.setPaintProperty(pointsLayerId, 'circle-opacity', d.style.opacity);
    }
    map.setLayoutProperty(pointsLayerId, 'visibility', d.style.visible ? 'visible' : 'none');
    if (map.getLayer(lineLayerId)) map.setLayoutProperty(lineLayerId, 'visibility', d.style.visible ? 'visible' : 'none');
  }
}

function datasetToGeoJSON(d: Dataset): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  // Per-point features (colour-by-variable applied here)
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

  d.records.forEach((r, i) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return;
    let color: string | undefined;
    if (colorBy && ramp && min < Infinity) {
      const v = pickVal(r, colorBy);
      if (v != null && Number.isFinite(v)) color = ramp(normalise(v, min, max));
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { __recordIndex: i, __color: color },
    });
  });

  if ((d.kind === 'track' || d.kind === 'profile') && d.records.length > 1) {
    const coords = d.records
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      .map((r) => [r.lon, r.lat] as [number, number]);
    if (coords.length > 1) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    }
  }

  return { type: 'FeatureCollection', features };
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
