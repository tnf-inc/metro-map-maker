const APP_VERSION = "0.5.5";
const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "metro-map-maker:data:v1";
const GRID_SIZE = 80;

const defaultState = {
    title: "Harbor Loop Draft",
    tool: "select",
    activeLineId: "line-blue",
    selectedStationId: null,
    selectedSegment: null,
    connectStartStationId: null,
    showGrid: true,
    showLabels: true,
    lineTurnRadius: 0.3,
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
    deleteStation: document.querySelector("#deleteStationButton"),
    interchangeRotationRow: document.querySelector("#interchangeRotationRow"),
    rotationButtons: document.querySelectorAll("[data-rotation]"),
    selectionHint: document.querySelector("#selectionHint"),
    grid: document.querySelector("#gridToggle"),
    labels: document.querySelector("#labelsToggle"),
    mapTitle: document.querySelector("#mapTitleInput"),
    mapTitleDisplay: document.querySelector("#mapTitleDisplay"),
    settingsButton: document.querySelector("#settingsButton"),
    settingsPanel: document.querySelector("#settingsPanel"),
    lineTurnRadiusInput: document.querySelector("#lineTurnRadiusInput"),
    lineTurnRadiusValue: document.querySelector("#lineTurnRadiusValue"),
    exportPng: document.querySelector("#exportPngButton"),
    exportJson: document.querySelector("#exportJsonButton"),
    importJson: document.querySelector("#importJsonButton"),
    importJsonInput: document.querySelector("#importJsonInput"),
    loadDemo: document.querySelector("#loadDemoButton"),
    appearanceButtons: document.querySelectorAll("[data-appearance]"),
    stationCount: document.querySelector("#stationCount"),
    lineCount: document.querySelector("#lineCount"),
    connectionCount: document.querySelector("#connectionCount"),
    lineButtonTemplate: document.querySelector("#lineButtonTemplate"),
    sidebarResizer: document.querySelector("#sidebarResizer")
};

let dragStationId = null;
let dragSegmentBend = null;
let selectedSegmentNode = null;
let selectedLssPartIndex = 0;
let panStart = null;
let sidebarResizeStart = null;
let isRestoring = false;
let lastGestureScale = 1;
let settingsPanelOpen = false;
const PAN_DRAG_THRESHOLD = 4;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 520;
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

function clampTurnRadiusUnits(value) {
    return Math.max(0, Math.min(120, value));
}

function normalizeTurnRadiusUnits(value) {
    if (!Number.isFinite(value)) {
        return defaultState.lineTurnRadius;
    }
    const units = value > 6 ? value / GRID_SIZE : value;
    return clampTurnRadiusUnits(units);
}

