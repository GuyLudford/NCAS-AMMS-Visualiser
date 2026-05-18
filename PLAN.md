# NCAS-AMMS Visualiser — Implementation Plan

A web-based, map-centric data visualiser for the **NCAS Atmospheric Measurement & Modelling Summer School** at FSC Blencathra (Cumbria, UK), inspired by Marble Aerospace's ARIA visualiser (`maps.marble.aero/aria/`).

- **Stack**: React + Vite + TypeScript + MapLibre GL
- **Ingestion**: Drag-and-drop in browser (no backend; files never leave the user's machine)
- **Hosting**: Static site on GitHub Pages

---

## 1. Goals

1. A single map view that displays every dataset produced during the summer school — fixed stations, hand-collected hill traverses, vertical profiles, drone tracks, instrument time-series, gridded overlays.
2. Drag any supported file onto the page to add it as a layer. The app sniffs the format, picks a parser, and renders it appropriately (point / track / profile / raster).
3. Click any feature to open a deep-dive panel: per-feature metadata, time-series plots, vertical profiles, cross-comparisons against other selected features.
4. Comparisons across groups / instruments / days — e.g. overlay all hill-traverse temperature profiles on one altitude–temperature plot.
5. Extensible parser/layer registry so new file types can be added without rewriting the core.
6. Works offline once the page is loaded; data stays local to the browser.

---

## 2. Reference: what we're emulating from `maps.marble.aero/aria/`

Marble Aerospace's ARIA visualiser is a map-centric dashboard for the ARIA-funded Arctic DronePort programme. Common patterns we want to lift (style-neutral):

- **Full-bleed map** as the primary canvas, with translucent overlays.
- **Left panel** for layer list / toggles / opacity / filters.
- **Right panel** that opens contextually when a feature is clicked — title, metadata table, embedded plots, related-data shortcuts.
- **Top bar** with a search box (find a station / track / time), and global controls (basemap, units, projection).
- **Bottom-docked time slider** that scrubs the entire scene (all time-varying layers re-render in sync).
- **Tracks** rendered as coloured polylines, point measurements as symbols, vertical profiles as columns/extrusions or as 2D plots in the side panel.
- **Click vs hover**: hover for quick tooltip, click for sticky deep-dive.
- **Layer styling responsive to a chosen variable** (e.g. colour-by-temperature, size-by-windspeed).

We are **not** copying ARIA branding, colours, or assets — just the interaction model.

---

## 3. Data inventory

### 3.0 Course context (from AMMSS Student Guide Book + Timetable 2026)

The summer school runs **Mon 11 – Fri 22 May 2026** at FSC Blencathra. The class is split into **five student groups**, each of which rotates through every experiment:

| Group | Name | Mentor |
|---|---|---|
| G1 | Curiously Cirrus | Laurents Marker |
| G2 | Silver Lining | Charles Chemel |
| G3 | Mountain Goats | Will Barker |
| G4 | Precipitation Nation | Doug Anderson |
| G5 | Gail's | Phil Rosenberg / Nick Marsden |

The timetable defines **four experimental data streams** that will populate the Drive folder:

1. **Walk (hill traverse)** — Day 5 (Fri 15 May). All groups walk and take handheld measurements. **This is the data already in the workbook**.
2. **Instrumentation build & deployment ("instr.")** — Days 3-4 build, Days 7-9 generate data. Student-built instruments deployed at fixed sites; produces time-series.
3. **UAV (drone)** — Day 7 onwards. Flights with payload sensors; produces 3D tracks + sensor telemetry.
4. **Sonde (radiosonde / tethered balloon)** — Days 7-9. Vertical atmospheric profiles (T, RH, P, wind vs height) from a fixed launch site.

Plus modelling output (WRF) from the "Modelling" day (Day 4) — gridded fields the students compare against observations.

Sessions 1–6 across Days 7–9 are explicitly rotation slots labelled e.g. `G1 UAV  G2 sonde data  G3 instr. data  G4 walk data  G5 walk data`. The synthesis day is **Day 10 (Wed 20 May)** and final presentations are **Day 11 (Thu 21 May)** — that is the practical deadline for the visualiser to be useful in-anger.

The mountain meteorology question the students are working on (from "Introduction to mountain meteorology and science questions"): understand temperature/wind/humidity structure on the Blencathra hillside, including lapse rate, valley/slope flows, and boundary-layer development.

### 3.1 What's directly visible in the shared Drive folder right now (verified 2026-05-18)

The shared root `AMMSS 2026 students shared folder` only exposes **one** file to this session's Drive access scope: the workbook **`NCAS_AMMSS_Blencathra_150526_ALL`**.

It is a multi-sheet workbook of hand-collected meteorological measurements made by student groups on a hillside traverse near FSC Blencathra (carpark ≈ 278 m up to ≈ 700 m, around 54.62°N / 3.08°W). Each student group has its own sheet with broadly the same data but **inconsistent schemas** and column conventions. Identified schema variants:

| # | Schema family | Distinguishing columns |
|---|---|---|
| A | `Title \| Time \| Latitude \| Longitude \| Altitude \| Pressure \| Turkey Temperature \| Kestrel Temperature \| Wet/Dry Bulb \| Kestrel Humidity \| Kestrel/Windometer Windspeed (5 reps) \| Wind Direction` | Coordinates in DD,MM,SS triplets; temperatures sometimes in K, sometimes in C; missing values as `-9999.9999` |
| B | `Measurement # \| Time \| Lat \| Lon \| Altitude (m) \| Air temp \| Dry/Wet bulb \| RH (table & formula) \| Max/avg windspeed \| Wind direction \| Pressure (hPa)` | Mixed-format altitude/temp, dashes for missing |
| C | `Time \| Altitude \| Lat \| Lon \| Temp from Probe \| Temp from Kestrel \| Dry/Wet bulb \| e_d \| e_w \| Whirling Hygrometer RH \| ... \| Cloud type \| Notes` | Includes textual cloud/oktas notes and qualitative comments |
| D | `Location name \| Measurement # \| Comments \| Time (UTC) \| Lat (DMS) \| Lon (DMS) \| Lat (DD) \| Lon (DD) \| Altitude \| Air temp 1/2/3 \| Mean air temp \| Dry/Wet bulb 1/2/3 \| ...` | Triple-replicate temperatures, separate DMS and DD lat/lon, includes named locations like "Car park" |
| E | `Station coordinates` table — fixed installations | "Handmade weather station (first placement)", "(second placement)", "Kestrel AWS" with altitude + lat/lon (DMS) |

**Coordinate formats encountered** (the parser must handle all of them):

- `54,37,16` (signed `D,M,S` triplet)
- `54°37'16"` (typographic DMS)
- `N5437258` / `W00304804` (NMEA-ish packed DMS)
- `54.61736111` (decimal degrees)
- Signed longitudes either as `-3,04,53` or `3,04,53` (West positive in some sheets!) — must be inferred from context (Blencathra is west of Greenwich, so all lons should end up negative)

**Unit quirks**: Temperatures appear in **K, °C and °F** across sheets. Pressure in hPa. Time as `YYYY-MM-DD HH:MM`, `HH:MM`, or `YYYY-MM-DDTHH:mm`. Missing values: `-9999.9999`, blanks, `-`.

### 3.2 The four expected subfolders and their data types

Based on the timetable, the Drive folder almost certainly has (or will have) subfolders along these lines — most likely one folder per data stream, with a per-group subfolder inside each (G1–G5):

```
AMMSS 2026 students shared folder/
├── Walk/                       ← already partly populated (the workbook)
│   ├── G1 Curiously Cirrus/
│   ├── G2 Silver Lining/
│   ├── G3 Mountain Goats/
│   ├── G4 Precipitation Nation/
│   └── G5 Gail's/
├── UAV/
│   └── (per group)
├── Sonde/
│   └── (per group)
├── Instrumentation/            ← student-built kit, fixed-station style
│   └── (per group)
└── Modelling/                  ← WRF outputs
```

**The subfolders are not visible to this session's Drive access** (only the top-level workbook is). To finalise the per-folder parser strategy we either need (a) the user to share the subfolders with the same account, (b) paste folder IDs / names here, or (c) accept that we'll build adapters generically and refine them when real data appears (which is the recommended path — see §16).

#### Expected file shapes per stream, and how each is visualised

| Stream | Per-group artefacts (expected) | Map representation | Detail-panel deep dive |
|---|---|---|---|
| **Walk** | One CSV/XLSX per group: timestamped lat/lon/alt + T, T-wet, T-dry, RH, P, wind reps, wind dir, cloud/oktas, notes (the existing workbook is the cross-group "ALL") | Coloured polyline along the path + sample markers; one colour per group | T/RH/P/wind vs time; **T vs altitude (lapse-rate plot)** — the canonical AMMSS visualisation; wind rose; route map |
| **UAV** | CSV/JSON flight log (timestamped lat/lon/alt + roll/pitch/yaw + payload sensor traces); maybe GPX/KML | 3D polyline coloured by altitude or sensor variable; arrow markers at decimated points | Altitude/speed vs time; **sensor trace vs height** (profile-like); cross-section with map |
| **Sonde** | CSV (one row per ascent sample) of time, P, T, RH, wind, height. Single launch site (the FSC) | Vertical 3D column at launch site, colour-graded by RH or T | T & dew-point vs height; wind barbs; **skew-T overlay against ECMWF/Met-O forecast if available** |
| **Instrumentation** | Group-specific time-series from student-built rigs at fixed deployment sites; very heterogeneous schemas; CSV most likely | Pin at deployment site; click to open | Time-series for every variable the rig measured; comparison against AWS at same site |
| **Modelling (WRF)** | NetCDF or pre-processed PNG/GeoTIFF of T/wind/cloud fields | Raster overlay with opacity + time slider | Hover to read gridded value; side-by-side with the observation that hits the same lat/lon/time |

**Other formats the tool should still handle generically** because anything could land in a folder during a teaching exercise: GPX hike tracks, KML, GeoJSON, EXIF-tagged photos, plain CSVs of (lat, lon, value).

### 3.3 Implementation priority forced by the calendar

Today is **Mon 18 May (Day 8 = Experiment 2)**. Useful-by deadline = **Wed 20 May (Day 10 = Synthesis)**. So priority must be:

1. **Walk data** (already collected, schema known, complex) — **do first**.
2. **Sonde data** (vertical profiles plot well, simple schema) — **second**.
3. **UAV** (3D track) — **third**.
4. **Instrumentation** (heterogeneous, hardest, lowest novelty value) — handle generically.
5. **Modelling/WRF** — defer beyond synthesis unless trivial.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (no backend)                   │
│                                                              │
│  ┌────────────┐    ┌────────────────┐    ┌──────────────┐    │
│  │  Dropzone  │──▶ │ Parser registry│──▶ │ Dataset store│    │
│  │ (any file) │    │ (format sniff) │    │  (Zustand)   │    │
│  └────────────┘    └────────────────┘    └──────┬───────┘    │
│                                                  │           │
│                            ┌─────────────────────┼─────────┐ │
│                            ▼                     ▼         ▼ │
│                     ┌──────────────┐    ┌──────────────┐ ┌─┐ │
│                     │ MapLibre map │    │ Side panels  │ │…│ │
│                     │  + layers    │    │ (plots etc.) │ │ │ │
│                     └──────────────┘    └──────────────┘ └─┘ │
└──────────────────────────────────────────────────────────────┘
```

- **No backend**. All parsing in browser via Web Workers for heavy formats.
- **Dataset store** is the single source of truth: list of `Dataset` objects, each with a `kind` (`points`/`track`/`profile`/`stations`/`raster`/`photos`), normalised records, and a `style` config.
- **Selectors** derive map sources, layer specs, plot inputs.
- **Persistence** in `IndexedDB` so reloading the page restores the previously dropped datasets (toggleable; default on).
- **Shareable state via URL** — view (centre/zoom), selected feature, time slider position, active layers — encoded into hash fragment so users can paste links to a moment.

---

## 5. Repository layout

```
NCAS-AMMS-Visualiser/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .github/workflows/deploy.yml          # GH Pages
├── public/
│   ├── samples/                           # bundled demo data
│   │   ├── blencathra-traverses.xlsx     # local copy of the Drive workbook
│   │   ├── kestrel-aws.csv
│   │   └── example.gpx
│   └── icons/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── map/
    │   ├── Map.tsx                       # MapLibre wrapper
    │   ├── basemaps.ts                   # OSM, OSM topo, OS Outdoor (key-free), satellite
    │   ├── layers/
    │   │   ├── pointsLayer.ts
    │   │   ├── trackLayer.ts
    │   │   ├── profileLayer.ts          # 3D extruded column
    │   │   ├── rasterLayer.ts
    │   │   └── photoLayer.ts
    │   └── hooks/
    │       ├── useMap.ts
    │       └── useFitBounds.ts
    ├── data/
    │   ├── types.ts                      # Dataset, Record, Variable, Units
    │   ├── store.ts                      # Zustand store
    │   ├── parsers/
    │   │   ├── index.ts                  # registry + format sniffer
    │   │   ├── xlsx.ts                   # SheetJS multi-sheet AMMS workbook
    │   │   ├── csv.ts                    # PapaParse
    │   │   ├── gpx.ts                    # toGeoJSON
    │   │   ├── kml.ts
    │   │   ├── geojson.ts
    │   │   ├── photo.ts                  # exifr for JPG/HEIC GPS
    │   │   └── netcdf.ts                 # netcdfjs (Phase 3)
    │   ├── normalise/
    │   │   ├── coords.ts                 # DMS/DD/NMEA → DD
    │   │   ├── time.ts                   # any → ISO UTC
    │   │   ├── units.ts                  # K↔°C↔°F, mph↔m/s, hPa, etc.
    │   │   └── sentinels.ts              # -9999.x → null
    │   └── derive/
    │       ├── humidity.ts               # Tetens / Magnus formula for RH from T/Tw
    │       ├── lapseRate.ts
    │       └── dewPoint.ts
    ├── ui/
    │   ├── Dropzone.tsx
    │   ├── Sidebar/
    │   │   ├── DatasetList.tsx
    │   │   ├── LayerControls.tsx
    │   │   └── StyleByVariable.tsx
    │   ├── DetailPanel/
    │   │   ├── FeatureDetail.tsx
    │   │   ├── TimeSeriesPlot.tsx        # Plotly or uPlot
    │   │   ├── ProfilePlot.tsx
    │   │   ├── CompareTray.tsx
    │   │   └── PhotoViewer.tsx
    │   ├── TimeSlider.tsx
    │   ├── Topbar.tsx                    # search, basemap, units, share link
    │   └── Legend.tsx
    └── lib/
        ├── colorScales.ts                # d3-scale-chromatic wrappers
        ├── geom.ts                       # bbox, smoothing, decimation
        └── share.ts                      # URL hash encode/decode
```

---

## 6. Core data model

```ts
type DatasetKind = 'points' | 'track' | 'profile' | 'stations' | 'photos' | 'raster';

interface Variable {
  key: string;             // 'air_temperature'
  label: string;           // 'Air temperature'
  unit: string;            // '°C'
  range?: [number, number];
}

interface SampleRecord {
  time?: string;           // ISO UTC
  lat: number;             // decimal degrees, +N
  lon: number;             // decimal degrees, +E (West negative)
  alt?: number;            // metres above MSL
  values: Record<string, number | string | null>;   // keyed by Variable.key
  notes?: string;
}

interface Dataset {
  id: string;
  name: string;
  source: { filename: string; sheet?: string };
  kind: DatasetKind;
  variables: Variable[];
  records: SampleRecord[];           // or {bbox + tileUrl} for raster
  style: {
    color: string;                   // base colour
    colorBy?: string;                // variable key
    sizeBy?: string;
    visible: boolean;
    opacity: number;
  };
  meta?: Record<string, unknown>;    // group name, instrument, date, etc.
}
```

The normaliser **always converts to**: decimal degrees, metres, °C, hPa, m/s, ISO-8601 UTC. The detail panel shows values in user-selected display units (°C/°F/K, m/s/mph) via a global units setting.

---

## 7. Parsing pipeline (the hard part)

The AMMS workbook is the canonical "messy" input. The pipeline must handle it robustly:

1. **File sniff** — extension + magic bytes pick a parser (`xlsx`, `csv`, `gpx`, `geojson`, `kml`, `jpg`, `nc`).
2. **For XLSX**: enumerate sheets. For each sheet:
   1. Detect the **header row** by scanning for known column names (case/whitespace-insensitive, fuzzy match on aliases: `Lat`, `Latitude`, `Latitude (DD)`, etc.).
   2. Below it, detect the **unit row** vs the first data row.
   3. Map each column to a canonical `Variable.key` via an **alias table** (`Turkey Temperature` → `air_temperature_probe`, `Kestral Humidity`/`Kestrel Humidity` → `relative_humidity`, etc.).
   4. Walk rows; for each non-empty row, normalise:
      - Coordinates → DD via `parseCoord()` which tries: decimal, `D,M,S`, `D°M'S"`, NMEA `N/S/E/W ddmmsss`.
      - West-longitude sign fix: if a sheet's longitudes are positive but the location is known-west, flip sign. Show a banner ("Lon signs flipped to West") to keep behaviour transparent.
      - Temperatures: if a unit row says K or values are all in [250, 320], treat as K and convert to °C.
      - Sentinels (`-9999*`, `-`, empty) → `null`.
   5. Derive missing values where possible: RH from T+Tw (Magnus), dew point, average windspeed from replicates.
3. **Classify the sheet**:
   - All rows share one lat/lon and many timestamps → `stations` time-series.
   - Rows have distinct lat/lon and timestamps in sequence → `track` with `points`.
   - All rows share one lat/lon but vary with altitude → `profile` (radiosonde-like).
4. **Yield one or more `Dataset` objects** to the store. The dropzone toast shows a summary: "Loaded 6 traverses (124 points), 3 stations from `NCAS_AMMSS_Blencathra_150526_ALL.xlsx`".
5. **Parser problems are surfaced**, not silenced: a warnings tab lists per-sheet issues ("sheet 'Group 4' — no usable timestamps", "altitude column missing in rows 3, 7"). Useful for the students to fix their own data.

---

## 8. Map & layers

- **Base map**: MapLibre GL with free OSM raster + OS OpenData "Outdoor" topo tile option (good for the Cumbrian terrain) + Esri World Imagery satellite. Switcher in the top bar. (Initial release: OSM only; topo + satellite in Phase 2.)
- **Default view**: centred on Blencathra `(54.6446, -3.0509)` at zoom 13. After datasets are loaded, fit-to-bounds with padding.
- **Terrain & hillshade**: MapLibre 3D terrain enabled (Maptiler-free DEM tiles or AWS Open Terrain). Toggle in top bar. Especially useful for the hillside traverses.
- **Layer types**:
  - **Points**: circle layer, radius/colour data-driven from selected variable. Cluster at low zoom.
  - **Tracks**: line layer (group polyline) with arrow direction symbols at decimated intervals; click anywhere on the line to select the nearest sample.
  - **3D profile column**: a vertical line-extrusion (or stacked points) at the launch site, colour-coded by RH or T. Click → opens profile plot.
  - **Photos**: camera-icon symbol at GPS; hover → thumbnail; click → full image in detail panel.
  - **Raster overlays**: image source with opacity slider.
- **Selection**: feature-state for hover and selected; halo styling for selected. Multiple selections via shift-click feed the **Compare tray** for cross-dataset plots.

---

## 9. UI components

### 9.1 Top bar
- App title, basemap dropdown, terrain toggle, units (°C/°F/K, m/s/mph), share-link button (copies the URL hash), help.

### 9.2 Left sidebar (collapsible)
- **Datasets**: list of loaded `Dataset`s, each with: visibility toggle, opacity slider, colour swatch, "style by variable" dropdown, kebab menu (rename, remove, download as GeoJSON).
- Drag-reorder for z-order.
- **Add data**: explicit button that opens the file picker (in addition to drop-anywhere).
- **Layer-on-layer filters**: time window (set by slider), value range slider for the active variable.

### 9.3 Bottom time slider
- Spans the min/max time across all visible datasets. Drag the playhead; hold + scrub a range. Play/pause auto-advance. All layers honour the time window.

### 9.4 Right detail panel
Opens when a feature is selected; can be widened to half-screen.
- **For a point on a track**: metadata table (raw values + derived), photo preview if any, "Show full track" button.
- **For a track**: summary (start/end time, distance, altitude gained, mean T/RH/wind), embedded:
  - Time-series mini-plots (T, RH, P, wind) — uPlot or Plotly.
  - Altitude-vs-time and **altitude-vs-temperature** profile (the classic AMMS lapse-rate plot).
  - "Send to compare tray" button.
- **For a station**: time-series of every variable.
- **For a profile**: T/RH/wind skew-T-style profile.

### 9.5 Compare tray (bottom drawer)
- Holds 2-N selected items; auto-plots them on shared axes (e.g. all selected traverses on one T-vs-alt chart, colour-coded). Export as PNG.

### 9.6 Legend
- Dynamic to the active "colour by" variable; gradient bar with units.

---

## 10. Deep-dive visualisations (per data type)

| Data type | Map representation | Detail panel plots |
|---|---|---|
| Hill traverse (Schema A–D) | Coloured polyline + sample markers | T/RH/P/wind vs time; T vs altitude (lapse rate); wind rose; map of just this group |
| Fixed AWS / "Kestrel AWS" station | Pin with rings | T/RH/P/wind time-series; daily summary |
| Radiosonde profile | Vertical column with colour gradient | T & dew-point vs height; wind barbs; skew-T (Phase 3) |
| Drone/UAV | 3D extruded polyline | Altitude/speed vs time; payload sensor traces |
| Lidar/ceilometer | Pin at site | Time-height contour of backscatter / cloud base |
| Aerosol OPC/SMPS | Pin | Size-distribution plot, mean conc time-series |
| Photo | Camera icon | Full-size viewer + EXIF + nearest met sample |
| Synoptic/satellite raster | Overlay | Opacity slider; toggle |

---

## 11. Sample / bootstrap data

We commit a small set of demo files under `public/samples/` so the deployed page is useful without dropping anything:

- A **sanitised local copy** of `NCAS_AMMSS_Blencathra_150526_ALL.xlsx` (subject to user OK — the data is from a teaching exercise so we'll ask before committing).
- A synthetic radiosonde profile, a fake drone GPX, a small geotagged-photo set so every layer type has an example.

The app loads these by default when there's no IndexedDB state, behind a "Load demo data" pill on the empty state.

---

## 12. Phased roadmap (calendar-aware)

Synthesis day is **Wed 20 May**, presentations **Thu 21 May**. We have ~48 hours of usable build time before synthesis, so the roadmap is collapsed:

### Phase 0 — Bootstrap (a few hours, Mon 18 May evening)
- Vite + React + TS project, MapLibre, ESLint/Prettier.
- GH Actions workflow that builds and deploys `dist/` to `gh-pages`.
- Empty map centred on Blencathra deploys cleanly.
- IndexedDB persistence wired up.

### Phase 1 — Walk data end-to-end (Tue 19 May morning)
- Parsers: XLSX (multi-sheet alias-driven) + CSV + GeoJSON + GPX.
- Coordinate / unit / sentinel normalisation, alias dictionary built from the real workbook.
- Map: point + track layers; click → feature detail; layer list with toggle/opacity/colour-by.
- Detail panel with **T-vs-altitude lapse-rate plot** (uPlot) — the highest-value single chart.
- **Demo gate**: drop the workbook → see all five groups' traverses, click any waypoint, read its values, view the lapse-rate plot.

### Phase 2 — Sonde + comparisons (Tue 19 May afternoon)
- Sonde CSV parser + vertical-column map representation + profile plot (T, Td, RH, wind vs height).
- Compare tray: stack multiple walks or sondes on shared axes.
- Time slider scoped to currently-visible datasets.

### Phase 3 — UAV (Wed 20 May morning)
- UAV CSV/GPX/JSON parser; 3D-extruded track (altitude as Z).
- Payload-sensor plots in detail panel.
- 3D terrain enabled by then for context.

### Phase 4 — Generic / instrumentation / polish (Wed 20 May afternoon)
- "Generic CSV" path: prompt the user to map columns to lat/lon/time/alt if auto-detection fails.
- Photo + EXIF layer.
- Empty-state, supported-formats help drawer, parser warnings panel.
- Share-link + screenshot button for use in slides.

### Phase 5 — Stretch goals (Thu 21 May or post-course)
- WRF/raster overlays, NetCDF, skew-T proper, value-at-cursor on rasters, side-by-side compare-with-model.

---

## 13. Key libraries

| Concern | Library |
|---|---|
| Map | `maplibre-gl` |
| State | `zustand` |
| XLSX | `xlsx` (SheetJS, community edition) |
| CSV | `papaparse` |
| GPX/KML | `@tmcw/togeojson` |
| EXIF | `exifr` |
| Plots | `uplot` (fast, tiny) + `plotly.js-basic-dist` for the few cases that need it |
| NetCDF | `netcdfjs` (Phase 3) |
| Colour ramps | `d3-scale-chromatic` |
| Worker offload | `comlink` |

All MIT/BSD/Apache-licensed; bundle stays under ~1.5 MB gzipped without Plotly, ~3 MB with.

---

## 14. Risks / open questions

1. **Subfolder access** — this session can only see `NCAS_AMMSS_Blencathra_150526_ALL` inside the shared folder, not the per-stream subfolders the user mentioned. Need either re-share of the subfolders to the same Drive account, or pasted folder IDs / a manual file dump. Without this we plan adapters on inference and refine when real files appear.
2. **Privacy of committing the real workbook** to a public repo for use as the demo. The data is student work; default to **not** committing it and instead ship synthetic demo data, then load the real workbook via drag-drop.
3. **Schema drift between groups** — the alias dictionary needs ongoing maintenance. The warning panel surfaces divergences so nothing is silently dropped.
4. **Heterogeneous coordinate sign conventions** — some sheets store West longitude as positive. The parser flips signs based on known location and shows a banner so the assumption is visible.
5. **Time zone ambiguity** — some sheets are UTC, some bare `HH:MM`. Default to UTC, warn when ambiguous.
6. **WRF NetCDF in-browser** is heavy. Deferred to stretch goals; if students need WRF overlays for synthesis, simplest path is to pre-render PNG slices server-side or by the modelling team and drop those.
7. **Tile usage limits** — stick to free OSM-based providers; allow the user to supply their own Mapbox/Maptiler token via the top-bar input for nicer tiles.
8. **Mobile use during the walk** — out of scope for v1; the visualiser is for post-collection analysis on a laptop, not in-field capture.

---

## 15. Definition of done (Phase 1 demo)

A user visits the deployed GitHub Pages URL, drags `NCAS_AMMSS_Blencathra_150526_ALL.xlsx` onto the page, and sees:

- The map zoomed to Blencathra with one coloured polyline per student group.
- A sidebar listing every group with toggles.
- Clicking any waypoint opens a detail panel with its T/RH/P/wind values and group context.
- Toggling colour-by-altitude recolours every track.
- A shareable URL preserves the view and selection.

Anything beyond that is Phase 2+.
