const APP_VERSION = "0.5.0";
const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "metro-map-maker:data:v1";

const defaultState = {
  title: "Harbor Loop Draft",
  tool: "select",
  activeLineId: "line-blue",
  selectedStationId: null,
  selectedSegment: null,
  connectStartStationId: null,
  showGrid: true,
  showLabels: true,
  uiTheme: "system",
  theme: "paper",
  viewport: { x: 0, y: 0, width: 1200, height: 760 },
  sidebarWidth: 340,
  stations: [
    { id: "st-1", name: "Central", x: 240, y: 330 },
    { id: "st-2", name: "Museum", x: 390, y: 260 },
    { id: "st-3", name: "Harbor", x: 550, y: 300 },
    { id: "st-4", name: "Market", x: 710, y: 390 },
    { id: "st-5", name: "Garden", x: 520, y: 500 },
    { id: "st-6", name: "Depot", x: 330, y: 480 }
  ],
  lines: [
    { id: "line-blue", name: "Blue Line", color: "#146c94", stations: ["st-1", "st-2", "st-3", "st-4"] },
    { id: "line-red", name: "Red Line", color: "#b5363d", stations: ["st-6", "st-5", "st-4"] }
  ],
  history: []
};

const state = structuredClone(defaultState);

const els = {
  canvas: document.querySelector("#mapCanvas"),
  status: document.querySelector("#statusText"),
  tools: document.querySelectorAll("[data-tool]"),
  undo: document.querySelector("#undoButton"),
  clear: document.querySelector("#clearButton"),
  addLine: document.querySelector("#addLineButton"),
  zoomIn: document.querySelector("#zoomInButton"),
  zoomOut: document.querySelector("#zoomOutButton"),
  lineName: document.querySelector("#lineNameInput"),
  lineColor: document.querySelector("#lineColorInput"),
  lineHint: document.querySelector("#lineHint"),
  lineList: document.querySelector("#lineList"),
  addStation: document.querySelector("#addStationButton"),
  stationName: document.querySelector("#stationNameInput"),
  renameStation: document.querySelector("#renameStationButton"),
  deleteStation: document.querySelector("#deleteStationButton"),
  selectionHint: document.querySelector("#selectionHint"),
  grid: document.querySelector("#gridToggle"),
  labels: document.querySelector("#labelsToggle"),
  mapTitle: document.querySelector("#mapTitleInput"),
  mapTitleDisplay: document.querySelector("#mapTitleDisplay"),
  theme: document.querySelector("#themeSelect"),
  exportPng: document.querySelector("#exportPngButton"),
  exportJson: document.querySelector("#exportJsonButton"),
  importJson: document.querySelector("#importJsonButton"),
  importJsonInput: document.querySelector("#importJsonInput"),
  loadDemo: document.querySelector("#loadDemoButton"),
  copyShare: document.querySelector("#copyShareButton"),
  appearanceButtons: document.querySelectorAll("[data-appearance]"),
  stationCount: document.querySelector("#stationCount"),
  lineCount: document.querySelector("#lineCount"),
  connectionCount: document.querySelector("#connectionCount"),
  lineButtonTemplate: document.querySelector("#lineButtonTemplate"),
  sidebarResizer: document.querySelector("#sidebarResizer")
};

let dragStationId = null;
let panStart = null;
let sidebarResizeStart = null;
let isRestoring = false;
const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function saveHistory() {
  state.history.push(JSON.stringify({
    title: state.title,
    activeLineId: state.activeLineId,
    selectedStationId: state.selectedStationId,
    selectedSegment: state.selectedSegment,
    connectStartStationId: state.connectStartStationId,
    viewport: state.viewport,
    stations: state.stations,
    lines: state.lines
  }));

  if (state.history.length > 60) {
    state.history.shift();
  }
}

function restore(snapshot) {
  const next = JSON.parse(snapshot);
  state.title = next.title;
  state.activeLineId = next.activeLineId;
  state.selectedStationId = next.selectedStationId;
  state.selectedSegment = next.selectedSegment || null;
  state.connectStartStationId = next.connectStartStationId || null;
  state.viewport = next.viewport || state.viewport;
  state.stations = next.stations;
  state.lines = next.lines;
  render();
  setStatus("Undone");
}

function getActiveLine() {
  return state.lines.find((line) => line.id === state.activeLineId) || state.lines[0];
}

function getSelectedStation() {
  return state.stations.find((station) => station.id === state.selectedStationId) || null;
}