function formatUnits(value) {
    const rounded = Math.round(value * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text} units`;
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

function stationHitRadius(station) {
    const isInterchange = stationLines(station.id).length > 1;
    if (!isInterchange) {
        return 30;
    }
    const geometry = interchangeGeometry(station.id);
    return Math.max(30, Math.max(geometry.width, geometry.height) / 2 + 8);
}

function stationHitAtPoint(point) {
    let closest = null;
    let closestDist = Infinity;
    state.stations.forEach((station) => {
        const dx = point.x - station.x;
        const dy = point.y - station.y;
        const distance = Math.hypot(dx, dy);
        const radius = stationHitRadius(station);
        if (distance <= radius && distance < closestDist) {
            closest = station;
            closestDist = distance;
        }
    });
    return closest;
}

const LABEL_POSITIONS = [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right"
];

function stationLabelLayout(station) {
    const pos = LABEL_POSITIONS.includes(station.labelPos) ? station.labelPos : "top-right";
    const row = pos.split("-")[0];
    const col = pos.split("-")[1];
    const gap = 26;
    const x = station.x + (col === "left" ? -gap : col === "center" ? 0 : gap);
    const y = station.y + (row === "top" ? -gap : row === "middle" ? 0 : gap);
    return {
        x,
        y,
        textAnchor: col === "left" ? "end" : col === "center" ? "middle" : "start",
        baseline: row === "top" ? "alphabetic" : row === "middle" ? "middle" : "hanging",
        pos
    };
}

function interchangeGeometry(stationId) {
    const lineCount = Math.max(2, stationLines(stationId).length);
    const short = 28;
    const long = short * lineCount * 0.75;
    const station = stationById(stationId);
    const vertical = station?.rotation === "vertical";
    const width = vertical ? short : long;
    const height = vertical ? long : short;
    const radius = short / 2;
    return { height, width, radius, dotRadius: 5, vertical };
}

function interchangeDotPos(station, index, count) {
    const geometry = interchangeGeometry(station.id);
    if (count === 1) {
        return { x: station.x, y: station.y };
    }
    const inset = geometry.radius;
    if (geometry.vertical) {
        const step = (geometry.height - inset * 2) / (count - 1);
        return { x: station.x, y: station.y - geometry.height / 2 + inset + step * index };
    }
    const step = (geometry.width - inset * 2) / (count - 1);
    return { x: station.x - geometry.width / 2 + inset + step * index, y: station.y };
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

function segmentShapeKey(line, index) {
    const startId = line.stations[index];
    const endId = line.stations[index + 1];
    return startId && endId ? `${startId}:${endId}` : null;
}

function getSegmentShape(line, index) {
    const key = segmentShapeKey(line, index);
    if (!key || !line.segmentShapes || typeof line.segmentShapes !== "object") {
        return null;
    }
    return line.segmentShapes[key] || null;
}

function defaultBendMode(start, end) {
    return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? "horizontal" : "vertical";
}

function defaultBendPoint(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const signX = Math.sign(dx) || 1;
    const signY = Math.sign(dy) || 1;
    return absX > absY
        ? { x: end.x - signX * absY, y: start.y }
        : { x: start.x, y: end.y - signY * absX };
}

function clampBetween(value, a, b) {
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
}

function segmentBendInfo(start, end, shape = null) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const bendable = !(absX === 0 || absY === 0 || absX === absY);
    if (!bendable) {
        return { bendable: false, points: [start, end], mode: null };
    }

    const defaultMode = defaultBendMode(start, end);
    const fallbackBend = defaultBendPoint(start, end);
    const mode = shape?.mode === "horizontal" || shape?.mode === "vertical" ? shape.mode : defaultMode;
    if (mode === "horizontal") {
        const rawX = Number.isFinite(shape?.bendValue) ? shape.bendValue : fallbackBend.x;
        const x = clampBetween(rawX, start.x, end.x);
        return { bendable: true, mode, points: [start, { x, y: start.y }, end] };
    }
    const rawY = Number.isFinite(shape?.bendValue) ? shape.bendValue : fallbackBend.y;
    const y = clampBetween(rawY, start.y, end.y);
    return { bendable: true, mode, points: [start, { x: start.x, y }, end] };
}

function nearestCanonicalBendValue(start, end, mode, referenceValue) {
    const absDx = Math.abs(end.x - start.x);
    const absDy = Math.abs(end.y - start.y);
    if (mode === "horizontal") {
        const candidates = [
            end.x - absDy,
            end.x + absDy
        ].filter((value) => value >= Math.min(start.x, end.x) && value <= Math.max(start.x, end.x));
        if (candidates.length > 0) {
            return candidates.reduce((best, value) => (
                Math.abs(value - referenceValue) < Math.abs(best - referenceValue) ? value : best
            ));
        }
        return null;
    }
    const candidates = [
        end.y - absDx,
        end.y + absDx
    ].filter((value) => value >= Math.min(start.y, end.y) && value <= Math.max(start.y, end.y));
    if (candidates.length > 0) {
        return candidates.reduce((best, value) => (
            Math.abs(value - referenceValue) < Math.abs(best - referenceValue) ? value : best
        ));
    }
    return null;
}

function bendModeFromPoints(points) {
    if (!Array.isArray(points) || points.length !== 3) {
        return null;
    }
    const first = points[0];
    const bend = points[1];
    const horizontalFirst = Math.abs(bend.y - first.y) < 0.001;
    return horizontalFirst ? "horizontal" : "vertical";
}

function addNodeOnSegment(lineId, segmentIndex, point) {
    const line = state.lines.find((item) => item.id === lineId);
    if (!line) {
        return false;
    }
    const start = stationById(line.stations[segmentIndex]);
    const end = stationById(line.stations[segmentIndex + 1]);
    if (!start || !end) {
        return false;
    }
    const waypoints = routePointsForSegment(line, segmentIndex, start, end);
    let best = null;
    waypoints.slice(1).forEach((item, index) => {
        const measured = segmentDistance(point, waypoints[index], item);
        if (!best || measured.distance < best.distance) {
            best = measured;
        }
    });
    if (!best) {
        return false;
    }

    const snapped = { x: snap(best.point.x), y: snap(best.point.y) };
    if ((snapped.x === start.x && snapped.y === start.y) || (snapped.x === end.x && snapped.y === end.y)) {
        return false;
    }

    saveHistory();
    const node = {
        id: `st-${Date.now().toString(36)}`,
        name: `Node ${state.stations.length + 1}`,
        x: snapped.x,
        y: snapped.y
    };
    state.stations.push(node);
    line.stations.splice(segmentIndex + 1, 0, node.id);
    state.selectedStationId = node.id;
    state.selectedSegment = {
        lineId,
        index: segmentIndex
    };
    selectedLssPartIndex = 0;
    selectedSegmentNode = null;
    setStatus("Node added on segment");
    render();
    return true;
}

function selectedLssPartForPoint(line, segmentIndex, start, end, point) {
    const waypoints = routePointsForSegment(line, segmentIndex, start, end);
    if (waypoints.length < 3) {
        return 0;
    }
    let best = 0;
    let bestDistance = Infinity;
    waypoints.slice(1).forEach((next, partIndex) => {
        const measured = segmentDistance(point, waypoints[partIndex], next);
        if (measured.distance < bestDistance) {
            bestDistance = measured.distance;
            best = partIndex;
        }
    });
    return best;
}

function lssAngle(points, partIndex) {
    const from = points[partIndex];
    const to = points[partIndex + 1];
    if (!from || !to) {
        return 0;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const raw = Math.atan2(dy, dx) * (180 / Math.PI);
    let normalized = raw % 180;
    if (normalized < 0) {
        normalized += 180;
    }
    return normalized;
}

function nearestSupportedAngle(angle) {
    const supported = [0, 45, 90, 135];
    return supported.reduce((best, candidate) => {
        const bestDelta = Math.min(Math.abs(best - angle), 180 - Math.abs(best - angle));
        const candidateDelta = Math.min(Math.abs(candidate - angle), 180 - Math.abs(candidate - angle));
        return candidateDelta < bestDelta ? candidate : best;
    }, supported[0]);
}

function routePointsForSegment(line, index, start, end) {
    return segmentBendInfo(start, end, getSegmentShape(line, index)).points;
}

function setSegmentShape(line, index, shape) {
    const key = segmentShapeKey(line, index);
    if (!key) {
        return;
    }
    if (!line.segmentShapes || typeof line.segmentShapes !== "object") {
        line.segmentShapes = {};
    }
    line.segmentShapes[key] = shape;
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

function roundedPolylinePath(points, requestedRadius = 0) {
    if (!Array.isArray(points) || points.length === 0) {
        return "";
    }
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }
    const radius = Math.max(0, requestedRadius || 0);
    if (radius === 0) {
        return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const vx1 = current.x - previous.x;
        const vy1 = current.y - previous.y;
        const vx2 = next.x - current.x;
        const vy2 = next.y - current.y;
        const len1 = Math.hypot(vx1, vy1);
        const len2 = Math.hypot(vx2, vy2);
        const cross = vx1 * vy2 - vy1 * vx2;
        if (len1 < 0.001 || len2 < 0.001 || Math.abs(cross) < 0.001) {
            path += ` L ${current.x} ${current.y}`;
            continue;
        }
        const cornerRadius = Math.min(radius, len1 / 2, len2 / 2);
        const inX = current.x - (vx1 / len1) * cornerRadius;
        const inY = current.y - (vy1 / len1) * cornerRadius;
        const outX = current.x + (vx2 / len2) * cornerRadius;
        const outY = current.y + (vy2 / len2) * cornerRadius;
        path += ` L ${inX} ${inY} Q ${current.x} ${current.y} ${outX} ${outY}`;
    }
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;
    return path;
}

// ---------------------------------------------------------------------------
// Parallel-line offset helpers
// ---------------------------------------------------------------------------

// Canonical key for a straight sub-segment regardless of travel direction.
function subSegKey(a, b) {
    const ax = Math.round(a.x), ay = Math.round(a.y);
    const bx = Math.round(b.x), by = Math.round(b.y);
    return ax < bx || (ax === bx && ay < by)
        ? `${ax},${ay}|${bx},${by}`
        : `${bx},${by}|${ax},${ay}`;
}

// Build a map: `${lineId}::${subSegKey}` → perpendicular offset in px.
// Lines that share a sub-segment are spread out symmetrically (±10px slots).
function buildParallelOffsets() {
    const STEP = 10; // px between parallel lines
    // Collect all (lineId, subSeg) pairs
    const buckets = new Map(); // subSegKey → [lineId, ...]  (in line order, deduped)
    state.lines.forEach((line) => {
        const pts = line.stations.map(stationById).filter(Boolean);
        const seen = new Set();
        pts.slice(1).forEach((_, si) => {
            const waypoints = routePointsForSegment(line, si, pts[si], pts[si + 1]);
            waypoints.slice(1).forEach((wp, wi) => {
                const key = subSegKey(waypoints[wi], wp);
                if (seen.has(key)) return;
                seen.add(key);
                if (!buckets.has(key)) buckets.set(key, []);
                const bucket = buckets.get(key);
                if (!bucket.includes(line.id)) bucket.push(line.id);
            });
        });
    });

    const offsets = new Map(); // `${lineId}::${subSegKey}` → px
    buckets.forEach((lineIds, key) => {
        const n = lineIds.length;
        if (n < 2) return; // no conflict
        // Spread: slot 0 → -(n-1)/2 * STEP, slot n-1 → +(n-1)/2 * STEP
        lineIds.forEach((lineId, slot) => {
            const px = (slot - (n - 1) / 2) * STEP;
            offsets.set(`${lineId}::${key}`, px);
        });
    });
    return offsets;
}

// Shift a sequence of points perpendicularly by `px`.
// Works on each sub-segment independently (they're already axis-aligned or 45°).
function offsetPoints(points, px) {
    if (px === 0) return points;
    return points.map((pt, i) => {
        // Average the perpendicular of the adjacent segment(s)
        const dirs = [];
        if (i > 0) dirs.push({ dx: pt.x - points[i - 1].x, dy: pt.y - points[i - 1].y });
        if (i < points.length - 1) dirs.push({ dx: points[i + 1].x - pt.x, dy: points[i + 1].y - pt.y });
        let nx = 0, ny = 0;
        dirs.forEach(({ dx, dy }) => {
            const len = Math.hypot(dx, dy) || 1;
            nx += -dy / len;
            ny += dx / len;
        });
        const nlen = Math.hypot(nx, ny) || 1;
        return { x: pt.x + (nx / nlen) * px, y: pt.y + (ny / nlen) * px };
    });
}

// Build offset path string for a single line segment (start→end) with a given px offset.
function offsetSegmentPath(start, end, px) {
    const pts = offsetPoints(routePoints(start, end), px);
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function segmentPathOffset(line, index, start, end, offsets) {
    const waypoints = routePointsForSegment(line, index, start, end);
    const keys = waypoints.slice(1).map((point, index) => subSegKey(waypoints[index], point));
    const offsetValues = keys.map((key) => offsets.get(`${line.id}::${key}`) ?? 0);
    const firstOffset = offsetValues[0] ?? 0;
    const allOffsetsMatch = offsetValues.every((value) => value === firstOffset);
    if (allOffsetsMatch) {
        const shiftedPoints = offsetPoints(waypoints, firstOffset);
        return roundedPolylinePath(shiftedPoints, state.lineTurnRadius * GRID_SIZE);
    }
    return waypoints.slice(1).map((point, index) => {
        const shifted = offsetPoints([waypoints[index], point], offsetValues[index]);
        return shifted.map((item, itemIndex) => `${itemIndex === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
    }).join(" ");
}

