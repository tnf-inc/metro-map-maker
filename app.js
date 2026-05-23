const APP_VERSION = "0.1.0";
const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  title: "Harbor Loop Draft",
  tool: "select",
  activeLineId: "line-blue",
  selectedStationId: null,
  showGrid: true,
  showLabels: true,
  theme: "paper",
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

const els = {
  canvas: document.querySelector("#mapCanvas"),
  status: document.querySelector("#statusText"),
  tools: document.querySelectorAll("[data-tool]"),
  undo: document.querySelector("#undoButton"),
  clear: document.querySelector("#clearButton"),
  addLine: document.querySelector("#addLineButton"),
  lineName: document.querySelector("#lineNameInput"),
  lineColor: document.querySelector("#lineColorInput"),
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
  exportSvg: document.querySelector("#exportSvgButton"),
  exportJson: document.querySelector("#exportJsonButton"),
  loadDemo: document.querySelector("#loadDemoButton"),
  copyShare: document.querySelector("#copyShareButton"),
  stationCount: document.querySelector("#stationCount"),
  lineCount: document.querySelector("#lineCount"),
  connectionCount: document.querySelector("#connectionCount"),
  lineButtonTemplate: document.querySelector("#lineButtonTemplate")
};

let dragStationId = null;

function saveHistory() {
  state.history.push(JSON.stringify({
    title: state.title,
    activeLineId: state.activeLineId,
    selectedStationId: state.selectedStationId,
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

function pointFromEvent(event) {
  const pt = els.canvas.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const transformed = pt.matrixTransform(els.canvas.getScreenCTM().inverse());
  return {
    x: Math.max(60, Math.min(1140, snap(transformed.x))),
    y: Math.max(90, Math.min(700, snap(transformed.y)))
  };
}

function stationById(id) {
  return state.stations.find((station) => station.id === id);
}

function linePath(line) {
  const points = line.stations.map(stationById).filter(Boolean);
  if (points.length === 0) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
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

  const activeLine = getActiveLine();
  if (activeLine && !activeLine.stations.includes(station.id)) {
    activeLine.stations.push(station.id);
  }

  setStatus("Station added");
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
  setStatus("Line added");
  render();
}

function clearMap() {
  saveHistory();
  state.stations = [];
  state.lines.forEach((line) => {
    line.stations = [];
  });
  state.selectedStationId = null;
  setStatus("Map cleared");
  render();
}

function renderGrid() {
  if (!state.showGrid) {
    return;
  }

  const grid = makeSvg("g", { "aria-hidden": "true" });
  for (let x = 80; x <= 1120; x += 80) {
    grid.appendChild(makeSvg("line", { class: "grid-line", x1: x, y1: 80, x2: x, y2: 710 }));
  }
  for (let y = 120; y <= 680; y += 80) {
    grid.appendChild(makeSvg("line", { class: "grid-line", x1: 70, y1: y, x2: 1130, y2: y }));
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
  });
  els.canvas.appendChild(group);
}

function renderStations() {
  const group = makeSvg("g", { "aria-label": "Stations" });
  state.stations.forEach((station) => {
    const stationGroup = makeSvg("g", { "data-station-id": station.id });
    const dot = makeSvg("circle", {
      class: `station-dot${station.id === state.selectedStationId ? " selected" : ""}`,
      cx: station.x,
      cy: station.y,
      r: 15
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

function renderTitle() {
  const title = makeSvg("text", { class: "map-title", x: 72, y: 58 });
  title.textContent = `${state.title} / v${APP_VERSION}`;
  els.canvas.appendChild(title);
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
    els.lineList.appendChild(fragment);
  });
}

function renderControls() {
  const activeLine = getActiveLine();
  const selectedStation = getSelectedStation();

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
  els.selectionHint.textContent = selectedStation
    ? `${selectedStation.name} is selected. Drag it, rename it, or add it to the active line.`
    : "Select a station or click the canvas to create one.";

  document.body.classList.toggle("theme-midnight", state.theme === "midnight");
  document.body.classList.toggle("theme-signal", state.theme === "signal");
}

function render() {
  els.canvas.textContent = "";
  renderGrid();
  renderTitle();
  renderLines();
  renderStations();
  renderLineList();
  renderControls();
}

function exportSvg() {
  const svg = els.canvas.cloneNode(true);
  svg.setAttribute("xmlns", SVG_NS);
  download(`metro-map-maker-v${APP_VERSION}.svg`, svg.outerHTML, "image/svg+xml");
  setStatus("SVG exported");
}

function exportJson() {
  const payload = {
    app: "Metro Map Maker",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    map: {
      title: state.title,
      theme: state.theme,
      stations: state.stations,
      lines: state.lines
    }
  };
  download(`metro-map-maker-v${APP_VERSION}.json`, JSON.stringify(payload, null, 2), "application/json");
  setStatus("JSON exported");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
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
    state.stations = Array.isArray(map.stations) ? map.stations : state.stations;
    state.lines = Array.isArray(map.lines) ? map.lines : state.lines;
    state.activeLineId = state.lines[0]?.id || null;
    return true;
  } catch {
    setStatus("Could not load link");
    return false;
  }
}

function loadDemo() {
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
  setStatus("Demo loaded");
  render();
}

els.tools.forEach((button) => {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    els.tools.forEach((toolButton) => toolButton.classList.toggle("is-active", toolButton === button));
    setStatus(`${button.textContent} mode`);
  });
});

els.canvas.addEventListener("pointerdown", (event) => {
  const stationGroup = event.target.closest("[data-station-id]");
  if (stationGroup) {
    const id = stationGroup.dataset.stationId;
    saveHistory();
    state.selectedStationId = id;
    dragStationId = id;

    const activeLine = getActiveLine();
    if (state.tool === "line" && activeLine && !activeLine.stations.includes(id)) {
      activeLine.stations.push(id);
      setStatus("Station added to line");
    } else {
      setStatus("Station selected");
    }

    render();
    return;
  }

  if (state.tool === "station" || state.tool === "line") {
    addStation(pointFromEvent(event));
  }
});

els.canvas.addEventListener("pointermove", (event) => {
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
els.addStation.addEventListener("click", () => addStation({ x: 600, y: 380 }));
els.exportSvg.addEventListener("click", exportSvg);
els.exportJson.addEventListener("click", exportJson);
els.loadDemo.addEventListener("click", loadDemo);
els.copyShare.addEventListener("click", copyShareLink);

els.lineList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-line-id]");
  if (!button) {
    return;
  }
  state.activeLineId = button.dataset.lineId;
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
    setStatus("No station selected");
    return;
  }
  saveHistory();
  state.stations = state.stations.filter((item) => item.id !== station.id);
  state.lines.forEach((line) => {
    line.stations = line.stations.filter((id) => id !== station.id);
  });
  state.selectedStationId = null;
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

if (loadFromHash()) {
  setStatus("Shared map loaded");
}

render();