function getSelectedSegment() {
  if (!state.selectedSegment) {
    return null;
  }
  const line = state.lines.find((item) => item.id === state.selectedSegment.lineId);
  if (!line) {
    return null;
  }
  const start = stationById(line.stations[state.selectedSegment.index]);
  const end = stationById(line.stations[state.selectedSegment.index + 1]);
  if (!start || !end) {
    return null;
  }
  return { line, start, end, index: state.selectedSegment.index };
}

function makeSvg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function setStatus(message) {
  els.status.textContent = message;
}

function snap(value) {
  return Math.round(value / 20) * 20;
}

function rawPointFromEvent(event) {
  const pt = els.canvas.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const transformed = pt.matrixTransform(els.canvas.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

function pointFromEvent(event) {
  const transformed = rawPointFromEvent(event);
  return {
    x: snap(transformed.x),
    y: snap(transformed.y)
  };
}

function stationById(id) {
  return state.stations.find((station) => station.id === id);
}

function stationLines(stationId) {
  return state.lines.filter((line) => line.stations.includes(stationId));
}

function stationColors(stationId) {
  const colors = stationLines(stationId).map((line) => line.color);
  return colors.length > 0 ? colors : ["#17212c"];
}

function routePoints(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX === 0 || absY === 0 || absX === absY) {
    return [start, end];
  }
  const signX = Math.sign(dx) || 1;
  const signY = Math.sign(dy) || 1;
  const bend = absX > absY
    ? { x: end.x - signX * absY, y: start.y }
    : { x: start.x, y: end.y - signY * absX };
  return [start, bend, end];
}

function segmentPath(start, end) {
  const points = routePoints(start, end);
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function linePath(line) {
  const points = line.stations.map(stationById).filter(Boolean);
  if (points.length === 0) {
    return "";
  }

  return points.slice(1).reduce((path, point, index) => {
    const routed = routePoints(points[index], point).slice(1);
    return `${path} ${routed.map((next) => `L ${next.x} ${next.y}`).join(" ")}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function segmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { distance: Math.hypot(point.x - start.x, point.y - start.y), point: start, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return {
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
    point: projected,
    t
  };
}

function nearestSegment(point, line) {
  let best = null;
  line.stations.forEach((stationId, index) => {
    const start = stationById(stationId);
    const end = stationById(line.stations[index + 1]);
    if (!start || !end) {
      return;
    }
    const measured = segmentDistance(point, start, end);
    if (!best || measured.distance < best.distance) {
      best = { ...measured, index, lineId: line.id };
    }
  });
  return best;
}

function addStation(point, name = `Station ${state.stations.length + 1}`) {
  saveHistory();
  const station = {
    id: `st-${Date.now().toString(36)}`,
    name,
    x: point.x,
    y: point.y
  };
  state.stations.push(station);
  state.selectedStationId = station.id;
  state.selectedSegment = null;
  state.connectStartStationId = null;

  setStatus("Station added");
  render();
}

function connectStations(startId, endId) {
  const activeLine = getActiveLine();
  if (!activeLine) {
    setStatus("Add or select a line first");
    return;
  }
  if (startId === endId) {
    setStatus("Pick a different station");
    return;
  }
  saveHistory();
  const startIndex = activeLine.stations.indexOf(startId);
  const endIndex = activeLine.stations.indexOf(endId);
  if (startIndex === -1 && endIndex === -1) {
    activeLine.stations.push(startId, endId);
  } else if (startIndex !== -1 && endIndex === -1) {
    activeLine.stations.splice(startIndex + 1, 0, endId);
  } else if (startIndex === -1 && endIndex !== -1) {
    activeLine.stations.splice(endIndex, 0, startId);
  } else if (Math.abs(startIndex - endIndex) !== 1) {
    activeLine.stations.splice(startIndex + 1, 0, endId);
  }
  state.selectedStationId = endId;
  state.selectedSegment = null;
  state.connectStartStationId = null;
  setStatus(`Connected on ${activeLine.name}`);
  render();
}

function addLine() {
  saveHistory();
  const palette = ["#146c94", "#b5363d", "#6f7c12", "#7d4a9e", "#d07b1f", "#21836f"];
  const nextNumber = state.lines.length + 1;
  const line = {
    id: `line-${Date.now().toString(36)}`,
    name: `Line ${nextNumber}`,
    color: palette[state.lines.length % palette.length],
    stations: []
  };
  state.lines.push(line);
  state.activeLineId = line.id;
  state.selectedStationId = null;
  state.selectedSegment = null;
  state.connectStartStationId = null;
  setStatus("Line added");
  render();
}

function clearMap() {
  if (!window.confirm("Clear this whole metro map?")) {
    setStatus("Clear canceled");
    return;
  }
  saveHistory();
  state.stations = [];
  state.lines = [];
  state.activeLineId = null;
  state.selectedStationId = null;
  state.selectedSegment = null;
  state.connectStartStationId = null;
  setStatus("Map cleared");
  render();
}

function renderGrid() {
  if (!state.showGrid) {
    return;
  }

  const grid = makeSvg("g", { "aria-hidden": "true" });
  const step = 80;
  const pad = step * 3;
  const minX = Math.floor((state.viewport.x - pad) / step) * step;
  const maxX = Math.ceil((state.viewport.x + state.viewport.width + pad) / step) * step;
  const minY = Math.floor((state.viewport.y - pad) / step) * step;
  const maxY = Math.ceil((state.viewport.y + state.viewport.height + pad) / step) * step;
  for (let x = minX; x <= maxX; x += step) {
    grid.appendChild(makeSvg("line", { class: "grid-line", x1: x, y1: minY, x2: x, y2: maxY }));
  }
  for (let y = minY; y <= maxY; y += step) {
    grid.appendChild(makeSvg("line", { class: "grid-line", x1: minX, y1: y, x2: maxX, y2: y }));
  }
  els.canvas.appendChild(grid);
}

function renderLines() {
  const group = makeSvg("g", { "aria-label": "Metro lines" });
  state.lines.forEach((line) => {
    const path = linePath(line);
    if (!path) {
      return;
    }
    group.appendChild(makeSvg("path", {
      class: "line-path",
      d: path,
      stroke: line.color,
      "data-line-id": line.id
    }));
    line.stations.slice(0, -1).forEach((stationId, index) => {
      const start = stationById(stationId);
      const end = stationById(line.stations[index + 1]);
      if (!start || !end) {
        return;
      }
      const selected = state.selectedSegment?.lineId === line.id && state.selectedSegment.index === index;
      if (selected) {
        group.appendChild(makeSvg("path", {
          class: "selected-segment-line",
          d: segmentPath(start, end)
        }));
      }
      group.appendChild(makeSvg("path", {
        class: "segment-hit",
        d: segmentPath(start, end),
        "data-line-id": line.id,
        "data-segment-index": index
      }));
    });
  });
  els.canvas.appendChild(group);
}

function renderStations() {
  const group = makeSvg("g", { "aria-label": "Stations" });
  const defs = makeSvg("defs");
  state.stations.forEach((station) => {
    const colors = stationColors(station.id);
    if (colors.length > 1) {
      const gradient = makeSvg("linearGradient", {
        id: `interchange-${station.id}`,
        x1: "0%",
        y1: "0%",
        x2: "100%",
        y2: "0%"
      });
      colors.forEach((color, index) => {
        gradient.appendChild(makeSvg("stop", {
          offset: `${colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100}%`,
          "stop-color": color
        }));
      });
      defs.appendChild(gradient);
    }
  });
  group.appendChild(defs);
  state.stations.forEach((station) => {
    const stationGroup = makeSvg("g", { "data-station-id": station.id });
    const colors = stationColors(station.id);
    const isInterchange = colors.length > 1;
    if (station.id === state.selectedStationId) {
      stationGroup.appendChild(makeSvg(isInterchange ? "rect" : "circle", isInterchange
        ? {
          class: "selection-ring interchange-ring",
          x: station.x - 28,
          y: station.y - 18,
          width: 56,
          height: 36,
          rx: 18,
          ry: 18
        }
        : {
          class: "selection-ring",
          cx: station.x,
          cy: station.y,
          r: 22
        }));
    }
    const dot = isInterchange
      ? makeSvg("rect", {
        class: "interchange-capsule",
        x: station.x - 24,
        y: station.y - 14,
        width: 48,
        height: 28,
        rx: 14,
        ry: 14,
        stroke: `url(#interchange-${station.id})`
      })
      : makeSvg("circle", {
        class: "station-dot",
        cx: station.x,
        cy: station.y,
        r: 15,
        stroke: colors[0]
      });
    const hit = makeSvg("circle", {
      class: "station-hit",
      cx: station.x,
      cy: station.y,
      r: 30
    });

    stationGroup.appendChild(dot);
    if (state.showLabels) {
      stationGroup.appendChild(makeSvg("text", {
        class: "station-label",
        x: station.x + 24,
        y: station.y - 20
      }));
      stationGroup.lastChild.textContent = station.name;
    }
    stationGroup.appendChild(hit);
    group.appendChild(stationGroup);
  });
  els.canvas.appendChild(group);
}

function renderLineList() {
  els.lineList.textContent = "";
  state.lines.forEach((line) => {
    const fragment = els.lineButtonTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".line-chip");
    button.dataset.lineId = line.id;
    button.classList.toggle("is-active", line.id === state.activeLineId);
    button.querySelector(".swatch").style.background = line.color;
    button.querySelector(".line-chip-name").textContent = line.name;
    button.title = `Select ${line.name}`;
    els.lineList.appendChild(fragment);
  });
}

