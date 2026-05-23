# Metro Map Maker

Metro Map Maker is a powerful, no-build HTML transit-map designer. It runs directly in the browser and lets you draft stylized metro maps with stations, multiple colored lines, labels, themes, undo history, and SVG/JSON exports.

Current version: `0.1.0`

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

- PNG export
- Station interchange styling
- Keyboard shortcuts
- Import JSON workflow
- Curved segment controls
- Printable poster layout presets