// Build complete offset path for a line given the global offsets map.
function linePathOffset(line, offsets) {
    const pts = line.stations.map(stationById).filter(Boolean);
    if (pts.length === 0) return "";
    return pts.slice(1).map((_, index) => segmentPathOffset(line, index, pts[index], pts[index + 1], offsets)).join(" ");
}

// ---------------------------------------------------------------------------

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
    const offsets = buildParallelOffsets();
    state.lines.forEach((line) => {
        const path = linePathOffset(line, offsets);
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
            const segOffsetParts = segmentPathOffset(line, index, start, end, offsets);
            const selected = state.selectedSegment?.lineId === line.id && state.selectedSegment.index === index;
            group.appendChild(makeSvg("path", {
                class: "segment-hit",
                d: segOffsetParts,
                "data-line-id": line.id,
                "data-segment-index": index
            }));
            if (selected) {
                group.appendChild(makeSvg("path", {
                    class: "selected-segment-line",
                    d: segOffsetParts
                }));
            }
        });
    });
    els.canvas.appendChild(group);
}

function renderSelectedSegmentOverlay() {
    const selected = getSelectedSegment();
    if (!selected) {
        return;
    }
    const offsets = buildParallelOffsets();
    const group = makeSvg("g", { "aria-label": "Selected segment overlay" });
    renderSelectedSegmentHandles(group, selected.line, selected.index, selected.start, selected.end, offsets);
    els.canvas.appendChild(group);
}

