// Open / no-key basemaps. MapLibre will fetch raster tiles directly.
export interface BasemapDef {
  id: string;
  name: string;
  style: maplibregl.StyleSpecification;
}

const OSM_STYLE = (id: string, name: string, tilePattern: string, attribution: string): BasemapDef => ({
  id,
  name,
  style: {
    version: 8,
    sources: {
      [id]: {
        type: 'raster',
        tiles: [tilePattern],
        tileSize: 256,
        attribution,
        maxzoom: 19,
      },
    },
    layers: [{ id: `${id}-layer`, type: 'raster', source: id }],
  } as any,
});

export const BASEMAPS: BasemapDef[] = [
  OSM_STYLE(
    'osm',
    'OpenStreetMap',
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    '© OpenStreetMap contributors',
  ),
  OSM_STYLE(
    'opentopo',
    'OpenTopoMap',
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    '© OpenTopoMap (CC-BY-SA) / © OpenStreetMap contributors',
  ),
  OSM_STYLE(
    'esri-sat',
    'Esri Satellite',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'Tiles © Esri, Maxar, Earthstar Geographics',
  ),
];
