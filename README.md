# NCAS-AMMS Visualiser

Web-based, map-centric data visualiser for the NCAS Atmospheric Measurement & Modelling Summer School at FSC Blencathra (May 2026).

See `PLAN.md` for the full design and roadmap.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/NCAS-AMMS-Visualiser/
```

Drop any of these onto the page to visualise:

- UAV flight logs — `AMMSS_*.h5` (HDF5) or `UAV_data*.csv`
- Windsond sondes — `*.sounding.csv`, `*.raw_flight_history.csv`
- Sky-camera met — `*WxSensor.csv`
- Kestrel handhelds — `WEATHER - *.csv` / `Kestrel_Data*.csv`
- Walk workbooks — `NCAS_AMMSS_Blencathra_*.xlsx`
- Photos with GPS EXIF

## Production build

```bash
npm run build       # outputs to ./dist
npm run preview     # serves the production build for inspection
```

## Deploy to GitHub Pages

The `.github/workflows/deploy.yml` workflow builds and deploys on every push to `main`. Enable GitHub Pages in repo settings (`Source: GitHub Actions`).

If the repo name changes, set `VITE_BASE=/<repo-name>/` in the workflow.

## Layout

```
src/
├── App.tsx
├── main.tsx
├── data/
│   ├── types.ts           # Dataset / SampleRecord / Variable models
│   ├── store.ts           # Zustand store
│   ├── parsers/           # one parser per data type, registered in index.ts
│   └── normalise/         # coords, time, units, sentinels
├── map/                   # MapLibre wrapper + basemaps
├── ui/                    # Dropzone, Sidebar, DetailPanel, Topbar
└── lib/                   # uuid, colour ramps
```
