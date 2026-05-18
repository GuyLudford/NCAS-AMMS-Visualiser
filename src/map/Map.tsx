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

export function Map({ basemap }: { basemap: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const datasets = useStore((s) => s.datasets);
  const setSelection = useStore((s) => s.setSelection);
  const altitudeExaggeration = useStore((s) => s.altitudeExaggeration);
  const showAltitudeTowers = useStore((s) => s.showAltitudeTowers);

  // Initialise map (once)
  useEffect(() => {
    if (!containerRef.current) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style ?? BASEMAPS[0].style;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [BLENCATHRA_CENTRE.lon, BLENCATHRA_CENTRE.lat],
      zoom: 12,
      pitch: 45,
      bearing: -20,
      attributionControl: { compact: true },
      maxPitch: 85,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    mapRef.current = map;

    map.on('style.load', () => {
      // Globe projection — supported in MapLibre 5+.
      try {
        (map as any).setProjection?.({ type: 'globe' });
      } catch {
        /* older runtime */
      }
      // Terrain (free AWS DEM tiles)
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          tiles: [
            'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        } as any);
      }
      try {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.4 });
      } catch {
        /* ignore */
      }
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // intentionally ignore basemap here; handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap style on basemap change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = BASEMAPS.find((b) => b.id === basemap)?.style;
    if (style) {
      setReady(false);
      map.setStyle(style as any);
    }
  }, [basemap, ready]);

  // Sync datasets → map layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncDatasetLayers(map, datasets, (sel) => setSelection(sel), altitudeExaggeration, showAltitudeTowers);
  }, [datasets, ready, setSelection, altitudeExaggeration, showAltitudeTowers]);

  // Fit bounds when dataset count changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const bounds = computeBounds(datasets);
    if (bounds) map.fitBounds(bounds, { padding: 80, animate: true, maxZoom: 14, pitch: 50 } as any);
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
  const wantedIds = new Set<string>();
  for (const d of datasets) {
    wantedIds.add(`ds-${d.id}-pts`);
    wantedIds.add(`ds-${d.id}-line`);
    wantedIds.add(`ds-${d.id}-towers`);
    wantedIds.add(`ds-${d.id}-src`);
    wantedIds.add(`ds-${d.id}-towers-src`);
  }
  const style = map.getStyle();
  for (const layer of style?.layers ?? []) {
    if (layer.id.startsWith('ds-') && !wantedIds.has(layer.id) && map.getLayer(layer.id)) {
      map.removeLayer(layer.id);
    }
  }
  for (const srcId of Object.keys(style?.sources ?? {})) {
    if (srcId.startsWith('ds-') && !wantedIds.has(srcId) && map.getSource(srcId)) {
      map.removeSource(srcId);
    }
  }

  for (const d of datasets) {
    const sourceId = `ds-${d.id}-src`;
    const towersSrcId = `ds-${d.id}-towers-src`;
    const pointsLayerId = `ds-${d.id}-pts`;
    const lineLayerId = `ds-${d.id}-line`;
    const towersLayerId = `ds-${d.id}-towers`;
    const { points: pointsFC, line: lineFC, towers: towersFC } = datasetToGeoJSON(d, altExaggeration);

    // Points + line source
    const flatFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [...pointsFC.features, ...(lineFC ? [lineFC] : [])],
    };
    const existing = map.getSource(sourceId);
    if (existing) (existing as maplibregl.GeoJSONSource).setData(flatFC);
    else map.addSource(sourceId, { type: 'geojson', data: flatFC });

    // Tower source (polygons for fill-extrusion)
    const existingTowers = map.getSource(towersSrcId);
    if (existingTowers) (existingTowers as maplibregl.GeoJSONSource).setData(towersFC);
    else map.addSource(towersSrcId, { type: 'geojson', data: towersFC });

    // Line layer for tracks
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
      map.setLayoutProperty(lineLayerId, 'visibility', d.style.visible ? 'visible' : 'none');
    }

    // Tower (3D extrusion) layer
    if (towersFC.features.length > 0 && showTowers) {
      if (!map.getLayer(towersLayerId)) {
        map.addLayer({
          id: towersLayerId,
          type: 'fill-extrusion',
          source: towersSrcId,
          paint: {
            'fill-extrusion-color': ['coalesce', ['get', '__color'], d.style.color],
            'fill-extrusion-base': ['coalesce', ['get', '__base'], 0],
            'fill-extrusion-height': ['get', '__height'],
            'fill-extrusion-opacity': 0.6,
          },
        });
        map.on('click', towersLayerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const ri = (f.properties as any).__recordIndex as number;
          onSelect({ datasetId: d.id, recordIndex: ri });
        });
        map.on('mouseenter', towersLayerId, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', towersLayerId, () => (map.getCanvas().style.cursor = ''));
      } else {
        map.setPaintProperty(towersLayerId, 'fill-extrusion-color', ['coalesce', ['get', '__color'], d.style.color]);
      }
      map.setLayoutProperty(towersLayerId, 'visibility', d.style.visible ? 'visible' : 'none');
    } else if (map.getLayer(towersLayerId)) {
      map.setLayoutProperty(towersLayerId, 'visibility', 'none');
    }

    // Points layer (always)
    if (!map.getLayer(pointsLayerId)) {
      map.addLayer({
        id: pointsLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': d.kind === 'photos' ? 8 : 4,
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
      map.on('mouseenter', pointsLayerId, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', pointsLayerId, () => (map.getCanvas().style.cursor = ''));
    } else {
      map.setPaintProperty(pointsLayerId, 'circle-opacity', d.style.opacity);
    }
    map.setLayoutProperty(pointsLayerId, 'visibility', d.style.visible ? 'visible' : 'none');
  }
}

function datasetToGeoJSON(
  d: Dataset,
  altExaggeration: number,
): { points: GeoJSON.FeatureCollection; line: GeoJSON.Feature | null; towers: GeoJSON.FeatureCollection } {
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

    // Build a vertical "altitude tower" if the sample has an altitude.
    if (r.alt != null && Number.isFinite(r.alt)) {
      const heightExaggerated = r.alt * altExaggeration;
      const poly = squareAround(r.lon, r.lat, 6); // 6m wide
      towerFeatures.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [poly] },
        properties: {
          __recordIndex: i,
          __color: color,
          __height: heightExaggerated,
          __base: 0,
        },
      });
    }
  });

  let line: GeoJSON.Feature | null = null;
  if ((d.kind === 'track' || d.kind === 'profile') && lineCoords.length > 1) {
    line = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lineCoords },
      properties: {},
    };
  }
  return {
    points: { type: 'FeatureCollection', features: pointFeatures },
    line,
    towers: { type: 'FeatureCollection', features: towerFeatures },
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
