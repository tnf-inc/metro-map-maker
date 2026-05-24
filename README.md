# Metro Map Maker

Metro Map Maker is a powerful, no-build HTML transit-map designer. It runs directly in the browser and lets you draft stylized metro maps with stations, multiple colored lines, labels, themes, undo history, PNG export, and JSON import/export.

Current version: `0.5.5`

## Run Locally

Open (this link)[tnf-inc.github.io/matro-map-maker] in your browser.

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
- Versioned app metadata with map-title export filenames
- Export to PNG and JSON
- Import JSON maps
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