function renderSelectedSegmentHandles(group, line, index, start, end, offsets) {
    const waypoints = routePointsForSegment(line, index, start, end);
    const keys = waypoints.slice(1).map((point, pointIndex) => subSegKey(waypoints[pointIndex], point));
    const offsetValues = keys.map((key) => offsets.get(`${line.id}::${key}`) ?? 0);
    const firstOffset = offsetValues[0] ?? 0;
    const pointsForHandles = offsetValues.every((value) => value === firstOffset)
        ? offsetPoints(waypoints, firstOffset)
        : waypoints;
    const guideStart = pointsForHandles[selectedLssPartIndex];
    const guideEnd = pointsForHandles[selectedLssPartIndex + 1];
    const lssGuidePath = guideStart && guideEnd
        ? `M ${guideStart.x} ${guideStart.y} L ${guideEnd.x} ${guideEnd.y}`
        : pointsForHandles.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    group.appendChild(makeSvg("path", {
        class: "selected-lss-guide",
        d: lssGuidePath
    }));

    pointsForHandles.forEach((point, pointIndex) => {
        const isBend = pointIndex === 1 && pointsForHandles.length > 2;
        const isSelectedNode = selectedSegmentNode
            && selectedSegmentNode.lineId === line.id
            && selectedSegmentNode.segmentIndex === index
            && selectedSegmentNode.pointIndex === pointIndex;
        group.appendChild(makeSvg("circle", {
            class: isBend
                ? `segment-node segment-node-bend${isSelectedNode ? " is-selected" : ""}`
                : `segment-node${isSelectedNode ? " is-selected" : ""}`,
            cx: point.x,
            cy: point.y,
            r: isBend ? 8 : 6,
            "data-node-line-id": line.id,
            "data-node-segment-index": index,
            "data-node-point-index": pointIndex
        }));
    });

    if (pointsForHandles.length !== 3) {
        return;
    }
    const activeAngle = nearestSupportedAngle(lssAngle(pointsForHandles, selectedLssPartIndex));
    const bendPoint = pointsForHandles[1];
    const offset = 18;
    const length = 13;
    const buttons = [0, 45, 90, 135].map((angle, idx) => {
        const slot = [
            { x: bendPoint.x + offset, y: bendPoint.y - offset },
            { x: bendPoint.x + offset, y: bendPoint.y + offset },
            { x: bendPoint.x - offset, y: bendPoint.y + offset },
            { x: bendPoint.x - offset, y: bendPoint.y - offset }
        ][idx];
        const rad = angle * (Math.PI / 180);
        const dx = Math.cos(rad) * (length / 2);
        const dy = Math.sin(rad) * (length / 2);
        return {
            angle,
            cx: slot.x,
            cy: slot.y,
            x1: slot.x - dx,
            y1: slot.y - dy,
            x2: slot.x + dx,
            y2: slot.y + dy
        };
    });
    buttons.forEach((button) => {
        const isActive = activeAngle === button.angle;
        group.appendChild(makeSvg("circle", {
            class: isActive ? "segment-direction-dot is-active" : "segment-direction-dot",
            cx: button.cx,
            cy: button.cy,
            r: 9,
            "data-direction-line-id": line.id,
            "data-direction-segment-index": index,
            "data-direction-angle": String(button.angle)
        }));
        group.appendChild(makeSvg("line", {
            class: isActive ? "segment-direction-slash is-active" : "segment-direction-slash",
            x1: button.x1,
            y1: button.y1,
            x2: button.x2,
            y2: button.y2,
            "data-direction-line-id": line.id,
            "data-direction-segment-index": index,
            "data-direction-angle": String(button.angle)
        }));
    });
}