function renderControls() {
  const activeLine = getActiveLine();
  const selectedStation = getSelectedStation();
  const selectedSegment = getSelectedSegment();

  els.lineName.value = activeLine?.name || "";
  els.lineColor.value = activeLine?.color || "#146c94";
  els.stationName.value = selectedStation?.name || "";
  els.mapTitle.value = state.title;
  els.mapTitleDisplay.textContent = state.title;
  els.grid.checked = state.showGrid;
  els.labels.checked = state.showLabels;
  els.theme.value = state.theme;
  els.stationCount.textContent = state.stations.length;
  els.lineCount.textContent = state.lines.length;
  els.connectionCount.textContent = state.lines.reduce((total, line) => total + Math.max(0, line.stations.length - 1), 0);
  els.appearanceButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.appearance === state.uiTheme);
  });
  els.lineHint.textContent = activeLine
    ? `Active: ${activeLine.name}. Connect two stations to draw it.`
    : "Add a line before connecting stations.";
  els.selectionHint.textContent = selectedStation
    ? state.tool === "connect" && state.connectStartStationId === selectedStation.id
      ? `${selectedStation.name} is waiting for a second station.`
      : `${selectedStation.name} is selected.`
    : selectedSegment
      ? `${selectedSegment.line.name} segment selected.`
      : "Select a station or line segment.";

  document.body.classList.toggle("theme-midnight", state.theme === "midnight");
  document.body.classList.toggle("theme-signal", state.theme === "signal");
  document.body.classList.toggle("connect-pending", Boolean(state.connectStartStationId));
  applyUiTheme();
  document.documentElement.style.setProperty("--sidebar-width", `${state.sidebarWidth || 340}px`);
}

