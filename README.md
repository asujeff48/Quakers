# Quakers

Live map of reported earthquakes across the United States, using public [USGS Earthquake Catalog](https://earthquake.usgs.gov/) data.

## Features

- Magnitude-scaled markers color-coded by strength (pink → brown → yellow → purple → green → red → light blue → dark blue)
- Timeframes: **24 hours** (default), 48 hours, 1 week, 1 month
- Click a quake for a popup with locale, state, date/time, and magnitude
- Nearby quakes cluster at wider zooms (count + strongest magnitude); click a cluster to zoom in, or spiderfy at close zoom
- Zoom +/- controls, drag/pan, and touch pinch-zoom / touch-drag on phones and tablets
- Covers the contiguous U.S., Alaska, Hawaii, and Puerto Rico / U.S. Virgin Islands

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy (Railway)

Same pattern as SkyLight:

1. Railway builds the `Dockerfile` (Vite build → Caddy static server).
2. Production autodeploys from GitHub `main`.
3. Caddy listens on `$PORT` (default `3000`).

## Data source

Earthquakes are requested from the USGS FDSN Event Web Service (`format=geojson`) and filtered to U.S. regions client-side.