function renderStations() {
    const group = makeSvg("g", { "aria-label": "Stations" });
    state.stations.forEach((station) => {
        const stationGroup = makeSvg("g", { "data-station-id": station.id });
        const colors = stationColors(station.id);
        const isInterchange = colors.length > 1;
        const geometry = isInterchange ? interchangeGeometry(station.id) : null;
        if (station.id === state.selectedStationId) {
            stationGroup.appendChild(makeSvg(isInterchange ? "rect" : "circle", isInterchange
                ? {
                    class: "selection-ring interchange-ring",
                    x: station.x - geometry.width / 2 - 4,
                    y: station.y - geometry.height / 2 - 4,
                    width: geometry.width + 8,
                    height: geometry.height + 8,
                    rx: geometry.radius + 4,
                    ry: geometry.radius + 4
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
                x: station.x - geometry.width / 2,
                y: station.y - geometry.height / 2,
                width: geometry.width,
                height: geometry.height,
                rx: geometry.radius,
                ry: geometry.radius
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
            r: isInterchange ? Math.max(30, Math.max(geometry.width, geometry.height) / 2 + 8) : 30
        });

        stationGroup.appendChild(dot);
        stationGroup.appendChild(hit);
        if (isInterchange) {
            colors.forEach((color, index) => {
                const pos = interchangeDotPos(station, index, colors.length);
                stationGroup.appendChild(makeSvg("circle", {
                    class: "interchange-color-dot",
                    cx: pos.x,
                    cy: pos.y,
                    r: geometry.dotRadius,
                    fill: color
                }));
            });
        }
        if (state.showLabels) {
            const layout = stationLabelLayout(station);
            stationGroup.appendChild(makeSvg("text", {
                class: "station-label",
                x: layout.x,
                y: layout.y,
                "text-anchor": layout.textAnchor,
                "dominant-baseline": layout.baseline
            }));
            stationGroup.lastChild.textContent = station.name;
        }
        if (station.id === state.selectedStationId) {
            const pickerGap = 40;
            LABEL_POSITIONS.forEach((pos) => {
                const [row, col] = pos.split("-");
                const px = station.x + (col === "left" ? -pickerGap : col === "center" ? 0 : pickerGap);
                const py = station.y + (row === "top" ? -pickerGap : row === "middle" ? 0 : pickerGap);
                const active = stationLabelLayout(station).pos === pos;
                stationGroup.appendChild(makeSvg("circle", {
                    class: "label-pos-handle-hit",
                    cx: px,
                    cy: py,
                    r: 15,
                    "data-label-pos-station-id": station.id,
                    "data-label-pos": pos
                }));
                stationGroup.appendChild(makeSvg("circle", {
                    class: active ? "label-pos-handle is-active" : "label-pos-handle",
                    cx: px,
                    cy: py,
                    r: col === "center" && row === "middle" ? 10 : 8,
                    "data-label-pos-station-id": station.id,
                    "data-label-pos": pos
                }));
            });
        }
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
    const turnRadius = Number.isFinite(state.lineTurnRadius) ? state.lineTurnRadius : defaultState.lineTurnRadius;
    els.lineTurnRadiusInput.value = String(turnRadius);
    els.lineTurnRadiusValue.value = formatUnits(turnRadius);
    els.settingsPanel.hidden = !settingsPanelOpen;
    els.settingsButton.classList.toggle("is-active", settingsPanelOpen);
    els.settingsButton.setAttribute("aria-expanded", settingsPanelOpen ? "true" : "false");
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

    const isInterchangeSelected = selectedStation && stationLines(selectedStation.id).length > 1;
    els.interchangeRotationRow.style.display = isInterchangeSelected ? '' : 'none';
    if (isInterchangeSelected) {
        const rotation = selectedStation.rotation || "horizontal";
        els.rotationButtons.forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.rotation === rotation);
        });
    }

    document.body.classList.toggle("theme-midnight", state.theme === "midnight");
    document.body.classList.toggle("theme-signal", state.theme === "signal");
    document.body.classList.toggle("connect-pending", Boolean(state.connectStartStationId));
    const sidebarWidth = state.sidebarWidth || 340;
    const atSidebarMin = sidebarWidth <= SIDEBAR_MIN_WIDTH;
    const atSidebarMax = sidebarWidth >= SIDEBAR_MAX_WIDTH;
    els.sidebarResizer.classList.toggle("at-min", atSidebarMin);
    els.sidebarResizer.classList.toggle("at-max", atSidebarMax);
    els.sidebarResizer.setAttribute(
        "aria-label",
        atSidebarMin ? "Resize toolbar right" : atSidebarMax ? "Resize toolbar left" : "Resize toolbar"
    );
    applyUiTheme();
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
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
    renderSelectedSegmentOverlay();
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
            lineTurnRadius: state.lineTurnRadius,
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
    const exportDark = effectiveUiTheme() === "dark" || state.theme === "midnight";
    const ink = exportDark ? "#eef5f8" : "#17212c";
    const labelStroke = exportDark ? "rgba(7,12,18,.88)" : "rgba(255,255,255,.92)";
    const canvas = exportDark ? state.theme === "midnight" ? "#18222d" : "#101a22" : state.theme === "signal" ? "#edf4ef" : "#fbfaf6";
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
    const exportOffsets = buildParallelOffsets();
    const lines = state.lines.map((line) => {
        const path = linePathOffset(line, exportOffsets);
        return path ? `<path class="line-path" d="${path}" stroke="${line.color}"/>` : "";
    }).join("");
    const stations = state.stations.map((station) => {
        const colors = stationColors(station.id);
        const layout = stationLabelLayout(station);
        const marker = colors.length > 1
            ? (() => {
                const geometry = interchangeGeometry(station.id);
                const dots = colors.map((color, index) => {
                    const pos = interchangeDotPos(station, index, colors.length);
                    return `<circle class="interchange-color-dot" cx="${pos.x}" cy="${pos.y}" r="${geometry.dotRadius}" fill="${color}"/>`;
                }).join("");
                return `<rect class="interchange-capsule" x="${station.x - geometry.width / 2}" y="${station.y - geometry.height / 2}" width="${geometry.width}" height="${geometry.height}" rx="${geometry.radius}" ry="${geometry.radius}"/>${dots}`;
            })()
            : `<circle class="station-dot" cx="${station.x}" cy="${station.y}" r="15" stroke="${colors[0]}"/>`;
        const label = state.showLabels
            ? `<text class="station-label" x="${layout.x}" y="${layout.y}" text-anchor="${layout.textAnchor}" dominant-baseline="${layout.baseline}">${escapeXml(station.name)}</text>`
            : "";
        return `<g>${marker}${label}</g>`;
    }).join("");
    return `<svg xmlns="${SVG_NS}" width="${Math.round(bounds.width)}" height="${Math.round(bounds.height)}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${escapeXml(state.title)}"><style>
    .line-path{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:18}
    .station-dot{fill:#fff;stroke-width:5}
    .interchange-capsule{fill:#fff;stroke:#0b0f14;stroke-width:5}
    .interchange-color-dot{stroke:#fff;stroke-width:2}
    .station-label{fill:${ink};font-family:Inter,Arial,sans-serif;font-size:20px;font-weight:760;paint-order:stroke;stroke:${labelStroke};stroke-width:7px;stroke-linejoin:round}
    .grid-line{stroke:rgba(100,112,125,.18);stroke-width:1}
  </style><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${canvas}"/>${grid}${lines}${stations}</svg>`;
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
        lineTurnRadius: state.lineTurnRadius,
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
        state.lineTurnRadius = normalizeTurnRadiusUnits(map.lineTurnRadius);
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
            lineTurnRadius: state.lineTurnRadius,
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
        state.lineTurnRadius = normalizeTurnRadiusUnits(map.lineTurnRadius);
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

function startCanvasPan(event) {
    if (event.button !== 0 && event.button !== 1) {
        return;
    }
    event.preventDefault();
    panStart = {
        pointerId: event.pointerId,
        button: event.button,
        x: event.clientX,
        y: event.clientY,
        addPoint: pointFromEvent(event),
        viewport: { ...state.viewport },
        hasMoved: false
    };
    els.canvas.setPointerCapture(event.pointerId);
}

function updateCanvasPan(event) {
    const scaleX = state.viewport.width / els.canvas.clientWidth;
    const scaleY = state.viewport.height / els.canvas.clientHeight;
    const deltaX = event.clientX - panStart.x;
    const deltaY = event.clientY - panStart.y;

    if (!panStart.hasMoved && Math.hypot(deltaX, deltaY) < PAN_DRAG_THRESHOLD) {
        return;
    }

    panStart.hasMoved = true;
    state.viewport.x = panStart.viewport.x - deltaX * scaleX;
    state.viewport.y = panStart.viewport.y - deltaY * scaleY;
    els.canvas.classList.add("is-panning");
    render();
}

function finishCanvasPan(event = null, allowStationAdd = true) {
    if (!panStart) {
        return;
    }
    const shouldAddStation = allowStationAdd && state.tool === "station" && !panStart.hasMoved && panStart.button === 0;
    const addPoint = panStart.addPoint;
    const pointerId = panStart.pointerId;
    panStart = null;
    els.canvas.classList.remove("is-panning");
    if (event && els.canvas.hasPointerCapture(pointerId)) {
        els.canvas.releasePointerCapture(pointerId);
    }

    if (shouldAddStation) {
        addStation(addPoint);
    }
}

function panViewportBy(deltaX, deltaY) {
    const scaleX = state.viewport.width / els.canvas.clientWidth;
    const scaleY = state.viewport.height / els.canvas.clientHeight;
    state.viewport.x += deltaX * scaleX;
    state.viewport.y += deltaY * scaleY;
    render();
}

function wheelDelta(event) {
    const lineHeight = 16;
    const pageWidth = els.canvas.clientWidth;
    const pageHeight = els.canvas.clientHeight;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return { x: event.deltaX * lineHeight, y: event.deltaY * lineHeight };
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return { x: event.deltaX * pageWidth, y: event.deltaY * pageHeight };
    }
    return { x: event.deltaX, y: event.deltaY };
}

els.tools.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));

