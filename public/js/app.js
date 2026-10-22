import { routeEdge, portPoint, nearestSide, SIDES } from './router.js';
import * as api from './api.js';
import { VERSION } from './version.js';
import { renderPng } from './export-png.js';
import {
  COLORS, NODE_TYPES, createEdge, createNode, defaultEdgeLabel, emptyWorkflow, labelFontSize, normalizeDoc, sampleWorkflow, uid,
} from './model.js';

const GRID = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const HISTORY_LIMIT = 100;
// Larger hit targets for fingers.
const COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
const PORT_HIT_R = COARSE_POINTER ? 20 : 11;
const PORT_DOT_R = COARSE_POINTER ? 7 : 5;
const HANDLE_SIZE = COARSE_POINTER ? 22 : 10;
// Matches the CSS breakpoint where the side panel becomes a bottom sheet.
const SHEET_LAYOUT = window.matchMedia('(max-width: 760px)');
const SAVE_DELAY_MS = 400;
const LAST_OPENED_KEY = 'workflows:last-opened';
const HELP_DISMISSED_KEY = 'workflows:help-dismissed';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const svg = $('#canvas');
const viewportEl = $('#viewport');
const edgesEl = $('#edges');
const nodesEl = $('#nodes');
const overlayEl = $('#overlay');
const inspectorEl = $('#inspector');
const workflowSelect = $('#workflow-select');
const saveStatusEl = $('#save-status');
const zoomEl = $('#zoom-indicator');
const importInput = $('#import-file');
const workflowMenu = $('#workflow-menu');
const menuButton = $('[data-action="toggle-menu"]');

const measureCtx = document.createElement('canvas').getContext('2d');
measureCtx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

const state = {
  doc: emptyWorkflow(),
  workflows: [],
  view: { x: 0, y: 0, k: 1 },
  selection: null, // { kind: 'node' | 'edge', id }
  helpOpen: !readFlag(HELP_DISMISSED_KEY),
  undo: [],
  redo: [],
};

let drag = null;
let editor = null;
let spaceHeld = false;
let renderQueued = false;
let saveTimer = null;

// ---------- helpers ----------

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const snap = (v) => Math.round(v / GRID) * GRID;
const findNode = (id) => state.doc.nodes.find((n) => n.id === id);
const findEdge = (id) => state.doc.edges.find((e) => e.id === id);
const isBlock = (node) => node.type !== 'text';

function toWorld(clientX, clientY) {
  const box = svg.getBoundingClientRect();
  const { x, y, k } = state.view;
  return { x: (clientX - box.left - x) / k, y: (clientY - box.top - y) / k };
}

function toScreen(point) {
  const { x, y, k } = state.view;
  return { x: point.x * k + x, y: point.y * k + y };
}

function selectedNode() {
  if (state.selection?.kind !== 'node') return null;
  return findNode(state.selection.id);
}

function selectedEdge() {
  if (state.selection?.kind !== 'edge') return null;
  return findEdge(state.selection.id);
}

function hitTestBlock(point, excludeId, tolerance = 12) {
  for (let i = state.doc.nodes.length - 1; i >= 0; i--) {
    const n = state.doc.nodes[i];
    if (!isBlock(n) || n.id === excludeId) continue;
    const inside = point.x >= n.x - tolerance && point.x <= n.x + n.w + tolerance
      && point.y >= n.y - tolerance && point.y <= n.y + n.h + tolerance;
    if (inside) return n;
  }
  return null;
}

// ---------- history & persistence ----------

function snapshot() {
  return JSON.stringify({ nodes: state.doc.nodes, edges: state.doc.edges });
}

function pushUndo(snap = snapshot()) {
  state.undo.push(snap);
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo = [];
}

function restore(snap) {
  const data = JSON.parse(snap);
  state.doc.nodes = data.nodes;
  state.doc.edges = data.edges;
  const sel = state.selection;
  if (sel && !(sel.kind === 'node' ? findNode(sel.id) : findEdge(sel.id))) state.selection = null;
  changed();
  renderInspector();
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(snapshot());
  restore(state.undo.pop());
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(snapshot());
  restore(state.redo.pop());
}

function setSaveStatus(text, kind = '') {
  saveStatusEl.textContent = text;
  saveStatusEl.title = text;
  saveStatusEl.dataset.kind = kind;
}

