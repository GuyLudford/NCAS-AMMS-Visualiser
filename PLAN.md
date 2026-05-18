# NCAS-AMMS Visualiser — Implementation Plan

A web-based, map-centric data visualiser for the **NCAS Atmospheric Measurement & Modelling Summer School** at FSC Blencathra (Cumbria, UK), inspired by Marble Aerospace's ARIA visualiser (`maps.marble.aero/aria/`).

- **Stack**: React + Vite + TypeScript + MapLibre GL
- **Ingestion**: Drag-and-drop in browser (no backend; files never leave the user's machine). Whole-folder drops supported.
- **Hosting**: Static site on GitHub Pages
- **Plan status**: Updated 2026-05-18 after first-hand inspection of two zips (`uav_data.zip`, `4__Precipitation_NationHGITR.zip`) — all schemas in §3.2 are verified, not assumed.

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

### 3.2 What's actually in the data (verified from local zip 2026-05-18)

The user-supplied zips reveal a much richer dataset, organised by **instrument stream**, not by group. Two main top-level trees:

```
uav_data/
├── uav_data/                    UAV flight logs (HDF5)
│   ├── AMMSS_<GROUPCODE>_<YYYYMMDD>_<HHMMSSXX>_NN.h5
│   └── plots/                   pre-rendered alt/map/time PDFs and PNGs
├── windsonde_data/              Windsond radiosonde launches
│   └── <YYYY-MM-DD-HHMM>/       one folder per launch
├── skycamera_met/               fixed sky-camera met sensor
│   └── <YYYYMMDD>-WxSensor.csv  one CSV per day (1-minute cadence, CF-1.8)
├── kestrel_data/                handheld Kestrel 5500L weather meters
│   ├── WEATHER - <SERIAL>_<DATETIME>.csv
│   ├── cal.csv / cal.xlsx       inter-Kestrel calibration offsets
│   └── IMG_*.jpg                deployment photos
├── backpack_data/               student-built mobile loggers
│   └── log_data_<colour>_<YYYY-MM-DD>.txt
└── calibration_data/
    ├── HOBO reference thermometer/   reference truth for calibration
    └── Backpacks/                    backpack baseline logs

precipitation_nation/
├── 1- CC/                       per-group bundle: own walk + analysis
├── 2 - Silver Linings/
├── 3-Mountain Goats/
├── 4 - Precipitation Nation-HGITR/   has its own test4.h5 UAV flight
└── 5 - Gail's/                  group walk XLSX + own Kestrel timeseries
```

Group codes embedded in UAV filenames: `GCC` = Curiously Cirrus, `GPN` = Precipitation Nation (others to confirm: GSL, GMG, GGL).

#### Concrete schemas (all observed first-hand in the zips)

| Stream | File pattern | Schema | Sample / quirks |
|---|---|---|---|
| **UAV flight** | `AMMSS_<G>_YYYYMMDD_HHMMSSXX_NN.h5` | HDF5. Group `<YYYYMMDD>_<HHMMSS>/columns/dataframe` is a compound dataset with fields `Roll, Pitch, Yaw, Lat, Lng, Alt, Spd, Press, Temp, RH, Time`. `Time` is Unix epoch seconds (float). ~150-560 rows per flight at ~1.5 s cadence | Decimal-degree coords, °C, hPa, m/s, m. Companion PDF/PNG plots already exist per flight in `plots/`. |
| **UAV (CSV summary)** | `UAV_data1.csv` in a group folder | CSV: `Roll,Pitch,Yaw,Lat,Lng,Alt,Spd,Press,Temp,RH,Time` (ISO timestamp). Mirrors the HDF5 | Tidy, easy to parse first. |
| **Windsonde profile** | `<datetime>.sounding.csv` | Header line: `# Radiation correction v2.4. Params: lat=…, lon=…, utc_time=…`. Columns: `Height (m AGL), Pressure (mb), Temperature (C), Relative humidity (%), Wind speed (m/s), Wind direction (true deg)` | Clean vertical profile, ready to plot directly. Launch lat/lon parsed from header. |
| **Windsonde raw flight** | `<datetime>.raw_flight_history.csv` | `UTC time, Altitude (m MSL), Altitude (m AGL), Pressure (Pa), Speed, Heading, Temperature, RH, Internal T, Latitude, Longitude, Rise speed` | Gives the 3D balloon track. Lat/lon present only on some rows (GPS-tagged subsample). |
| **Windsonde KML** | `<datetime>.kml` | Standard KML with `<wpt>`/track from Windsond | Easy 3D track render. |
| **Windsonde SharpPy** | `<datetime>.sharppy.txt` | `%TITLE% … %RAW%` blocks with `PRES, HGHT, TEMP, DWPT, WDIR, WSPD`, `-9999` sentinels | Lets us drive a real **skew-T plot** in the detail panel. |
| **Windsonde Windsond log** | `<datetime>.sounding` | Proprietary text packet log (`[#MET:te=…,hu=…,pa=…]`) | Use only as a fallback. |
| **Sky-camera met (fixed station)** | `<YYYYMMDD>-WxSensor.csv` | CF-1.8 CSV, ~50 columns. Each variable has `<name>/value`, `/units`, `/quality_flag`, `/data_level`. Includes: air_temperature, relative_humidity, surface_air_pressure, internal_temperature, dew_point_temperature, wet_bulb_temperature, air_density, vapor_pressure, saturation_vapor_pressure, absolute_humidity, specific_humidity, mixing_ratio, heat_index, potential_temperature, virtual_temperature, enthalpy, humidex, **lifting_condensation_level_height** | 1-minute cadence (~1440 rows/day). Fixed station (no per-row lat/lon — one location at FSC). ISO-Z timestamps. |
| **Kestrel handheld** | `WEATHER - <SERIAL>_<DATETIME>.csv` | Multi-line preamble (Name, Model, Serial, Firmware, Profile Version, Hardware, LiNK Version), then blank line, then header row: `Time, Temp, Wet Bulb Temp., Rel. Hum., Baro., Altitude, Station P., Wind Speed, Heat Index, Dew Point, Dens. Alt., Crosswind, Headwind, Mag. Dir., True Dir., Wind Chill` | Multiple serials (2434489, 2434495, 2457683, 2478072, 2478073, 2478075) — one per group's Kestrel. Wind direction is `***` when speed is 0. |
| **Kestrel calibration** | `cal.csv` | `Reference` row from HOBO + per-serial offsets across T, Td, RH | Lets us apply per-Kestrel correction in the parser. |
| **Backpack logger** | `log_data_<colour>_<YYYY-MM-DD>.txt` | Each line: `$GPGGA,…,$GPRMC,…,BAT,12.42V,PP,97662Pa,PP_T,14.4C,PP_Z,308.7m,SHT_RH,44%,SHT_T,15.6C`. Pseudo-NMEA followed by key-value pairs at 5-second cadence | Colours: red, orange, brown, blue (4 backpacks). GPS often has no fix (0 satellites) in indoor / pre-deployment lines — must be tolerant. |
| **HOBO reference** | `<HOBO_SN> <date> BST.csv` | `Date-Time (BST), Temperature (°C), RH (%), Dew Point (°C)` + status columns | Single fixed reference logger — drives Kestrel calibration. BST not UTC — convert. |
| **Per-group walk XLSX** | `NCAS_AMMSS_Blencathra_150526_<GROUP>.xlsx` | The multi-sheet messy hand-collected hill traverse from §3.1 — but now **one workbook per group** (e.g. `…_GAILS.xlsx`) rather than the unified `ALL` workbook | Re-use the messy-schema parser from §3.1 unchanged. |
| **Group Kestrel time-series** | `Kestrel_Data 2.csv` (in Gail's folder) | Two `Time` columns prefix, then standard Kestrel header. `***` for unavailable wind dir | Long stationary deployment (Gail's recorded continuous). |
| **Per-group analysis bundles** | various PNG/PDF/pptx | Pre-rendered route maps, alt plots, T-P-RH plots, wind plots, "kestrel vs WRF temps" comparison plots, summit photos, group presentations | Render as image overlays / a "documents" tab — don't try to re-create from raw. |

#### What the actual data tells us about scope

1. **WRF model output is *already being compared* against Kestrel data** (`kestrel-wrf_temps.png` exists in CC group). So WRF rasters or pre-extracted WRF traces *will* be valuable — they may arrive as PNG/CSV traces rather than NetCDF, which is a much easier path.
2. **The sky camera is the closest thing to a base reference station** — high cadence, comprehensive variables, fixed location. It should be the always-on layer in the dashboard.
3. **The sondes' SharpPy export is a gift** — we get a real skew-T plot almost for free with `SHARPpy` data parsed natively.
4. **The UAV HDF5 is portable** — `h5wasm` runs HDF5 in the browser, so we can read the original `.h5` without conversion.
5. **The backpack log format is unique to this kit** — parser needs to be written from scratch but is a one-line regex job.
6. **Per-group folders are still uneven** (Silver Linings has only a photo, Mountain Goats only a pptx as of today). The tool should handle "this group has no data yet" gracefully.

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
    │   │   ├── index.ts                  # registry + filename-pattern sniffer
    │   │   ├── walkWorkbook.ts           # per-group NCAS_AMMSS_*.xlsx
    │   │   ├── uavHdf5.ts                # h5wasm: AMMSS_*.h5
    │   │   ├── uavCsv.ts                 # UAV_data1.csv
    │   │   ├── sondeSounding.ts          # *.sounding.csv (vertical profile)
    │   │   ├── sondeFlight.ts            # *.raw_flight_history.csv (3D track)
    │   │   ├── sharppy.ts                # *.sharppy.txt (skew-T)
    │   │   ├── skycamMet.ts              # *WxSensor.csv (CF-1.8)
    │   │   ├── kestrel.ts                # WEATHER - *.csv + Kestrel_Data*.csv
    │   │   ├── kestrelCal.ts             # cal.csv / cal.xlsx
    │   │   ├── hobo.ts                   # HOBO reference
    │   │   ├── backpack.ts               # log_data_<colour>_*.txt
    │   │   ├── gpx.ts                    # toGeoJSON
    │   │   ├── kml.ts
    │   │   ├── geojson.ts
    │   │   ├── photo.ts                  # exifr
    │   │   ├── attachment.ts             # PNG/PDF/PPTX as side-panel asset
    │   │   └── netcdf.ts                 # netcdfjs (stretch)
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

## 7. Parsing pipeline (per stream)

The format sniffer routes files by **name pattern first, extension second, content third** — the AMMS data has well-known filename conventions per instrument. Each parser produces one or more `Dataset` objects.

### 7.1 Format sniffer

```
AMMSS_*.h5                       → uavHdf5Parser           (kind=track 3D, sensors)
UAV_data1.csv / *UAV*.csv        → uavCsvParser            (kind=track 3D)
*.sounding.csv                   → sondeSoundingParser     (kind=profile)
*.raw_flight_history.csv         → sondeFlightParser       (kind=track, 3D balloon path)
*.sharppy.txt                    → sharppyParser           (kind=profile, skew-T)
windsonde.../*.kml               → kmlParser               (kind=track)
*WxSensor.csv                    → skycamMetParser         (kind=stations, CF-1.8)
WEATHER - *.csv                  → kestrelParser           (kind=stations)
Kestrel_Data*.csv                → kestrelParser           (variant: no preamble)
log_data_*.txt                   → backpackParser          (kind=track, sparse GPS)
HOBO *.csv / *20177802*.csv      → hoboParser              (kind=stations, BST→UTC)
NCAS_AMMSS_Blencathra_*.xlsx     → walkWorkbookParser      (kind=track per sheet)
*.gpx / *.kml (generic)          → genericGpsParser
*.jpg / *.heic / *.jpeg          → photoExifParser
*.png / *.pdf / *.pptx           → documentAttachmentParser  (carry as a thumbnail asset)
cal.csv / cal.xlsx               → kestrelCalibrationParser  (decorates other Kestrel datasets)
```

Files we cannot classify fall through to a **generic CSV** parser that prompts the user to map columns (time / lat / lon / alt / variables).

### 7.2 Per-stream parser notes

- **UAV HDF5 (`uavHdf5Parser`)** — open with `h5wasm` in a Web Worker. Discover the single top-level group (named `YYYYMMDD_HHMMSS`), read its `columns/dataframe` compound dataset, expand to a flat array of `SampleRecord`. Time is float Unix epoch — convert to ISO UTC. Extract group code from filename `AMMSS_<G>_…` and embed in `meta.group`.
- **Sonde sounding (`sondeSoundingParser`)** — parse the `# Params: lat=…, lon=…, utc_time=…` header to get the launch site, then read CSV as a `profile` dataset where the single (lat, lon) is shared and altitude varies row-wise.
- **Sonde raw flight (`sondeFlightParser`)** — sparse-GPS aware: forward-fill the last known fix so every row has a position (with a `lat_interpolated` flag).
- **SharpPy (`sharppyParser`)** — line-based: read `%RAW%` block. Replace `-9999.00` with null. Combine with the sounding launch site (same datetime) to plot a skew-T.
- **Skycam met (`skycamMetParser`)** — CF-1.8 style: split each header on `/` to recover `(variable, attribute)`. Pull `…/value` and `…/units` to build the variable list. Always a single fixed location — we need a config entry for the sky-camera site location (one-time constant: derive from the FSC Blencathra coords). Use this as the **anchor base station**.
- **Kestrel (`kestrelParser`)** — skip preamble lines until a row begins with `Time,`. Embed the serial number (from preamble) in `meta.instrument_serial`. Optional: apply `cal.csv` offsets when the calibration dataset is also loaded.
- **Backpack (`backpackParser`)** — regex per line: capture GPGGA time, GPRMC lat/lon (when fix valid), and the key-value tail. Mark fixes invalid when `GPGGA, …, ,0,00,` (no satellites). Output a `track` if any valid fixes, else `stations` at the rig's known site.
- **HOBO (`hoboParser`)** — strip BOM, parse the `Date-Time (BST)` column, convert BST → UTC (+0 in winter, -1 in BST).
- **Walk workbook (`walkWorkbookParser`)** — exactly the multi-sheet, multi-schema, alias-driven parser from the earlier plan. Now expected per-group (`…_CC.xlsx`, `…_GAILS.xlsx`, etc.) — the alias dictionary and coordinate normaliser cover all observed variants.
- **Photo EXIF (`photoExifParser`)** — `exifr` for GPS + DateTime; if both present render as photo pin, else attach to the parent dataset's metadata if dropped together.
- **Document attachments** — `.png/.pdf/.pptx` aren't georeferenced data, but they're meaningful artefacts. Park them in a per-group "Documents" tab in the side panel rather than the map.

### 7.3 Normalisation invariants

The dataset store always carries **decimal degrees (+N, +E), metres MSL, °C, hPa, m/s, ISO-8601 UTC**. Conversions happen at parse time, never at render time. Quirks already encountered:

- **Time zones**: Skycam = UTC. HOBO = BST. Kestrel = local (often BST). Sonde = UTC. Backpack GPGGA = UTC. The parser tags each dataset's source TZ in `meta.source_tz` and converts.
- **Wind direction sentinels**: Kestrel uses `***` when speed is 0 → null.
- **Sonde sentinels**: `-9999`.
- **Backpack no-fix lines**: lat/lon empty in GPGGA — drop the position, keep the rest.
- **Walk workbook quirks**: K/°C/°F, signed/unsigned longitudes, DMS triplets, etc. (full list in §3.1).

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

## 10. Deep-dive visualisations (per actual data type)

| Stream | Map representation | Detail panel plots |
|---|---|---|
| **Walk (per-group XLSX)** | One coloured polyline per group + sample markers | T/RH/P/wind vs time; **T vs altitude (lapse rate)**; wind rose; route map |
| **UAV flight (HDF5)** | 3D polyline coloured by altitude/T/RH; arrow markers at decimated samples; drone icon at last sample | Altitude/speed/Roll/Pitch/Yaw vs time; **T & RH vs altitude** (treat the climb as a profile); 3D scrubber along the path |
| **UAV CSV summary** | Same as HDF5 but flagged "from CSV" | Same |
| **Windsond sonde profile** | Vertical extruded column at launch site, gradient = RH | T & dew-point vs height; wind barbs; **skew-T** via SharpPy data; wind speed vs height |
| **Windsond raw flight track** | 3D balloon trajectory polyline | Rise speed vs time; lat/lon vs altitude; together-with-profile button |
| **Sky-camera met (fixed)** | Anchor pin at FSC; always visible | Multi-variable time-series with synchronised cursor; LCL height inset; daily mean / range |
| **Kestrel handheld** | Pin per serial (deployment site); halo shows "now-active" if time slider intersects | T / Tw / RH / P / wind speed time-series; wind-rose; calibration offset shown in caption |
| **HOBO reference** | Pin at indoor cal location | Reference T/RH time-series with calibration window highlighted |
| **Backpack logger** | Track polyline (where GPS valid) + pin (when stationary). Colour = SHT_T or PP | Pressure vs time, derived altitude vs time, T vs time, RH vs time |
| **Walk → UAV → Sonde co-plot** | All three on map together | Combined **T-vs-altitude** chart on a single axis — the headline synthesis plot |
| **WRF model trace** (if delivered as CSV) | Optional pin at extracted site | WRF T overlaid on Kestrel T (the `kestrel-wrf_temps.png` style) |
| **Photo** | Camera icon | Full-size viewer + EXIF + nearest met sample |
| **Document (PNG / PDF / PPTX)** | Not on map | Side-panel "Documents" tab per group |

---

## 11. Sample / bootstrap data

We commit a small set of demo files under `public/samples/` so the deployed page is useful without dropping anything:

- A **sanitised local copy** of `NCAS_AMMSS_Blencathra_150526_ALL.xlsx` (subject to user OK — the data is from a teaching exercise so we'll ask before committing).
- A synthetic radiosonde profile, a fake drone GPX, a small geotagged-photo set so every layer type has an example.

The app loads these by default when there's no IndexedDB state, behind a "Load demo data" pill on the empty state.

---

## 12. Phased roadmap (calendar-aware, post-data-inspection)

Synthesis day is **Wed 20 May**, presentations **Thu 21 May**. Order is set by *value per hour of work* given the data we now actually have.

### Phase 0 — Bootstrap (a few hours, Mon 18 May evening)
- Vite + React + TS project, MapLibre, ESLint/Prettier.
- GH Actions workflow → `gh-pages`.
- Empty map centred on Blencathra deploys cleanly.
- IndexedDB persistence; folder-drop ingestion (accept a whole directory drag, walk it, dispatch each file to the right parser).
- "Three quick-load buttons" on the empty state: **Walk only / UAV only / Everything** loads pre-bundled demo data so the page is useful immediately.

### Phase 1 — UAV + Sonde + Skycam (Tue 19 May morning)
These are the **three highest-value, lowest-mess** streams (clean schemas, real 3D, clear story):
- `uavCsvParser` + `uavHdf5Parser` (h5wasm) → 3D coloured tracks on a 3D-terrain map.
- `sondeSoundingParser` + `sondeFlightParser` + `sharppyParser` → vertical column + 3D balloon track + skew-T plot.
- `skycamMetParser` → fixed anchor pin with time-series.
- Detail panel with uPlot: time-series for UAV; T/Td/RH/wind vs height for sonde; multi-variable time-series for skycam.
- Time slider wired to all three.
- **Demo gate**: drop the `uav_data/` folder → 3 UAV flights as 3D tracks coloured by altitude, 4 sonde launches as vertical columns + skew-T, the sky camera as a fixed station — all on one map with a working time slider.

### Phase 2 — Walks + Kestrels + HOBO + the headline synthesis plot (Tue 19 May afternoon)
- `walkWorkbookParser` (the messy per-group XLSX, reusing the alias dictionary).
- `kestrelParser` + `hoboParser` + `kestrelCalibrationParser`.
- Compare tray with the **co-plot of walk + UAV + sonde T-vs-altitude** on one axis — this is *the* synthesis figure.
- Per-group colour scheme propagated through every dataset (filename → group code → colour).

### Phase 3 — Backpacks + photos + polish (Wed 20 May morning)
- `backpackParser` for the four colours; render as tracks where GPS valid.
- `photoExifParser` → camera pins; click to view full size in side panel.
- Per-group sidebar tabs (Walk / UAV / Sonde / Documents).
- "Generic CSV" fallback with column mapping UI.
- Empty state, supported-formats drawer, parser-warnings panel.

### Phase 4 — Synthesis polish (Wed 20 May afternoon)
- Share-link copies the current view + selection + time window.
- Export-PNG on every plot (for slide deck).
- Sample/demo data bundle published alongside (sanitised if needed).
- A read-only public deploy URL the students can paste into their presentations.

### Phase 5 — Stretch (Thu 21 May or post-course)
- WRF raster overlays (PNG slices preferred over NetCDF).
- Skew-T improvements: dry adiabats, moist adiabats, mixing ratio lines.
- Per-launch comparison view for sondes across different days.
- Backpack derived-altitude calibration against sonde profile.

---

## 13. Key libraries

| Concern | Library |
|---|---|
| Map | `maplibre-gl` |
| State | `zustand` |
| XLSX | `xlsx` (SheetJS, community edition) |
| CSV | `papaparse` |
| **HDF5 (UAV `.h5`)** | **`h5wasm`** — runs HDF5 in WebAssembly inside the browser |
| GPX/KML | `@tmcw/togeojson` |
| EXIF | `exifr` |
| **Skew-T** | `d3` + custom plot (no off-the-shelf JS lib for skew-T) |
| Plots | `uplot` (fast, tiny) + `plotly.js-basic-dist` for the few cases that need it |
| **Timezone** | `luxon` (BST↔UTC for HOBO/Kestrel) |
| NetCDF | `netcdfjs` (only if WRF NetCDF lands; PNG slices preferred) |
| Colour ramps | `d3-scale-chromatic` |
| Worker offload | `comlink` |

All MIT/BSD/Apache-licensed. Bundle stays under ~1.5 MB gzipped without Plotly, ~3 MB with it. `h5wasm` adds ~500 KB but is loaded on-demand only when an `.h5` file is dropped.

---

## 14. Risks / open questions (revised after seeing real data)

1. **Privacy of bundling real student data** in the public repo — recommend keeping the GitHub Pages site purely drag-and-drop and not committing the real zips. Anything bundled should be sanitised or synthetic.
2. **HDF5 in-browser bundle size** — `h5wasm` is ~500 KB; load it lazily only when an `.h5` is dropped to keep first-paint fast.
3. **Time-zone handling** — Skycam UTC, Sonde UTC, HOBO BST, Kestrel local. Critical to surface the inferred TZ on each dataset so the time slider lines them up correctly.
4. **Sky-camera site location** is needed but not in the CSV — hard-code (with override) from the FSC's known position. Confirm with the user before shipping.
5. **Sparse per-group data** (Silver Linings has only one photo, Mountain Goats only a pptx) — UI must gracefully show "no walk data yet" rather than rendering an empty layer.
6. **WRF outputs** haven't actually arrived as files yet — only as a pre-rendered comparison PNG. If WRF traces become available as CSV, easy. If as NetCDF, drop into stretch.
7. **Schema drift in walk workbooks** — alias dictionary needs to handle every typo variant (`Kestrel`, `Kestral`, `Turkey Temperature`, etc.). Warning panel surfaces unmatched columns.
8. **Coordinate sign convention** in walk sheets (West-positive in some, signed in others) — covered by the existing normaliser plus a "signs flipped to West" banner.
9. **Tile usage limits** — stick to free OSM-based providers; top-bar allows user-supplied Mapbox/Maptiler token.
10. **Mobile use during the walk** — out of scope for v1; this is a post-collection analysis tool.
11. **Pre-rendered plots** in per-group folders (PNG/PDF) — surface them as a "Documents" tab rather than try to reproduce them. Saves engineering effort while still respecting work the students have already done.

---

## 15. Definition of done (post-data-inspection)

### Phase 1 demo (Tue 19 May)
A user opens the deployed URL, drags the `uav_data/` folder onto it, and sees:
- The 3D map (terrain on) zoomed to Blencathra.
- UAV flights as 3D polylines, coloured by altitude; arrowheads showing direction.
- Each sonde launch as a vertical column with a colour-graded RH gradient; click → skew-T in the side panel.
- A fixed sky-camera pin with a live multi-variable time-series.
- A bottom time slider that scrubs the whole scene; only datasets within the time window render.
- A left-hand layer list that toggles each instrument on/off.

### Synthesis-day deliverable (Wed 20 May)
On the same page, also drag in the `precipitation_nation/` folder and the Kestrel CSVs to get:
- Per-group walk polylines.
- Kestrel pins along the route.
- A **single combined "T vs altitude" plot** in the compare tray showing every group's walk, the UAV climb, and the sonde profile from the same day — the headline AMMSS synthesis figure, exportable as PNG.
- A shareable URL that any group can paste into their presentation.