els.canvas.addEventListener("pointerdown", (event) => {
    const labelPosHandle = event.target.closest("[data-label-pos]");
    if (labelPosHandle) {
        const stationId = labelPosHandle.dataset.labelPosStationId;
        const pos = labelPosHandle.dataset.labelPos;
        const station = stationById(stationId);
        if (!station || !LABEL_POSITIONS.includes(pos)) {
            return;
        }
        saveHistory();
        station.labelPos = pos;
        state.selectedStationId = station.id;
        state.selectedSegment = null;
        selectedLssPartIndex = 0;
        selectedSegmentNode = null;
        setStatus("Label position updated");
        render();
        return;
    }

    const directionHandle = event.target.closest("[data-direction-angle]");
    if (directionHandle) {
        const lineId = directionHandle.dataset.directionLineId;
        const segmentIndex = Number(directionHandle.dataset.directionSegmentIndex);
        const angle = Number(directionHandle.dataset.directionAngle);
        const line = state.lines.find((item) => item.id === lineId);
        if (!line || ![0, 45, 90, 135].includes(angle)) {
            return;
        }
        const start = stationById(line.stations[segmentIndex]);
        const end = stationById(line.stations[segmentIndex + 1]);
        if (!start || !end) {
            return;
        }
        saveHistory();
        const current = segmentBendInfo(start, end, getSegmentShape(line, segmentIndex));
        const bendPoint = current.points[1] || defaultBendPoint(start, end);
        const targetMode = (angle === 0 || angle === 45) ? "horizontal" : "vertical";
        const reference = targetMode === "horizontal" ? bendPoint.x : bendPoint.y;
        const canonicalBend = nearestCanonicalBendValue(start, end, targetMode, reference);
        if (!Number.isFinite(canonicalBend)) {
            setStatus("Direction unavailable for this segment");
            render();
            return;
        }
        setSegmentShape(line, segmentIndex, {
            mode: targetMode,
            bendValue: canonicalBend
        });
        setStatus("Segment direction updated");
        render();
        return;
    }

    const nodeHandle = event.target.closest("[data-node-point-index]");
    if (nodeHandle) {
        const lineId = nodeHandle.dataset.nodeLineId;
        const segmentIndex = Number(nodeHandle.dataset.nodeSegmentIndex);
        const pointIndex = Number(nodeHandle.dataset.nodePointIndex);
        const line = state.lines.find((item) => item.id === lineId);
        if (!line) {
            return;
        }
        const start = stationById(line.stations[segmentIndex]);
        const end = stationById(line.stations[segmentIndex + 1]);
        if (!start || !end) {
            return;
        }
        selectedSegmentNode = { lineId, segmentIndex, pointIndex };
        const info = segmentBendInfo(start, end, getSegmentShape(line, segmentIndex));
        if (!info.bendable || pointIndex !== 1) {
            setStatus("Node selected");
            render();
            return;
        }
        saveHistory();
        dragSegmentBend = {
            lineId,
            segmentIndex,
            mode: info.mode,
            pointerId: event.pointerId
        };
        els.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        setStatus("Drag bend node");
        render();
        return;
    }

    const pointer = rawPointFromEvent(event);
    const hitStation = stationHitAtPoint(pointer);
    if (hitStation) {
        if (state.tool === "connect") {
            handleConnectStation(hitStation.id);
            return;
        }
        state.selectedStationId = hitStation.id;
        state.selectedSegment = null;
        selectedLssPartIndex = 0;
        selectedSegmentNode = null;
        state.connectStartStationId = null;
        dragStationId = hitStation.id;
        setStatus("Station selected");
        render();
        return;
    }

    const segment = event.target.closest("[data-segment-index]");
    if (segment) {
        if (state.tool === "select") {
            const lineId = segment.dataset.lineId;
            const segmentIndex = Number(segment.dataset.segmentIndex);
            const line = state.lines.find((item) => item.id === lineId);
            const start = line ? stationById(line.stations[segmentIndex]) : null;
            const end = line ? stationById(line.stations[segmentIndex + 1]) : null;
            state.activeLineId = lineId;
            state.selectedStationId = null;
            state.selectedSegment = { lineId, index: segmentIndex };
            selectedLssPartIndex = line && start && end
                ? selectedLssPartForPoint(line, segmentIndex, start, end, pointFromEvent(event))
                : 0;
            selectedSegmentNode = null;
            state.connectStartStationId = null;
            setStatus("Segment selected");
            render();
        }
        return;
    }

    const stationGroup = event.target.closest("[data-station-id]");
    if (stationGroup) {
        const id = stationGroup.dataset.stationId;
        if (state.tool === "connect") {
            handleConnectStation(id);
            return;
        }
        state.selectedStationId = id;
        state.selectedSegment = null;
        selectedLssPartIndex = 0;
        selectedSegmentNode = null;
        state.connectStartStationId = null;
        dragStationId = id;

        setStatus("Station selected");
        render();
        return;
    }

    if (state.tool === "station") {
        selectedLssPartIndex = 0;
        selectedSegmentNode = null;
        startCanvasPan(event);
        return;
    }

    selectedLssPartIndex = 0;
    selectedSegmentNode = null;
    startCanvasPan(event);
});

