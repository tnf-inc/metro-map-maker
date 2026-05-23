# Changelog

## 0.5.0 - 2026-05-23

- Added top-right app appearance controls for System, Light, and Dark modes.
- Default appearance now follows the operating system preference and persists user overrides.

## 0.4.0 - 2026-05-23

- Routed line rendering through 0/45/90-degree metro-map angles.
- Styled normal station borders with their line color.
- Added capsule-shaped interchange markers with gradient borders based on all serving lines.

## 0.3.0 - 2026-05-23

- Switched map image export from SVG to PNG while keeping JSON export.
- Added JSON import, demo-load confirmation, and a resizable left toolbar.
- Split station creation from line drawing: Add creates standalone stations, while Connect joins two selected stations using the active line.
- Expanded grid rendering around the current viewport so it covers the whole visible canvas during pan and zoom.

## 0.2.0 - 2026-05-23

- Improved SVG export with standalone styles, background, and map-title filenames.
- Added local persistence, hotkeys, clear confirmation, pan/zoom canvas, and line-segment selection.
- Reworked station placement so the active line owns new stations and clicking on a segment inserts the station on that segment.

## 0.1.0 - 2026-05-23

- Initial Metro Map Maker release.
- Added interactive SVG map editor with station creation, dragging, line assignment, themes, and exports.
- Added visible version metadata, semantic version file, and roadmap.
