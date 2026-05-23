# Metro Map Maker

Metro Map Maker is a powerful, no-build HTML transit-map designer. It runs directly in the browser and lets you draft stylized metro maps with stations, multiple colored lines, labels, themes, undo history, PNG export, and JSON import/export.

Current version: `0.5.0`

## Features

- Interactive SVG workspace with snap-to-grid station placement
- Persistent browser storage that restores your last map
- System-default light/dark appearance with manual Light and Dark overrides
- Pan and wheel-zoom canvas for effectively infinite drafting
- Select, add-station, connect, and pan modes
- Multiple named metro lines with editable colors
- Connect tool for selecting two stations and joining them with the active line
- Lines render as clean 0/45/90-degree metro-map angles
- Normal station borders inherit their line color
- Interchanges use capsule markers with gradient borders from their lines
- Line segment selection and deletion
- Station rename, drag, and delete
- Paper, Midnight, and Signal Room themes
- Versioned app metadata with map-title export filenames
- Export to PNG and JSON
- Import JSON maps
- Shareable map links through encoded URL hashes
- Demo map preset for quick exploration

## Hotkeys

- `S`: Select stations and line segments
- `A`: Add standalone stations
- `C`: Connect two stations with the active line
- `P`: Pan mode
- `N` or `L`: New line
- `Cmd/Ctrl + Z`: Undo
- `Delete`: Delete selected station or selected segment
- `G`: Toggle grid
- `+` / `-`: Zoom

## Run Locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 4174
```

Then visit `http://127.0.0.1:4174`.

## Versioning

This project uses semantic versioning. The app version is visible in:

- `index.html` title and version badge
- `app.js` as `APP_VERSION`
- `VERSION`
- `CHANGELOG.md`

## Roadmap

- Station interchange styling
- Curved segment controls
- Printable poster layout presets
# Metro Map Maker

Metro Map Maker is a powerful, no-build HTML transit-map designer. It runs directly in the browser and lets you draft stylized metro maps with stations, multiple colored lines, labels, themes, undo history, and SVG/JSON exports.

Latest version: `0.1.0`

## Run Locally

Open [this page](https://tnf-inc.github.io/metro-map-maker/) in your browser.

## Features

- Interactive SVG workspace with snap-to-grid station placement
- Select, station, and line-building modes
- Multiple named metro lines with editable colors
- Station rename, drag, delete, and active-line assignment
- Paper, Midnight, and Signal Room themes
- Versioned map title display and versioned export filenames
- Export to SVG and JSON
- Shareable map links through encoded URL hashes
- Demo map preset for quick exploration

## Versioning

This project uses semantic versioning. The app version is visible in:

- `index.html` title and version badge
- `app.js` as `APP_VERSION`
- `VERSION`
- `CHANGELOG.md`

## Roadmap

- PNG export
- Station interchange styling
- Keyboard shortcuts
- Import JSON workflow
- Curved segment controls
- Printable poster layout presets