els.canvas.addEventListener("pointermove", (event) => {
    if (dragSegmentBend) {
        const line = state.lines.find((item) => item.id === dragSegmentBend.lineId);
        if (!line) {
            dragSegmentBend = null;
            return;
        }
        const start = stationById(line.stations[dragSegmentBend.segmentIndex]);
        const end = stationById(line.stations[dragSegmentBend.segmentIndex + 1]);
        if (!start || !end) {
            dragSegmentBend = null;
            return;
        }
        const pointer = pointFromEvent(event);
        const bendValue = dragSegmentBend.mode === "horizontal"
            ? clampBetween(pointer.x, start.x, end.x)
            : clampBetween(pointer.y, start.y, end.y);
        setSegmentShape(line, dragSegmentBend.segmentIndex, {
            mode: dragSegmentBend.mode,
            bendValue
        });
        render();
        return;
    }

    if (panStart) {
        updateCanvasPan(event);
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

window.addEventListener("pointerup", (event) => {
    if (dragSegmentBend) {
        if (els.canvas.hasPointerCapture(dragSegmentBend.pointerId)) {
            els.canvas.releasePointerCapture(dragSegmentBend.pointerId);
        }
        dragSegmentBend = null;
        setStatus("Bend node moved");
    }
    dragStationId = null;
    finishCanvasPan(event);
});

window.addEventListener("pointercancel", (event) => {
    if (dragSegmentBend) {
        if (els.canvas.hasPointerCapture(dragSegmentBend.pointerId)) {
            els.canvas.releasePointerCapture(dragSegmentBend.pointerId);
        }
        dragSegmentBend = null;
    }
    dragStationId = null;
    finishCanvasPan(event, false);
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
els.importJson.addEventListener("dragenter", handleImportDrag);
els.importJson.addEventListener("dragover", handleImportDrag);
els.importJson.addEventListener("dragleave", clearImportDrag);
els.importJson.addEventListener("drop", handleImportDrop);
els.importJsonInput.addEventListener("change", () => importJson(els.importJsonInput.files?.[0]));
els.loadDemo.addEventListener("click", loadDemo);
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
    selectedLssPartIndex = 0;
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

els.stationName.addEventListener("input", () => {
    const station = getSelectedStation();
    if (!station) {
        return;
    }
    station.name = els.stationName.value || "Untitled Station";
    render();
});

els.rotationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const station = getSelectedStation();
        if (!station) {
            return;
        }
        saveHistory();
        station.rotation = button.dataset.rotation;
        setStatus(`Interchange rotated ${button.dataset.rotation}`);
        render();
    });
});

els.deleteStation.addEventListener("click", () => {
    if (selectedSegmentNode) {
        const { lineId, segmentIndex, pointIndex } = selectedSegmentNode;
        const line = state.lines.find((item) => item.id === lineId);
        if (!line) {
            selectedSegmentNode = null;
            setStatus("Nothing selected");
            return;
        }
        if (pointIndex === 1) {
            const key = segmentShapeKey(line, segmentIndex);
            if (key && line.segmentShapes && line.segmentShapes[key]) {
                saveHistory();
                delete line.segmentShapes[key];
                selectedSegmentNode = null;
                setStatus("Bend node deleted");
                render();
                return;
            }
            setStatus("Nothing selected");
            return;
        }
        setStatus("End nodes cannot be deleted");
        return;
    }

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

els.settingsButton.addEventListener("click", () => {
    settingsPanelOpen = !settingsPanelOpen;
    renderControls();
});

els.lineTurnRadiusInput.addEventListener("input", () => {
    const value = clampTurnRadiusUnits(Number(els.lineTurnRadiusInput.value) || 0);
    state.lineTurnRadius = value;
    els.lineTurnRadiusValue.value = formatUnits(value);
    render();
});

window.addEventListener("pointerdown", (event) => {
    if (!settingsPanelOpen) {
        return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
        return;
    }
    if (els.settingsPanel.contains(target) || els.settingsButton.contains(target)) {
        return;
    }
    settingsPanelOpen = false;
    renderControls();
});

els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = wheelDelta(event);
    if (event.ctrlKey) {
        const before = rawPointFromEvent(event);
        const factor = Math.exp(delta.y * 0.002);
        zoomAt(factor, before);
        return;
    }
    panViewportBy(delta.x, delta.y);
}, { passive: false });

els.canvas.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    lastGestureScale = event.scale || 1;
}, { passive: false });

