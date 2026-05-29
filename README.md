# Metro Map Maker

Metro Map Maker is a powerful, no-build HTML transit-map designer. It runs directly in the browser and lets you draft stylized metro maps with stations, multiple colored lines, labels, themes, undo history, PNG export, and JSON import/export.

Current version: `0.6.0`

## Features

- Interactive SVG workspace with snap-to-grid station placement
- Startup Projects page for creating, opening, renaming, duplicating, and deleting local maps
- Sunset and Lagoon theme selector on the Projects page
- Persistent browser storage that saves each project locally
- Editor shell theme selector shared with the Projects page
- Settings popover for adjusting line corner radius
- Pan and wheel-zoom canvas for effectively infinite drafting
- Select, add-station, connect, and pan modes
- Multiple named metro lines with editable colors
- Connect tool for selecting two stations and joining them with the active line
- Lines render as clean 0/45/90-degree metro-map angles
- Normal station borders inherit their line color
- Interchanges use capsule markers with simple black borders
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

Open tnf-inc.github.io/metro-map-maker/ in your browser.

## Versioning

This project uses semantic versioning. The app version is visible in:

- `VERSION`
- `CHANGELOG.md`
