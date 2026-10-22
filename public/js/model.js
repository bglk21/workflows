import { SIDES } from './router.js';

export const COLORS = ['#7c8cff', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#a78bfa', '#94a3b8'];

export const NODE_TYPES = {
  process: { label: 'Step', w: 160, h: 64, text: 'New step', color: '#7c8cff' },
  decision: { label: 'Decision', w: 160, h: 100, text: 'Decision?', color: '#fbbf24' },
  terminal: { label: 'Start / End', w: 140, h: 52, text: 'Start', color: '#34d399' },
  text: { label: 'Text', w: 120, h: 28, text: 'Text', color: '#e2e8f0', fontSize: 16 },
};

const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const DEFAULT_EDGE_COLOR = '#94a3b8';

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function validColor(value, fallback) {
  return typeof value === 'string' && COLOR_PATTERN.test(value) ? value : fallback;
}

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const defaults = NODE_TYPES[raw.type];
  if (!defaults) return null;
  const node = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    type: raw.type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(40, num(raw.w, defaults.w)),
    h: Math.max(20, num(raw.h, defaults.h)),
    text: typeof raw.text === 'string' ? raw.text : defaults.text,
    color: validColor(raw.color, defaults.color),
  };
  if (raw.type === 'text') node.fontSize = Math.min(72, Math.max(10, num(raw.fontSize, defaults.fontSize)));
  return node;
}

function normalizeEnd(raw, nodeIds) {
  if (!raw || !nodeIds.has(raw.node)) return null;
  return { node: raw.node, side: SIDES.includes(raw.side) ? raw.side : 'right' };
}

function normalizeEdge(raw, nodeIds) {
  if (!raw || typeof raw !== 'object') return null;
  const from = normalizeEnd(raw.from, nodeIds);
  const to = normalizeEnd(raw.to, nodeIds);
  if (!from || !to || from.node === to.node) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    from,
    to,
    label: typeof raw.label === 'string' ? raw.label : '',
    color: validColor(raw.color, DEFAULT_EDGE_COLOR),
  };
}

/** Coerce untrusted JSON (from disk or an import) into a well-formed workflow. */
export function normalizeDoc(raw) {
  const nodes = (Array.isArray(raw?.nodes) ? raw.nodes : []).map(normalizeNode).filter(Boolean);
  const blockIds = new Set(nodes.filter((n) => n.type !== 'text').map((n) => n.id));
  const edges = (Array.isArray(raw?.edges) ? raw.edges : []).map((e) => normalizeEdge(e, blockIds)).filter(Boolean);
  return {
    id: typeof raw?.id === 'string' && /^[a-z0-9-]{1,64}$/.test(raw.id) ? raw.id : uid(),
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled workflow',
    nodes,
    edges,
  };
}

export function createNode(type, x, y) {
  const d = NODE_TYPES[type];
  const node = { id: uid(), type, x, y, w: d.w, h: d.h, text: d.text, color: d.color };
  if (type === 'text') node.fontSize = d.fontSize;
  return node;
}

export function createEdge(from, to, label = '') {
  return { id: uid(), from, to, label, color: DEFAULT_EDGE_COLOR };
}

/** Default label for a new connector leaving a decision: Yes, No, then Option N. */
export function defaultEdgeLabel(doc, sourceNode) {
  if (sourceNode.type !== 'decision') return '';
  const count = doc.edges.filter((e) => e.from.node === sourceNode.id).length;
  if (count === 0) return 'Yes';
  if (count === 1) return 'No';
  return `Option ${count + 1}`;
}

export function emptyWorkflow(name = 'Untitled workflow') {
  return { id: uid(), name, nodes: [], edges: [] };
}

export function sampleWorkflow() {
  const n = (id, type, x, y, text, color, extra = {}) => ({ ...createNode(type, x, y), id, text, ...(color ? { color } : {}), ...extra });
  const e = (from, fromSide, to, toSide, label = '') => ({ ...createEdge({ node: from, side: fromSide }, { node: to, side: toSide }, label) });
  return {
    id: uid(),
    name: 'New workflow',
    nodes: [
      n('note', 'text', 40, 40, 'Welcome to Workflows\nDrag blocks around · drag from the dots to connect · double-click to edit', '#94a3b8', { w: 520, h: 44, fontSize: 15 }),
      n('start', 'terminal', 40, 230, 'Request received', '#34d399', { w: 160 }),
      n('triage', 'process', 260, 224, 'Triage request'),
      n('urgent', 'decision', 480, 206, 'Is it urgent?'),
      n('now', 'process', 740, 120, 'Handle immediately', '#f87171'),
      n('backlog', 'process', 740, 340, 'Add to backlog', '#38bdf8'),
      n('done', 'terminal', 1000, 230, 'Done', '#a78bfa'),
    ],
    edges: [
      e('start', 'right', 'triage', 'left'),
      e('triage', 'right', 'urgent', 'left'),
      e('urgent', 'top', 'now', 'left', 'Yes'),
      e('urgent', 'bottom', 'backlog', 'left', 'No'),
      e('now', 'right', 'done', 'top'),
      e('backlog', 'right', 'done', 'bottom'),
      e('backlog', 'bottom', 'triage', 'bottom', 'Re-triage'),
    ],
  };
}