function savedLabel() {
  return api.storageMode() === 'local' ? 'Saved in this browser' : 'Saved';
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  setSaveStatus('Saving…');
  try {
    await api.saveWorkflow(state.doc);
    setSaveStatus(savedLabel(), 'ok');
  } catch (err) {
    console.error(err);
    setSaveStatus('Save failed', 'error');
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus('Unsaved changes');
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

/** Call after any document mutation. */
function changed() {
  scheduleRender();
  scheduleSave();
}

// ---------- rendering ----------

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function render() {
  renderQueued = false;
  applyView();
  renderEdges();
  renderNodes();
  renderOverlay();
  measureTextNodes();
}

function applyView() {
  const { x, y, k } = state.view;
  viewportEl.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
  stage.style.backgroundSize = `${GRID * 2 * k}px ${GRID * 2 * k}px`;
  stage.style.backgroundPosition = `${x}px ${y}px`;
  zoomEl.textContent = `${Math.round(k * 100)}%`;
}

function blockRects() {
  return state.doc.nodes.filter(isBlock).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
}

function edgePoints(edge, obstacles) {
  const a = findNode(edge.from.node);
  const b = findNode(edge.to.node);
  if (!a || !b) return null;
  return routeEdge({ rect: a, side: edge.from.side }, { rect: b, side: edge.to.side }, obstacles);
}

function roundedPath(points, radius = 10) {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const inLen = Math.hypot(c.x - p.x, c.y - p.y);
    const outLen = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = c.x - ((c.x - p.x) / inLen) * r;
    const ay = c.y - ((c.y - p.y) / inLen) * r;
    const bx = c.x + ((n.x - c.x) / outLen) * r;
    const by = c.y + ((n.y - c.y) / outLen) * r;
    d += ` L${ax},${ay} Q${c.x},${c.y} ${bx},${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

function arrowHead(points, size = 9) {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const ux = (tip.x - prev.x) / len;
  const uy = (tip.y - prev.y) / len;
  const bx = tip.x - ux * size;
  const by = tip.y - uy * size;
  const half = size * 0.55;
  return `M${tip.x},${tip.y} L${bx - uy * half},${by + ux * half} L${bx + uy * half},${by - ux * half} Z`;
}

function pointAtHalfLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining > len) {
      remaining -= len;
      continue;
    }
    const t = len ? remaining / len : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return points[0];
}

function edgeLabelMarkup(edge, points) {
  if (!edge.label) return '';
  const mid = pointAtHalfLength(points);
  const width = Math.ceil(measureCtx.measureText(edge.label).width) + 16;
  return `<g class="edge-label" transform="translate(${mid.x},${mid.y})">
    <rect x="${-width / 2}" y="-11" width="${width}" height="22" rx="11" style="stroke:${edge.color}"></rect>
    <text y="4" text-anchor="middle">${escapeHtml(edge.label)}</text>
  </g>`;
}

function renderEdges() {
  const obstacles = blockRects();
  let html = '';
  for (const edge of state.doc.edges) {
    const points = edgePoints(edge, obstacles);
    if (!points) continue;
    const d = roundedPath(points);
    const selected = state.selection?.kind === 'edge' && state.selection.id === edge.id ? ' selected' : '';
    html += `<g class="edge${selected}" data-edge="${edge.id}" style="--c:${edge.color}">
      <path class="edge-hit" d="${d}"></path>
      <path class="edge-line" d="${d}"></path>
      <path class="edge-arrow" d="${arrowHead(points)}"></path>
      ${edgeLabelMarkup(edge, points)}
    </g>`;
  }
  edgesEl.innerHTML = html;
}

function shapeMarkup(node) {
  const { w, h } = node;
  if (node.type === 'decision') return `<polygon class="node-shape" points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}"></polygon>`;
  const rx = node.type === 'terminal' ? h / 2 : 12;
  return `<rect class="node-shape" width="${w}" height="${h}" rx="${rx}"></rect>`;
}

function portsMarkup(node) {
  return SIDES.map((side) => {
    const p = portPoint({ x: 0, y: 0, w: node.w, h: node.h }, side);
    return `<g class="port" data-port="${side}" transform="translate(${p.x},${p.y})">
      <circle class="port-hit" r="${PORT_HIT_R}"></circle><circle class="port-dot" r="${PORT_DOT_R}"></circle>
    </g>`;
  }).join('');
}

function nodeMarkup(node) {
  const selected = state.selection?.kind === 'node' && state.selection.id === node.id;
  const cls = `node node-${node.type}${selected ? ' selected' : ''}`;
  const head = `<g class="${cls}" data-node="${node.id}" transform="translate(${node.x},${node.y})" style="--c:${node.color}">`;

  if (node.type === 'text') {
    return `${head}
      <rect class="text-hit" x="-6" y="-4" width="${node.w + 12}" height="${node.h + 8}" rx="6"></rect>
      <foreignObject width="2000" height="1000" class="fo">
        <div xmlns="http://www.w3.org/1999/xhtml" class="free-text" style="font-size:${node.fontSize}px">${escapeHtml(node.text)}</div>
      </foreignObject>
    </g>`;
  }

  const handle = selected ? `<rect class="resize-handle" data-resize="1" x="${node.w - HANDLE_SIZE / 2}" y="${node.h - HANDLE_SIZE / 2}" width="${HANDLE_SIZE}" height="${HANDLE_SIZE}" rx="2"></rect>` : '';
  return `${head}
    ${shapeMarkup(node)}
    <foreignObject width="${node.w}" height="${node.h}" class="fo">
      <div xmlns="http://www.w3.org/1999/xhtml" class="node-label" style="font-size:${labelFontSize(node)}px">${escapeHtml(node.text)}</div>
    </foreignObject>
    ${portsMarkup(node)}
    ${handle}
  </g>`;
}

function renderNodes() {
  nodesEl.innerHTML = state.doc.nodes.map(nodeMarkup).join('');
}

/** Free text sizes itself to its content; store the measured size for hit testing. */
function measureTextNodes() {
  let resized = false;
  for (const el of nodesEl.querySelectorAll('.node-text')) {
    const node = findNode(el.dataset.node);
    const div = el.querySelector('.free-text');
    if (!node || !div) continue;
    const w = Math.max(20, div.offsetWidth);
    const h = Math.max(16, div.offsetHeight);
    if (w === node.w && h === node.h) continue;
    node.w = w;
    node.h = h;
    resized = true;
  }
  if (resized) scheduleRender();
}

function renderOverlay() {
  if (drag?.mode !== 'connect') {
    overlayEl.innerHTML = '';
    return;
  }
  const source = findNode(drag.fromId);
  const start = portPoint(source, drag.side);
  const target = hitTestBlock(drag.point, source.id);
  if (!target) {
    overlayEl.innerHTML = `<path class="connect-preview" d="M${start.x},${start.y} L${drag.point.x},${drag.point.y}"></path>`;
    return;
  }
  const side = nearestSide(target, drag.point);
  const points = routeEdge({ rect: source, side: drag.side }, { rect: target, side }, blockRects());
  const p = portPoint(target, side);
  overlayEl.innerHTML = `<rect class="connect-target" x="${target.x - 4}" y="${target.y - 4}" width="${target.w + 8}" height="${target.h + 8}" rx="14"></rect>
    <path class="connect-preview routed" d="${roundedPath(points)}"></path>
    <circle class="connect-port" cx="${p.x}" cy="${p.y}" r="6"></circle>`;
}

// ---------- inspector ----------

function swatchesMarkup(current) {
  const swatches = COLORS.map((c) => `<button class="swatch${c === current ? ' active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
  return `<div class="swatches">${swatches}<label class="swatch custom" title="Custom color"><input type="color" data-field="color" value="${current}"></label></div>`;
}

function nodeInspector(node) {
  if (node.type === 'text') {
    return `<h2>Text</h2>
      <label class="field"><span>Text</span><textarea data-field="text" rows="4">${escapeHtml(node.text)}</textarea></label>
      <div class="field"><span>Color</span>${swatchesMarkup(node.color)}</div>
      <label class="field"><span>Size · <b data-out="fontSize">${node.fontSize}px</b></span><input type="range" min="10" max="72" data-field="fontSize" value="${node.fontSize}"></label>
      <button class="danger" data-action="delete-selection">Delete text</button>`;
  }
  const types = ['process', 'decision', 'terminal'].map((t) => `<button class="${t === node.type ? 'active' : ''}" data-type="${t}">${NODE_TYPES[t].label}</button>`).join('');
  const outgoing = state.doc.edges.filter((e) => e.from.node === node.id);
  const branches = node.type === 'decision' && outgoing.length
    ? `<div class="field"><span>Branches</span>${outgoing.map((e) => `<button class="branch" data-select-edge="${e.id}"><i style="background:${e.color}"></i>${escapeHtml(e.label || '(no label)')} → ${escapeHtml(findNode(e.to.node)?.text || '')}</button>`).join('')}</div>`
    : '';
  return `<h2>${NODE_TYPES[node.type].label}</h2>
    <div class="field"><span>Shape</span><div class="segmented">${types}</div></div>
    <label class="field"><span>Text</span><textarea data-field="text" rows="3">${escapeHtml(node.text)}</textarea></label>
    <div class="field"><span>Color</span>${swatchesMarkup(node.color)}</div>
    ${branches}
    <p class="hint">Drag from a dot on the block's edge to connect it to another block.</p>
    <button class="danger" data-action="delete-selection">Delete block</button>`;
}

function sideSelect(field, current) {
  const options = SIDES.map((s) => `<option value="${s}"${s === current ? ' selected' : ''}>${s}</option>`).join('');
  return `<select data-field="${field}">${options}</select>`;
}

function edgeInspector(edge) {
  const from = findNode(edge.from.node);
  const to = findNode(edge.to.node);
  const quick = ['Yes', 'No', 'Maybe'].map((l) => `<button data-label="${l}">${l}</button>`).join('');
  return `<h2>Connection</h2>
    <p class="hint">${escapeHtml(from?.text || '')} → ${escapeHtml(to?.text || '')}</p>
    <label class="field"><span>Label</span><input type="text" data-field="label" value="${escapeHtml(edge.label)}" placeholder="e.g. Yes"></label>
    <div class="chips">${quick}</div>
    <div class="field"><span>Color</span>${swatchesMarkup(edge.color)}</div>
    <div class="field two"><label><span>From side</span>${sideSelect('fromSide', edge.from.side)}</label><label><span>To side</span>${sideSelect('toSide', edge.to.side)}</label></div>
    <button data-action="reverse-edge">Reverse direction</button>
    <button class="danger" data-action="delete-selection">Delete connection</button>`;
}

function helpInspector() {
  return `<div class="inspector-head">
      <h2>Getting started</h2>
      <button class="icon small" data-action="close-help" title="Hide help" aria-label="Hide help">✕</button>
    </div>
    <h3>How to</h3>
    <ul class="help">
      <li>Add blocks from the toolbar.</li>
      <li>Drag a block to move it. Drag empty space to pan, scroll to zoom.</li>
      <li>Drag from a <b>dot</b> on a block to another block to connect them. Lines route around other blocks.</li>
      <li>Connections out of a decision are labelled <b>Yes</b>, <b>No</b>, … — click a line to change its label or color.</li>
      <li>Double-click a block, line or text to edit it. Double-click empty space to add text.</li>
      <li>Drag the corner square of a selected block to resize it; its text scales along. Hold <kbd>Ctrl</kbd> to keep its proportions.</li>
    </ul>
    <h3>Shortcuts</h3>
    <ul class="help keys">
      <li><kbd>Del</kbd> delete selection</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo</li>
      <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate block</li>
      <li><kbd>Enter</kbd> edit selection · <kbd>Esc</kbd> deselect</li>
      <li><kbd>Space</kbd>+drag pan</li>
      <li>Touch: pinch to zoom, drag empty space to pan, tap a block to show its dots</li>
    </ul>
    <p class="hint">Reopen this any time with the <b>?</b> button.</p>`;
}

function renderInspector() {
  inspectorEl.hidden = false;
  const node = selectedNode();
  if (node) {
    inspectorEl.innerHTML = nodeInspector(node);
    return;
  }
  const edge = selectedEdge();
  if (edge) {
    inspectorEl.innerHTML = edgeInspector(edge);
    return;
  }
  if (state.helpOpen) {
    inspectorEl.innerHTML = helpInspector();
    return;
  }
  // Nothing to show: hide the panel so the canvas uses the full width.
  inspectorEl.hidden = true;
  inspectorEl.innerHTML = '';
  scheduleRender();
}

function setHelpOpen(open) {
  state.helpOpen = open;
  writeFlag(HELP_DISMISSED_KEY, !open);
  if (open) state.selection = null;
  scheduleRender();
  renderInspector();
}

function select(kind, id) {
  const next = kind ? { kind, id } : null;
  const same = state.selection?.kind === next?.kind && state.selection?.id === next?.id;
  state.selection = next;
  scheduleRender();
  if (!same) renderInspector();
}

/** Apply an inspector change; record undo once per focused field. */
let fieldSnapshot = null;

function applyField(field, value) {
  const node = selectedNode();
  const edge = selectedEdge();
  const target = node || edge;
  if (!target) return;

  if (fieldSnapshot) {
    pushUndo(fieldSnapshot);
    fieldSnapshot = null;
  }

  if (field === 'fromSide') edge.from.side = value;
  else if (field === 'toSide') edge.to.side = value;
  else if (field === 'fontSize') target.fontSize = Number(value);
  else target[field] = value;

  if (field === 'fontSize') {
    const out = inspectorEl.querySelector('[data-out="fontSize"]');
    if (out) out.textContent = `${value}px`;
  }
  changed();
}

inspectorEl.addEventListener('focusin', (e) => {
  if (!e.target.dataset.field) return;
  fieldSnapshot = snapshot();
});

inspectorEl.addEventListener('focusout', () => {
  fieldSnapshot = null;
});

inspectorEl.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  if (!fieldSnapshot) fieldSnapshot = snapshot();
  applyField(field, e.target.value);
  if (field === 'color') {
    for (const s of inspectorEl.querySelectorAll('.swatch')) s.classList.toggle('active', s.dataset.color === e.target.value);
  }
});

inspectorEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.color) {
    fieldSnapshot = snapshot();
    applyField('color', btn.dataset.color);
    renderInspector();
    return;
  }
  if (btn.dataset.label) {
    fieldSnapshot = snapshot();
    applyField('label', btn.dataset.label);
    renderInspector();
    return;
  }
  if (btn.dataset.type) {
    changeNodeType(selectedNode(), btn.dataset.type);
    return;
  }
  if (btn.dataset.selectEdge) {
    select('edge', btn.dataset.selectEdge);
    return;
  }
  if (btn.dataset.action === 'reverse-edge') {
    reverseEdge(selectedEdge());
    return;
  }
  if (btn.dataset.action === 'close-help') {
    setHelpOpen(false);
    return;
  }
  if (btn.dataset.action === 'delete-selection') deleteSelection();
});

// ---------- document operations ----------

function viewCenter() {
  const box = svg.getBoundingClientRect();
  return toWorld(box.left + box.width / 2, box.top + box.height / 2);
}

function addNode(type, at = viewCenter()) {
  pushUndo();
  const d = NODE_TYPES[type];
  const node = createNode(type, snap(at.x - d.w / 2), snap(at.y - d.h / 2));
  state.doc.nodes.push(node);
  select('node', node.id);
  changed();
  keepSelectionVisible();
  return node;
}

/** On phones, pan up so the selected block isn't hidden behind the bottom sheet. */
function keepSelectionVisible() {
  if (!SHEET_LAYOUT.matches || inspectorEl.hidden) return;
  const node = selectedNode();
  if (!node) return;
  const svgTop = svg.getBoundingClientRect().top;
  const blockBottom = svgTop + toScreen({ x: node.x, y: node.y + node.h }).y;
  const overlap = blockBottom + 16 - inspectorEl.getBoundingClientRect().top;
  if (overlap <= 0) return;
  state.view.y -= overlap;
  scheduleRender();
}

function changeNodeType(node, type) {
  if (!node || node.type === type) return;
  pushUndo();
  const d = NODE_TYPES[type];
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  node.type = type;
  node.w = d.w;
  node.h = d.h;
  node.x = snap(cx - d.w / 2);
  node.y = snap(cy - d.h / 2);
  changed();
  renderInspector();
}

function reverseEdge(edge) {
  if (!edge) return;
  pushUndo();
  [edge.from, edge.to] = [edge.to, edge.from];
  changed();
  renderInspector();
}

function deleteSelection() {
  const sel = state.selection;
  if (!sel) return;
  pushUndo();
  if (sel.kind === 'edge') {
    state.doc.edges = state.doc.edges.filter((e) => e.id !== sel.id);
  } else {
    state.doc.nodes = state.doc.nodes.filter((n) => n.id !== sel.id);
    state.doc.edges = state.doc.edges.filter((e) => e.from.node !== sel.id && e.to.node !== sel.id);
  }
  select(null);
  changed();
}

function duplicateSelection() {
  const node = selectedNode();
  if (!node) return;
  pushUndo();
  const copy = { ...node, id: uid(), x: node.x + 30, y: node.y + 30 };
  state.doc.nodes.push(copy);
  select('node', copy.id);
  changed();
}

function connect(source, side, target, targetSide) {
  pushUndo();
  const edge = createEdge({ node: source.id, side }, { node: target.id, side: targetSide }, defaultEdgeLabel(state.doc, source));
  state.doc.edges.push(edge);
  select('edge', edge.id);
  changed();
}

// ---------- inline editor ----------

function openEditor(kind, id) {
  closeEditor(true);
  const item = kind === 'edge' ? findEdge(id) : findNode(id);
  if (!item) return;

  const box = svg.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  const offsetX = box.left - stageBox.left;
  const offsetY = box.top - stageBox.top;
  const k = state.view.k;
  const el = document.createElement(kind === 'edge' ? 'input' : 'textarea');
  el.className = `inline-editor inline-${kind === 'edge' ? 'edge' : item.type}`;
  el.value = kind === 'edge' ? item.label : item.text;

  if (kind === 'edge') {
    const points = edgePoints(item, blockRects());
    const mid = toScreen(pointAtHalfLength(points));
    Object.assign(el.style, { left: `${offsetX + mid.x - 70}px`, top: `${offsetY + mid.y - 15}px`, width: '140px' });
    el.placeholder = 'Label';
  } else {
    const p = toScreen(item);
    const minW = item.type === 'text' ? 160 : 0;
    Object.assign(el.style, {
      left: `${offsetX + p.x}px`,
      top: `${offsetY + p.y}px`,
      width: `${Math.max(minW, item.w * k)}px`,
      height: `${Math.max(item.h * k, 30)}px`,
      fontSize: `${(item.type === 'text' ? item.fontSize : labelFontSize(item)) * k}px`,
      color: item.type === 'text' ? item.color : '',
    });
  }

  stage.appendChild(el);
  editor = { el, kind, id, before: snapshot() };
  el.focus();
  el.select();

  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      closeEditor(false);
      return;
    }
    if (e.key !== 'Enter') return;
    const multiline = kind !== 'edge' && item.type === 'text';
    if (multiline && !(e.ctrlKey || e.metaKey)) return;
    if (!multiline && e.shiftKey) return;
    e.preventDefault();
    closeEditor(true);
  });
  el.addEventListener('blur', () => closeEditor(true));
}

function closeEditor(commit) {
  if (!editor) return;
  const { el, kind, id, before } = editor;
  editor = null;
  el.remove();
  if (!commit) return;

  const item = kind === 'edge' ? findEdge(id) : findNode(id);
  if (!item) return;
  const field = kind === 'edge' ? 'label' : 'text';
  const value = kind === 'edge' ? el.value.trim() : el.value;
  if (item[field] === value) return;
  pushUndo(before);
  item[field] = value;
  changed();
  renderInspector();
}

// ---------- pointer interaction ----------

function startPan(e) {
  drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, viewX: state.view.x, viewY: state.view.y };
  stage.classList.add('panning');
}

// Double clicks are detected by hand: every render replaces the SVG elements,
// so the browser's own dblclick target is unreliable.
let lastDown = null;

function hitInfo(target) {
  const nodeEl = target.closest('[data-node]');
  if (nodeEl) return { kind: 'node', id: nodeEl.dataset.node };
  const edgeEl = target.closest('[data-edge]');
  if (edgeEl) return { kind: 'edge', id: edgeEl.dataset.edge };
  return { kind: null, id: null };
}

function isDoubleClick(e, hit) {
  const prev = lastDown;
  lastDown = { ...hit, time: performance.now(), x: e.clientX, y: e.clientY };
  if (!prev || prev.kind !== hit.kind || prev.id !== hit.id) return false;
  if (performance.now() - prev.time > 400) return false;
  if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 6) return false;
  lastDown = null;
  return true;
}

function handleDoubleClick(hit, world) {
  if (hit.kind) {
    openEditor(hit.kind, hit.id);
    return;
  }
  const node = addNode('text', world);
  requestAnimationFrame(() => openEditor('node', node.id));
}

// ---------- touch: pinch to zoom ----------

const touchPoints = new Map(); // pointerId -> { x, y } in client coordinates
let pinch = null; // { dist, world, k } at the start of the pinch

const clampZoom = (k) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

function twoTouchGeometry() {
  const [a, b] = touchPoints.values();
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

function startPinch() {
  // A second finger turns whatever the first one started into a pinch.
  if (drag?.moved) changed();
  drag = null;
  stage.classList.remove('panning');
  svg.classList.remove('connecting');
  const { dist, mid } = twoTouchGeometry();
  pinch = { dist, world: toWorld(mid.x, mid.y), k: state.view.k };
  scheduleRender();
}

/** Zoom by the change in finger distance and keep the point between the fingers under them. */
function updatePinch() {
  const { dist, mid } = twoTouchGeometry();
  const box = svg.getBoundingClientRect();
  const k = clampZoom((pinch.k * dist) / pinch.dist);
  state.view = { k, x: mid.x - box.left - pinch.world.x * k, y: mid.y - box.top - pinch.world.y * k };
  scheduleRender();
}

svg.addEventListener('pointerdown', (e) => {
  if (editor) closeEditor(true);

  if (e.pointerType === 'touch') {
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.size >= 2) {
      startPinch();
      return;
    }
  }
  if (pinch) return;

  if (e.button === 1 || (e.button === 0 && spaceHeld)) {
    e.preventDefault();
    startPan(e);
    return;
  }
  if (e.button !== 0) return;

  const world = toWorld(e.clientX, e.clientY);
  const onPort = Boolean(e.target.closest('[data-port], [data-resize]'));
  if (!onPort && isDoubleClick(e, hitInfo(e.target))) {
    // Open the editor on pointerup, after the browser has finished moving focus.
    drag = { mode: 'dblclick', hit: hitInfo(e.target), world };
    return;
  }

  const nodeEl = e.target.closest('[data-node]');
  const portEl = e.target.closest('[data-port]');
  const edgeEl = e.target.closest('[data-edge]');

  if (nodeEl && portEl) {
    drag = { mode: 'connect', fromId: nodeEl.dataset.node, side: portEl.dataset.port, point: world };
    svg.classList.add('connecting');
    scheduleRender();
    return;
  }

  if (nodeEl && e.target.closest('[data-resize]')) {
    const node = findNode(nodeEl.dataset.node);
    drag = { mode: 'resize', id: node.id, start: world, w: node.w, h: node.h, before: snapshot(), moved: false };
    return;
  }

  if (nodeEl) {
    const node = findNode(nodeEl.dataset.node);
    select('node', node.id);
    // Bring to front so it renders above overlapping blocks.
    state.doc.nodes = [...state.doc.nodes.filter((n) => n !== node), node];
    drag = { mode: 'move', id: node.id, dx: world.x - node.x, dy: world.y - node.y, before: snapshot(), moved: false };
    return;
  }

  if (edgeEl) {
    select('edge', edgeEl.dataset.edge);
    return;
  }

  select(null);
  startPan(e);
});

window.addEventListener('pointermove', (e) => {
  if (touchPoints.has(e.pointerId)) touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    if (touchPoints.size >= 2) updatePinch();
    return;
  }
  if (!drag || drag.mode === 'dblclick') return;
  const world = toWorld(e.clientX, e.clientY);

  if (drag.mode === 'pan') {
    state.view.x = drag.viewX + e.clientX - drag.startX;
    state.view.y = drag.viewY + e.clientY - drag.startY;
    scheduleRender();
    return;
  }

  if (drag.mode === 'connect') {
    drag.point = world;
    scheduleRender();
    return;
  }

  const node = findNode(drag.id);
  if (!node) return;

  if (drag.mode === 'move') {
    const x = snap(world.x - drag.dx);
    const y = snap(world.y - drag.dy);
    if (x === node.x && y === node.y) return;
    if (!drag.moved) pushUndo(drag.before);
    drag.moved = true;
    node.x = x;
    node.y = y;
    scheduleRender();
    return;
  }

  if (drag.mode === 'resize') {
    const { w, h } = resizedSize(drag, world, e.ctrlKey || e.metaKey);
    if (w === node.w && h === node.h) return;
    if (!drag.moved) pushUndo(drag.before);
    drag.moved = true;
    node.w = w;
    node.h = h;
    scheduleRender();
  }
});

const MIN_BLOCK_W = 60;
const MIN_BLOCK_H = 30;

/** New block size while dragging the resize handle; `keepRatio` locks the starting proportions. */
function resizedSize(drag, world, keepRatio) {
  const dx = world.x - drag.start.x;
  const dy = world.y - drag.start.y;
  if (!keepRatio) {
    return { w: Math.max(MIN_BLOCK_W, snap(drag.w + dx)), h: Math.max(MIN_BLOCK_H, snap(drag.h + dy)) };
  }
  // Follow whichever axis was dragged further; skip grid snapping so the ratio holds.
  const minFactor = Math.max(MIN_BLOCK_W / drag.w, MIN_BLOCK_H / drag.h);
  const factor = Math.max(minFactor, (drag.w + dx) / drag.w, (drag.h + dy) / drag.h);
  return { w: Math.round(drag.w * factor), h: Math.round(drag.h * factor) };
}

function endDrag(e) {
  touchPoints.delete(e.pointerId);
  if (pinch) {
    if (touchPoints.size < 2) pinch = null;
    return;
  }
  if (!drag) return;
  const finished = drag;
  drag = null;
  stage.classList.remove('panning');
  svg.classList.remove('connecting');

  if (finished.mode === 'dblclick') {
    handleDoubleClick(finished.hit, finished.world);
    return;
  }

  if (finished.mode === 'connect') {
    const source = findNode(finished.fromId);
    const world = toWorld(e.clientX, e.clientY);
    const target = source && hitTestBlock(world, source.id);
    scheduleRender();
    if (!target) return;
    connect(source, finished.side, target, nearestSide(target, world));
    return;
  }

  if (finished.moved) changed();
  // A tap (no drag) on a block: make sure it stays visible above the bottom sheet.
  if (finished.mode === 'move' && !finished.moved) keepSelectionVisible();
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { k } = state.view;
  const next = clampZoom(k * Math.exp(-e.deltaY * 0.0015));
  const world = toWorld(e.clientX, e.clientY);
  const box = svg.getBoundingClientRect();
  state.view.k = next;
  state.view.x = e.clientX - box.left - world.x * next;
  state.view.y = e.clientY - box.top - world.y * next;
  scheduleRender();
}, { passive: false });

/** Visible part of the canvas: on phones the bottom sheet covers its lower part. */
function visibleCanvasSize() {
  const box = svg.getBoundingClientRect();
  if (!SHEET_LAYOUT.matches || inspectorEl.hidden) return { width: box.width, height: box.height };
  return { width: box.width, height: inspectorEl.getBoundingClientRect().top - box.top };
}

function fitView() {
  const nodes = state.doc.nodes;
  const box = visibleCanvasSize();
  if (!nodes.length) {
    state.view = { x: box.width / 2, y: box.height / 2, k: 1 };
    scheduleRender();
    return;
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const pad = SHEET_LAYOUT.matches ? 16 : 80;
  const k = Math.min(1, (box.width - pad * 2) / (maxX - minX || 1), (box.height - pad * 2) / (maxY - minY || 1));
  const clamped = Math.max(MIN_ZOOM, k);
  state.view = {
    k: clamped,
    x: box.width / 2 - ((minX + maxX) / 2) * clamped,
    y: box.height / 2 - ((minY + maxY) / 2) * clamped,
  };
  scheduleRender();
}

// ---------- keyboard ----------

function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && key === 'd') {
    e.preventDefault();
    duplicateSelection();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelection();
    return;
  }
  if (e.key === 'Escape') {
    setMenuOpen(false);
    select(null);
    return;
  }
  if (e.key === 'Enter' && state.selection) {
    e.preventDefault();
    openEditor(state.selection.kind, state.selection.id);
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
    stage.classList.add('can-pan');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  spaceHeld = false;
  stage.classList.remove('can-pan');
});

// ---------- workflows ----------

function renderWorkflowSelect() {
  workflowSelect.innerHTML = state.workflows
    .map((w) => `<option value="${escapeHtml(w.id)}"${w.id === state.doc.id ? ' selected' : ''}>${escapeHtml(w.name)}</option>`)
    .join('');
}

function rememberLastOpened(id) {
  try {
    localStorage.setItem(LAST_OPENED_KEY, id);
  } catch {
    // Storage may be unavailable (private mode); not essential.
  }
}

function readLastOpened() {
  try {
    return localStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage may be unavailable (private mode); not essential.
  }
}

function openDoc(doc) {
  state.doc = normalizeDoc(doc);
  state.undo = [];
  state.redo = [];
  state.selection = null;
  rememberLastOpened(state.doc.id);
  renderWorkflowSelect();
  renderInspector();
  fitView();
}

async function flushSave() {
  if (!saveTimer) return;
  await saveNow();
}

async function refreshList() {
  state.workflows = await api.listWorkflows();
  if (!state.workflows.some((w) => w.id === state.doc.id)) state.workflows.unshift({ id: state.doc.id, name: state.doc.name });
  renderWorkflowSelect();
}

async function createWorkflow(doc) {
  await flushSave();
  openDoc(doc);
  await saveNow();
  await refreshList();
}

async function switchWorkflow(id) {
  await flushSave();
  try {
    openDoc(await api.loadWorkflow(id));
  } catch (err) {
    console.error(err);
    setSaveStatus('Could not open workflow', 'error');
  }
}

async function handleToolbarAction(action) {
  if (action === 'undo') return undo();
  if (action === 'redo') return redo();
  if (action === 'fit') return fitView();
  if (action === 'import') return importInput.click();
  if (action === 'export') return exportDoc();
  if (action === 'export-png') return exportImage();

  if (action === 'new-workflow') {
    const name = prompt('Name of the new workflow:', 'Untitled workflow');
    if (name === null) return;
    return createWorkflow(emptyWorkflow(name.trim() || 'Untitled workflow'));
  }

  if (action === 'rename-workflow') {
    const name = prompt('Rename workflow:', state.doc.name);
    if (!name?.trim()) return;
    state.doc.name = name.trim();
    await saveNow();
    await refreshList();
    renderInspector();
    return;
  }

  if (action === 'delete-workflow') {
    if (!confirm(`Delete "${state.doc.name}"? This cannot be undone.`)) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    await api.deleteWorkflow(state.doc.id);
    const remaining = (await api.listWorkflows()).filter((w) => w.id !== state.doc.id);
    if (!remaining.length) return createWorkflow(emptyWorkflow());
    state.workflows = remaining;
    return switchWorkflow(remaining[0].id);
  }
}

function download(blob, extension) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.doc.name.replace(/[^\w-]+/g, '_') || 'workflow'}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportDoc() {
  download(new Blob([JSON.stringify(state.doc, null, 2)], { type: 'application/json' }), 'json');
}

/** Area covered by blocks, text, connector routes and their labels. */
function contentBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y, w = 0, h = 0) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const n of state.doc.nodes) add(n.x, n.y, n.w, n.h);
  const obstacles = blockRects();
  for (const edge of state.doc.edges) {
    const points = edgePoints(edge, obstacles);
    if (!points) continue;
    for (const p of points) add(p.x, p.y);
    if (!edge.label) continue;
    const mid = pointAtHalfLength(points);
    const width = measureCtx.measureText(edge.label).width + 16;
    add(mid.x - width / 2, mid.y - 11, width, 22);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

async function exportImage() {
  const bounds = contentBounds();
  if (!bounds) {
    alert('Add something to the workflow before exporting an image.');
    return;
  }

  // Render once without selection highlights so they don't end up in the image.
  const selection = state.selection;
  state.selection = null;
  render();
  try {
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    download(await renderPng(viewportEl, bounds, { background }), 'png');
  } catch (err) {
    console.error(err);
    alert('Could not export the image.');
  } finally {
    state.selection = selection;
    scheduleRender();
  }
}

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  try {
    const doc = normalizeDoc(JSON.parse(await file.text()));
    await createWorkflow({ ...doc, id: uid() });
  } catch (err) {
    console.error(err);
    alert('That file is not a valid workflow.');
  }
});

function setMenuOpen(open) {
  workflowMenu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
}

document.querySelector('.topbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.action === 'toggle-menu') {
    setMenuOpen(workflowMenu.hidden);
    return;
  }
  setMenuOpen(false);
  if (btn.dataset.add) {
    addNode(btn.dataset.add);
    return;
  }
  if (btn.dataset.action === 'help') {
    setHelpOpen(!state.helpOpen || Boolean(state.selection));
    return;
  }
  if (btn.dataset.action) handleToolbarAction(btn.dataset.action);
});

document.addEventListener('pointerdown', (e) => {
  if (workflowMenu.hidden || e.target.closest('.menu-wrap')) return;
  setMenuOpen(false);
});

workflowSelect.addEventListener('change', () => switchWorkflow(workflowSelect.value));
window.addEventListener('resize', scheduleRender);
window.addEventListener('beforeunload', () => {
  if (!saveTimer) return;
  api.saveOnUnload(state.doc);
});

// ---------- boot ----------

async function boot() {
  $('#version').textContent = `v${VERSION}`;
  renderInspector();
  let list;
  try {
    list = await api.listWorkflows();
  } catch (err) {
    console.error(err);
    setSaveStatus('Could not load workflows', 'error');
    openDoc(sampleWorkflow());
    return;
  }

  if (!list.length) {
    await createWorkflow(sampleWorkflow());
    return;
  }

  state.workflows = list;
  const last = readLastOpened();
  const id = list.some((w) => w.id === last) ? last : list[0].id;
  await switchWorkflow(id);
  setSaveStatus(savedLabel(), 'ok');
}

boot();