els.canvas.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    const nextScale = event.scale || 1;
    const factor = lastGestureScale / nextScale;
    lastGestureScale = nextScale;
    zoomAt(factor, rawPointFromEvent(event));
}, { passive: false });

els.canvas.addEventListener("gestureend", (event) => {
    event.preventDefault();
    lastGestureScale = 1;
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
    if (event.key === "Escape") {
        if (settingsPanelOpen) {
            settingsPanelOpen = false;
            renderControls();
            return;
        }
        state.selectedStationId = null;
        state.selectedSegment = null;
        selectedLssPartIndex = 0;
        selectedSegmentNode = null;
        state.connectStartStationId = null;
        render();
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

function handleImportDrag(event) {
    event.preventDefault();
    els.importJson.classList.add("is-dragging");
}

function clearImportDrag(event) {
    event.preventDefault();
    els.importJson.classList.remove("is-dragging");
}

function handleImportDrop(event) {
    event.preventDefault();
    els.importJson.classList.remove("is-dragging");
    importJson(event.dataTransfer?.files?.[0]);
}

function importJson(file) {
    if (!file) {
        return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
        els.importJsonInput.value = "";
        setStatus("Choose a JSON map file");
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
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Import failed");
        } finally {
            els.importJsonInput.value = "";
        }
    };
    reader.readAsText(file);
}

function validateMapData(map) {
    if (!map || typeof map !== "object") {
        throw new Error("Invalid JSON: expected a map object");
    }
    if (!Array.isArray(map.stations)) {
        throw new Error("Invalid JSON: stations must be an array");
    }
    if (!Array.isArray(map.lines)) {
        throw new Error("Invalid JSON: lines must be an array");
    }

    const stationIds = new Set();
    map.stations.forEach((station, index) => {
        if (!station || typeof station !== "object") {
            throw new Error(`Invalid station at index ${index}`);
        }
        if (typeof station.id !== "string" || station.id.trim() === "") {
            throw new Error(`Invalid station id at index ${index}`);
        }
        if (stationIds.has(station.id)) {
            throw new Error(`Duplicate station id: ${station.id}`);
        }
        if (typeof station.name !== "string") {
            throw new Error(`Invalid station name for ${station.id}`);
        }
        if (!Number.isFinite(station.x) || !Number.isFinite(station.y)) {
            throw new Error(`Invalid station coordinates for ${station.id}`);
        }
        stationIds.add(station.id);
    });

    map.lines.forEach((line, index) => {
        if (!line || typeof line !== "object") {
            throw new Error(`Invalid line at index ${index}`);
        }
        if (typeof line.id !== "string" || line.id.trim() === "") {
            throw new Error(`Invalid line id at index ${index}`);
        }
        if (typeof line.name !== "string") {
            throw new Error(`Invalid line name for ${line.id}`);
        }
        if (typeof line.color !== "string" || line.color.trim() === "") {
            throw new Error(`Invalid line color for ${line.id}`);
        }
        if (!Array.isArray(line.stations)) {
            throw new Error(`Invalid station list for line ${line.id}`);
        }
        line.stations.forEach((stationId) => {
            if (typeof stationId !== "string" || !stationIds.has(stationId)) {
                throw new Error(`Line ${line.id} references unknown station: ${stationId}`);
            }
        });
    });

    if (map.viewport) {
        const viewport = map.viewport;
        const validViewport = typeof viewport === "object"
            && Number.isFinite(viewport.x)
            && Number.isFinite(viewport.y)
            && Number.isFinite(viewport.width)
            && Number.isFinite(viewport.height)
            && viewport.width > 0
            && viewport.height > 0;
        if (!validViewport) {
            throw new Error("Invalid viewport in JSON map");
        }
    }

    if (typeof map.lineTurnRadius !== "undefined") {
        if (!Number.isFinite(map.lineTurnRadius) || map.lineTurnRadius < 0 || map.lineTurnRadius > 120) {
            throw new Error("Invalid line turn radius in JSON map");
        }
    }
}

function applyMapData(map) {
    validateMapData(map);
    saveHistory();
    state.title = map.title || "Imported Metro Map";
    state.uiTheme = map.uiTheme || state.uiTheme;
    state.theme = map.theme || "paper";
    state.showGrid = typeof map.showGrid === "boolean" ? map.showGrid : true;
    state.showLabels = typeof map.showLabels === "boolean" ? map.showLabels : true;
    state.lineTurnRadius = Number.isFinite(map.lineTurnRadius)
        ? normalizeTurnRadiusUnits(map.lineTurnRadius)
        : defaultState.lineTurnRadius;
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
    state.sidebarWidth = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, sidebarResizeStart.width + event.clientX - sidebarResizeStart.x)
    );
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