function effectiveUiTheme() {
  return state.uiTheme === "system"
    ? systemDarkQuery.matches ? "dark" : "light"
    : state.uiTheme;
}

function applyUiTheme() {
  const effective = effectiveUiTheme();
  document.body.classList.toggle("app-dark", effective === "dark");
  document.body.classList.toggle("app-light", effective === "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effective === "dark" ? "#101820" : "#eef2f5");
}

function render() {
  els.canvas.textContent = "";
  els.canvas.setAttribute("viewBox", `${state.viewport.x} ${state.viewport.y} ${state.viewport.width} ${state.viewport.height}`);
  renderGrid();
  renderLines();
  renderStations();
  renderLineList();
  renderControls();
  persist();
}

async function exportPng() {
  const svg = buildStandaloneSvg();
  const bounds = mapBounds();
  const scale = 2;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bounds.width * scale);
    canvas.height = Math.round(bounds.height * scale);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("PNG export failed");
        return;
      }
      downloadBlob(`${fileBaseName()}.png`, blob);
      setStatus("PNG exported");
    }, "image/png");
  } catch {
    setStatus("PNG export failed");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function exportJson() {
  const payload = {
    app: "Metro Map Maker",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    map: {
      title: state.title,
      uiTheme: state.uiTheme,
      theme: state.theme,
      showGrid: state.showGrid,
      showLabels: state.showLabels,
      viewport: state.viewport,
      stations: state.stations,
      lines: state.lines
    }
  };
  download(`${fileBaseName()}.json`, JSON.stringify(payload, null, 2), "application/json");
  setStatus("JSON exported");
}

function fileBaseName() {
  return (state.title || "metro-map")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "metro-map";
}

function mapBounds() {
  if (state.stations.length === 0) {
    return { x: 0, y: 0, width: 1200, height: 760 };
  }
  const xs = state.stations.map((station) => station.x);
  const ys = state.stations.map((station) => station.y);
  const minX = Math.min(...xs) - 120;
  const minY = Math.min(...ys) - 120;
  const maxX = Math.max(...xs) + 220;
  const maxY = Math.max(...ys) + 160;
  return { x: minX, y: minY, width: Math.max(600, maxX - minX), height: Math.max(420, maxY - minY) };
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  })[char]);
}

