# Yerevan Network Atlas — Electric Networks Department · HAYASTAN

An interactive, bilingual (English / Հայերեն) decision-maker site built from
`..\HEC_JSON\line.geojson` (1,697 line segments · 837.9 km · 6 / 10 / 35 kV).

## Live site

https://haykkhachatr.github.io/ENA/ — published with GitHub Pages from the `main` branch (root folder).
Every push to `main` redeploys it automatically.

## Open it

Double-click **`index.html`**. No server, build step or install is needed — the data is embedded
(`data/network-data.js`) and the map library and fonts are bundled in `vendor/`.
Only the basemap tiles need an internet connection; the network lines work offline.

## What is in it

| Section | What it gives decision-makers |
|---|---|
| Hero | Total network length and the real line geometry, animated |
| Sticky filters | Voltage · Branch · Community · Segment length · free-text search (name / ID / UID); active-filter chips; **Copy link** shares the exact filtered view |
| KPI strip | Length, segments, average/median segment, communities, branches — each against the full network |
| Key findings | Four plain-language findings written from the *current* selection |
| Map | Lines coloured by voltage or branch, density grid (500 m / 1 km), community labels, grey context for filtered-out lines, 4 basemaps, fit/fullscreen, click a line for details |
| Analysis | Voltage mix, length by branch (stacked by voltage), by community, branch × voltage matrix, segment-length distribution — every bar is clickable and cross-filters; each chart has a table view |
| Branch footprints | Mini-map per branch from its own geometry; click to focus the whole page |
| Segment register | Sortable, paged table of the selection; click a row to locate it; **CSV** and **GeoJSON** export of exactly what is filtered |
| Data notes | Source, length cross-check, identifier gaps, naming issues — the points to confirm before decisions |

Also: light / dark theme, EN / HY switch (preferences are remembered), print / *Save as PDF* layout, keyboard-accessible controls, reduced-motion support, phone layout.

## Updating the data

1. Get the new `line.geojson` export (same attribute names:
   `ID_final, UID, Province, Branch, Community, Name, Length (km), Voltage (kV)`).
2. Run `tools\rebuild_data.bat path\to\line.geojson` (needs Python 3; or
   `python tools/build_data.py path/to/line.geojson`). Without an argument it reads `..\..\HEC_JSON\line.geojson`.
3. Refresh the page. Branches, communities and all statistics update automatically; the data notes are recomputed too.

## Notes for IT

* **Basemaps** use Esri's public tile services (Light/Dark Gray, Streets, Imagery). CARTO and OpenStreetMap's
  own tile servers were not usable (API key required / blocked for desktop clients). For an externally hosted or
  production deployment, use a licensed source (an ArcGIS key, or your own tile server) — change the `BASES`
  table at the top of `js/map.js`.
* To host on an intranet, copy this folder to any web server; nothing else is required.
* Armenian interface text was drafted for this project — have a native reader review it before wider circulation.
  Latin spellings of Armenian place and segment names are generated automatically (BGN/PCGN-style); the original
  Armenian is always shown alongside them.
* Third-party: Leaflet 1.9.4 (BSD-2), Inter and Noto Sans Armenian (SIL OFL) — licences in `vendor/`.

## Folder map

```
index.html            page structure
css/styles.css        design tokens, layout, components, print
js/i18n.js            EN / HY strings
js/core.js            data model, filters, aggregation, palette, transliteration, export
js/charts.js          the five charts (+ table views)
js/map.js             Leaflet map and layers
js/ui.js              header, hero, filters, KPIs, findings, branch cards, table, notes
js/main.js            start-up
data/network-data.js  generated data (do not edit by hand)
tools/build_data.py   GeoJSON -> data/network-data.js
vendor/               Leaflet and fonts (bundled for offline use)
```