function buildStandaloneSvg() {
  const bounds = mapBounds();
  const ink = state.theme === "midnight" ? "#eef5f8" : "#17212c";
  const labelStroke = state.theme === "midnight" ? "rgba(24,34,45,.9)" : "rgba(255,255,255,.92)";
  const canvas = state.theme === "midnight" ? "#18222d" : state.theme === "signal" ? "#edf4ef" : "#fbfaf6";
  const gridStep = 80;
  const gridMinX = Math.floor(bounds.x / gridStep) * gridStep;
  const gridMaxX = Math.ceil((bounds.x + bounds.width) / gridStep) * gridStep;
  const gridMinY = Math.floor(bounds.y / gridStep) * gridStep;
  const gridMaxY = Math.ceil((bounds.y + bounds.height) / gridStep) * gridStep;
  const grid = state.showGrid
    ? Array.from({ length: Math.ceil((gridMaxX - gridMinX) / gridStep) + 1 }, (_, index) => {
      const x = gridMinX + index * gridStep;
      return `<line class="grid-line" x1="${x}" y1="${bounds.y}" x2="${x}" y2="${bounds.y + bounds.height}"/>`;
    }).join("") + Array.from({ length: Math.ceil((gridMaxY - gridMinY) / gridStep) + 1 }, (_, index) => {
      const y = gridMinY + index * gridStep;
      return `<line class="grid-line" x1="${bounds.x}" y1="${y}" x2="${bounds.x + bounds.width}" y2="${y}"/>`;
    }).join("")
    : "";
  const lines = state.lines.map((line) => {
    const path = linePath(line);
    return path ? `<path class="line-path" d="${path}" stroke="${line.color}"/>` : "";
  }).join("");
  const gradients = state.stations.map((station) => {
    const colors = stationColors(station.id);
    if (colors.length < 2) {
      return "";
    }
    const stops = colors.map((color, index) => {
      const offset = colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100;
      return `<stop offset="${offset}%" stop-color="${color}"/>`;
    }).join("");
    return `<linearGradient id="export-interchange-${station.id}" x1="0%" y1="0%" x2="100%" y2="0%">${stops}</linearGradient>`;
  }).join("");
  const stations = state.stations.map((station) => {
    const colors = stationColors(station.id);
    const marker = colors.length > 1
      ? `<rect class="interchange-capsule" x="${station.x - 24}" y="${station.y - 14}" width="48" height="28" rx="14" ry="14" stroke="url(#export-interchange-${station.id})"/>`
      : `<circle class="station-dot" cx="${station.x}" cy="${station.y}" r="15" stroke="${colors[0]}"/>`;
    const label = state.showLabels
      ? `<text class="station-label" x="${station.x + 24}" y="${station.y - 20}">${escapeXml(station.name)}</text>`
      : "";
    return `<g>${marker}${label}</g>`;
  }).join("");
  return `<svg xmlns="${SVG_NS}" width="${Math.round(bounds.width)}" height="${Math.round(bounds.height)}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${escapeXml(state.title)}"><style>
    .line-path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:18}
    .station-dot{fill:#fff;stroke-width:5}
    .interchange-capsule{fill:#fff;stroke-width:6}
    .station-label{fill:${ink};font-family:Inter,Arial,sans-serif;font-size:20px;font-weight:760;paint-order:stroke;stroke:${labelStroke};stroke-width:7px;stroke-linejoin:round}
    .grid-line{stroke:rgba(100,112,125,.18);stroke-width:1}
  </style><defs>${gradients}</defs><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${canvas}"/>${grid}${lines}${stations}</svg>`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyShareLink() {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({
    version: APP_VERSION,
    title: state.title,
    uiTheme: state.uiTheme,
    theme: state.theme,
    showGrid: state.showGrid,
    showLabels: state.showLabels,
    viewport: state.viewport,
    stations: state.stations,
    lines: state.lines
  }))));
  const url = `${location.origin}${location.pathname}#map=${payload}`;
  await navigator.clipboard.writeText(url);
  setStatus("Share link copied");
}

function loadFromHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const encoded = hash.get("map");
  if (!encoded) {
    return false;
  }

  try {
    const map = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    state.title = map.title || state.title;
    state.uiTheme = map.uiTheme || state.uiTheme;
    state.theme = map.theme || state.theme;
    state.showGrid = typeof map.showGrid === "boolean" ? map.showGrid : state.showGrid;
    state.showLabels = typeof map.showLabels === "boolean" ? map.showLabels : state.showLabels;
    state.viewport = map.viewport || state.viewport;
    state.stations = Array.isArray(map.stations) ? map.stations : state.stations;
    state.lines = Array.isArray(map.lines) ? map.lines : state.lines;
    state.activeLineId = state.lines[0]?.id || null;
    return true;
  } catch {
    setStatus("Could not load link");
    return false;
  }
}

function persist() {
  if (isRestoring) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      title: state.title,
      activeLineId: state.activeLineId,
      uiTheme: state.uiTheme,
      showGrid: state.showGrid,
      showLabels: state.showLabels,
      theme: state.theme,
      viewport: state.viewport,
      sidebarWidth: state.sidebarWidth,
      stations: state.stations,
      lines: state.lines
    }));
  } catch {
    setStatus("Storage unavailable");
  }
}

function loadStoredMap() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!saved) {
    return false;
  }
  try {
    const map = JSON.parse(saved);
    state.title = map.title || state.title;
    state.activeLineId = map.activeLineId || state.activeLineId;
    state.uiTheme = map.uiTheme || state.uiTheme;
    state.showGrid = typeof map.showGrid === "boolean" ? map.showGrid : state.showGrid;
    state.showLabels = typeof map.showLabels === "boolean" ? map.showLabels : state.showLabels;
    state.theme = map.theme || state.theme;
    state.viewport = map.viewport || state.viewport;
    state.sidebarWidth = map.sidebarWidth || state.sidebarWidth;
    state.stations = Array.isArray(map.stations) ? map.stations : state.stations;
    state.lines = Array.isArray(map.lines) ? map.lines : state.lines;
    return true;
  } catch {
    return false;
  }
}

function loadDemo() {
  if (!window.confirm("Load the demo map? This replaces your current map.")) {
    setStatus("Demo canceled");
    return;
  }
  saveHistory();
  state.title = "Crosstown Service Plan";
  state.stations = [
    { id: "demo-1", name: "North Pier", x: 210, y: 180 },
    { id: "demo-2", name: "Old Town", x: 360, y: 260 },
    { id: "demo-3", name: "Civic", x: 520, y: 340 },
    { id: "demo-4", name: "Exchange", x: 690, y: 340 },
    { id: "demo-5", name: "Stadium", x: 860, y: 450 },
    { id: "demo-6", name: "University", x: 500, y: 520 },
    { id: "demo-7", name: "Airport", x: 300, y: 610 }
  ];
  state.lines = [
    { id: "demo-blue", name: "Harbor Line", color: "#146c94", stations: ["demo-1", "demo-2", "demo-3", "demo-4", "demo-5"] },
    { id: "demo-green", name: "Garden Line", color: "#21836f", stations: ["demo-7", "demo-6", "demo-3", "demo-2"] },
    { id: "demo-gold", name: "Civic Shuttle", color: "#d07b1f", stations: ["demo-6", "demo-4", "demo-5"] }
  ];
  state.activeLineId = "demo-blue";
  state.selectedStationId = "demo-3";
  state.selectedSegment = null;
  state.connectStartStationId = null;
  setStatus("Demo loaded");
  render();
}

function setTool(tool) {
  state.tool = tool;
  if (tool !== "connect") {
    state.connectStartStationId = null;
  }
  els.tools.forEach((toolButton) => toolButton.classList.toggle("is-active", toolButton.dataset.tool === tool));
  setStatus(`${tool === "station" ? "Add" : tool[0].toUpperCase() + tool.slice(1)} mode`);
  persist();
}

function handleConnectStation(stationId) {
  const activeLine = getActiveLine();
  if (!activeLine) {
    setStatus("Add or select a line first");
    return;
  }
  state.selectedStationId = stationId;
  state.selectedSegment = null;
  if (!state.connectStartStationId) {
    state.connectStartStationId = stationId;
    setStatus("Pick second station");
    render();
    return;
  }
  connectStations(state.connectStartStationId, stationId);
}

els.tools.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));

els.canvas.addEventListener("pointerdown", (event) => {
  const stationGroup = event.target.closest("[data-station-id]");
  if (stationGroup) {
    const id = stationGroup.dataset.stationId;
    if (state.tool === "connect") {
      handleConnectStation(id);
      return;
    }
    state.selectedStationId = id;
    state.selectedSegment = null;
    state.connectStartStationId = null;
    dragStationId = id;

    setStatus("Station selected");
    render();
    return;
  }

  const segment = event.target.closest("[data-segment-index]");
  if (segment && state.tool === "select") {
    state.activeLineId = segment.dataset.lineId;
    state.selectedStationId = null;
    state.selectedSegment = {
      lineId: segment.dataset.lineId,
      index: Number(segment.dataset.segmentIndex)
    };
    state.connectStartStationId = null;
    setStatus("Segment selected");
    render();
    return;
  }

  if (state.tool === "station") {
    addStation(pointFromEvent(event));
    return;
  }

  if (state.tool === "pan" || event.button === 1 || event.altKey || event.metaKey) {
    panStart = {
      x: event.clientX,
      y: event.clientY,
      viewport: { ...state.viewport }
    };
    els.canvas.setPointerCapture(event.pointerId);
  }
});

els.canvas.addEventListener("pointermove", (event) => {
  if (panStart) {
    const scaleX = state.viewport.width / els.canvas.clientWidth;
    const scaleY = state.viewport.height / els.canvas.clientHeight;
    state.viewport.x = panStart.viewport.x - (event.clientX - panStart.x) * scaleX;
    state.viewport.y = panStart.viewport.y - (event.clientY - panStart.y) * scaleY;
    render();
    return;
  }

  if (!dragStationId) {
    return;
  }
  const station = stationById(dragStationId);
  if (!station) {
    return;
  }
  const point = pointFromEvent(event);
  station.x = point.x;
  station.y = point.y;
  setStatus("Station moved");
  render();
});

window.addEventListener("pointerup", () => {
  dragStationId = null;
  panStart = null;
});

els.undo.addEventListener("click", () => {
  const snapshot = state.history.pop();
  if (snapshot) {
    restore(snapshot);
  } else {
    setStatus("Nothing to undo");
  }
});

els.clear.addEventListener("click", clearMap);
els.addLine.addEventListener("click", addLine);
els.addStation.addEventListener("click", () => {
  const offset = (state.stations.length % 8) * 40;
  addStation({
    x: snap(state.viewport.x + state.viewport.width / 2 + offset),
    y: snap(state.viewport.y + state.viewport.height / 2 + Math.floor(state.stations.length / 8) * 40)
  });
});
els.zoomIn.addEventListener("click", () => zoomAt(0.82));
els.zoomOut.addEventListener("click", () => zoomAt(1.22));
els.exportPng.addEventListener("click", exportPng);
els.exportJson.addEventListener("click", exportJson);
els.importJson.addEventListener("click", () => els.importJsonInput.click());
els.importJsonInput.addEventListener("change", importJson);
els.loadDemo.addEventListener("click", loadDemo);
els.copyShare.addEventListener("click", copyShareLink);
els.appearanceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.uiTheme = button.dataset.appearance;
    render();
    setStatus(`${button.textContent} appearance`);
  });
});

els.lineList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-line-id]");
  if (!button) {
    return;
  }
  state.activeLineId = button.dataset.lineId;
  state.selectedSegment = null;
  state.connectStartStationId = null;
  setStatus("Line selected");
  render();
});

els.lineName.addEventListener("input", () => {
  const line = getActiveLine();
  if (line) {
    line.name = els.lineName.value || "Untitled Line";
    render();
  }
});

els.lineColor.addEventListener("input", () => {
  const line = getActiveLine();
  if (line) {
    line.color = els.lineColor.value;
    render();
  }
});

els.renameStation.addEventListener("click", () => {
  const station = getSelectedStation();
  if (!station) {
    setStatus("No station selected");
    return;
  }
  saveHistory();
  station.name = els.stationName.value || "Untitled Station";
  setStatus("Station renamed");
  render();
});

els.deleteStation.addEventListener("click", () => {
  const station = getSelectedStation();
  if (!station) {
    const segment = getSelectedSegment();
    if (!segment) {
      setStatus("Nothing selected");
      return;
    }
    saveHistory();
    segment.line.stations.splice(segment.index + 1, 1);
    state.selectedSegment = null;
    state.connectStartStationId = null;
    setStatus("Segment removed");
    render();
    return;
  }
  saveHistory();
  state.stations = state.stations.filter((item) => item.id !== station.id);
  state.lines.forEach((line) => {
    line.stations = line.stations.filter((id) => id !== station.id);
  });
  state.selectedStationId = null;
  state.connectStartStationId = null;
  setStatus("Station deleted");
  render();
});

els.grid.addEventListener("change", () => {
  state.showGrid = els.grid.checked;
  render();
});

els.labels.addEventListener("change", () => {
  state.showLabels = els.labels.checked;
  render();
});

els.mapTitle.addEventListener("input", () => {
  state.title = els.mapTitle.value || "Untitled Metro Map";
  render();
});

els.theme.addEventListener("change", () => {
  state.theme = els.theme.value;
  render();
});

els.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const before = rawPointFromEvent(event);
  const factor = event.deltaY > 0 ? 1.12 : 0.88;
  zoomAt(factor, before);
}, { passive: false });

function zoomAt(factor, focusPoint = null) {
  const current = state.viewport;
  const focus = focusPoint || { x: current.x + current.width / 2, y: current.y + current.height / 2 };
  const width = Math.max(240, Math.min(6000, current.width * factor));
  const height = Math.max(160, Math.min(3800, current.height * factor));
  const xRatio = (focus.x - current.x) / current.width;
  const yRatio = (focus.y - current.y) / current.height;
  state.viewport = {
    x: focus.x - width * xRatio,
    y: focus.y - height * yRatio,
    width,
    height
  };
  render();
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  if (isTyping) {
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    els.undo.click();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    els.deleteStation.click();
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "s") setTool("select");
  if (key === "a") setTool("station");
  if (key === "c") setTool("connect");
  if (key === "p") setTool("pan");
  if (key === "n" || key === "l") addLine();
  if (key === "g") {
    state.showGrid = !state.showGrid;
    render();
  }
  if (key === "+" || key === "=") zoomAt(0.82);
  if (key === "-" || key === "_") zoomAt(1.22);
});

systemDarkQuery.addEventListener("change", () => {
  if (state.uiTheme === "system") {
    renderControls();
  }
});

function importJson() {
  const file = els.importJsonInput.files?.[0];
  if (!file) {
    return;
  }
  if (!window.confirm("Import this JSON map? This replaces your current map.")) {
    els.importJsonInput.value = "";
    setStatus("Import canceled");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      applyMapData(parsed.map || parsed);
      setStatus("JSON imported");
    } catch {
      setStatus("Import failed");
    } finally {
      els.importJsonInput.value = "";
    }
  };
  reader.readAsText(file);
}

function applyMapData(map) {
  if (!map || !Array.isArray(map.stations) || !Array.isArray(map.lines)) {
    throw new Error("Invalid map JSON");
  }
  saveHistory();
  state.title = map.title || "Imported Metro Map";
  state.uiTheme = map.uiTheme || state.uiTheme;
  state.theme = map.theme || "paper";
  state.showGrid = typeof map.showGrid === "boolean" ? map.showGrid : true;
  state.showLabels = typeof map.showLabels === "boolean" ? map.showLabels : true;
  state.viewport = map.viewport || { x: 0, y: 0, width: 1200, height: 760 };
  state.stations = map.stations;
  state.lines = map.lines;
  state.activeLineId = state.lines[0]?.id || null;
  state.selectedStationId = null;
  state.selectedSegment = null;
  state.connectStartStationId = null;
  render();
}

els.sidebarResizer.addEventListener("pointerdown", (event) => {
  sidebarResizeStart = {
    x: event.clientX,
    width: state.sidebarWidth || 340
  };
  els.sidebarResizer.classList.add("is-dragging");
  els.sidebarResizer.setPointerCapture(event.pointerId);
});

window.addEventListener("pointermove", (event) => {
  if (!sidebarResizeStart) {
    return;
  }
  state.sidebarWidth = Math.max(280, Math.min(520, sidebarResizeStart.width + event.clientX - sidebarResizeStart.x));
  renderControls();
  persist();
});

window.addEventListener("pointerup", () => {
  if (!sidebarResizeStart) {
    return;
  }
  sidebarResizeStart = null;
  els.sidebarResizer.classList.remove("is-dragging");
});

isRestoring = true;
const loadedFromHash = loadFromHash();
if (!loadedFromHash && loadStoredMap()) {
  setStatus("Saved map loaded");
}
isRestoring = false;

if (loadedFromHash) {
  setStatus("Shared map loaded");
}

render();
