// Orthogonal connector routing that avoids blocks.
//
// Builds a sparse grid from the edges of every (inflated) obstacle plus the
// midpoints between them, then runs A* over it with a penalty per bend. Grid
// lines always coincide with obstacle edges, so a segment between two adjacent
// grid points is either fully inside an obstacle or fully outside it.

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const ROUTE_MARGIN = 18;

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // Indexed like SIDES.
const SIDE_INDEX = { top: 0, right: 1, bottom: 2, left: 3 };
const BEND_COST = 30;

export function portPoint(rect, side) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  if (side === 'top') return { x: cx, y: rect.y };
  if (side === 'right') return { x: rect.x + rect.w, y: cy };
  if (side === 'bottom') return { x: cx, y: rect.y + rect.h };
  return { x: rect.x, y: cy };
}

export function nearestSide(rect, point) {
  let best = SIDES[0];
  let bestDist = Infinity;
  for (const side of SIDES) {
    const p = portPoint(rect, side);
    const dist = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (dist >= bestDist) continue;
    best = side;
    bestDist = dist;
  }
  return best;
}

function inflate(r, m) {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

function containsStrict(r, p) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}

function step(p, dir, dist) {
  return { x: p.x + DIRS[dir][0] * dist, y: p.y + DIRS[dir][1] * dist };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function withMidpoints(values) {
  const out = [...values];
  for (let i = 0; i < values.length - 1; i++) out.push((values[i] + values[i + 1]) / 2);
  return uniqueSorted(out);
}

function buildAxis(base, margin) {
  const sorted = uniqueSorted(base);
  sorted.push(sorted[0] - margin * 2, sorted[sorted.length - 1] + margin * 2);
  const values = withMidpoints(uniqueSorted(sorted));
  return { values, index: new Map(values.map((v, i) => [v, i])) };
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length === 0) return top;
    a[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let min = i;
      if (l < a.length && a[l].f < a[min].f) min = l;
      if (r < a.length && a[r].f < a[min].f) min = r;
      if (min === i) break;
      [a[min], a[i]] = [a[i], a[min]];
      i = min;
    }
    return top;
  }
}

function findPath(start, startDir, goal, goalDir, rects, margin) {
  const xBase = [start.x, goal.x];
  const yBase = [start.y, goal.y];
  for (const r of rects) {
    xBase.push(r.x, r.x + r.w);
    yBase.push(r.y, r.y + r.h);
  }
  const X = buildAxis(xBase, margin);
  const Y = buildAxis(yBase, margin);
  const xs = X.values;
  const ys = Y.values;
  const nx = xs.length;
  const ny = ys.length;
  const at = (i, j) => j * nx + i;

  // pointBlocked: strictly inside an obstacle.
  // hBlocked[at(i,j)]: segment (i,j)->(i+1,j) runs through an obstacle interior.
  // vBlocked[at(i,j)]: segment (i,j)->(i,j+1) runs through an obstacle interior.
  const pointBlocked = new Uint8Array(nx * ny);
  const hBlocked = new Uint8Array(nx * ny);
  const vBlocked = new Uint8Array(nx * ny);
  for (const r of rects) {
    const iL = X.index.get(r.x);
    const iR = X.index.get(r.x + r.w);
    const jT = Y.index.get(r.y);
    const jB = Y.index.get(r.y + r.h);
    for (let j = jT; j <= jB; j++) {
      for (let i = iL; i <= iR; i++) {
        const insideX = i > iL && i < iR;
        const insideY = j > jT && j < jB;
        if (insideX && insideY) pointBlocked[at(i, j)] = 1;
        if (insideY && i < iR) hBlocked[at(i, j)] = 1;
        if (insideX && j < jB) vBlocked[at(i, j)] = 1;
      }
    }
  }

  const segmentBlocked = (i, j, dir) => {
    if (dir === 1) return hBlocked[at(i, j)];
    if (dir === 3) return hBlocked[at(i - 1, j)];
    if (dir === 2) return vBlocked[at(i, j)];
    return vBlocked[at(i, j - 1)];
  };

  const gi = X.index.get(goal.x);
  const gj = Y.index.get(goal.y);
  const goalCell = at(gi, gj);
  const heuristic = (i, j) => Math.abs(xs[i] - goal.x) + Math.abs(ys[j] - goal.y);

  const g = new Float64Array(nx * ny * 4).fill(Infinity);
  const prev = new Int32Array(nx * ny * 4).fill(-1);
  const si = X.index.get(start.x);
  const sj = Y.index.get(start.y);
  const startState = at(si, sj) * 4 + startDir;
  g[startState] = 0;

  const heap = new MinHeap();
  heap.push({ f: heuristic(si, sj), g: 0, state: startState });

  while (heap.size) {
    const { g: cost, state } = heap.pop();
    if (cost > g[state]) continue;

    const cell = state >> 2;
    const dir = state & 3;
    if (cell === goalCell) return reconstruct(prev, state, xs, ys, nx);

    const i = cell % nx;
    const j = (cell - i) / nx;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue;
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (segmentBlocked(i, j, nd)) continue;

      const ncell = at(ni, nj);
      if (pointBlocked[ncell] && ncell !== goalCell) continue;

      let next = cost + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      if (nd !== dir) next += BEND_COST;
      if (ncell === goalCell && nd !== goalDir) next += BEND_COST;

      const nstate = ncell * 4 + nd;
      if (next >= g[nstate]) continue;
      g[nstate] = next;
      prev[nstate] = state;
      heap.push({ f: next + heuristic(ni, nj), g: next, state: nstate });
    }
  }
  return null;
}

function reconstruct(prev, state, xs, ys, nx) {
  const points = [];
  for (let s = state; s !== -1; s = prev[s]) {
    const cell = s >> 2;
    const i = cell % nx;
    points.push({ x: xs[i], y: ys[(cell - i) / nx] });
  }
  return points.reverse();
}

function fallbackPath(s1, startDir, s2) {
  if (startDir === 1 || startDir === 3) {
    const mx = (s1.x + s2.x) / 2;
    return [s1, { x: mx, y: s1.y }, { x: mx, y: s2.y }, s2];
  }
  const my = (s1.y + s2.y) / 2;
  return [s1, { x: s1.x, y: my }, { x: s2.x, y: my }, s2];
}

export function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (collinear) out.splice(i, 1);
  }
  return out;
}

/**
 * Route an orthogonal connector from one block side to another.
 * @param {{rect: {x,y,w,h}, side: string}} source
 * @param {{rect: {x,y,w,h}, side: string}} target
 * @param {Array<{x,y,w,h}>} obstacles Every block, including source and target.
 * @returns {Array<{x,y}>} Polyline points from source port to target port.
 */
export function routeEdge(source, target, obstacles, margin = ROUTE_MARGIN) {
  const startDir = SIDE_INDEX[source.side];
  const endDir = SIDE_INDEX[target.side];
  const p1 = portPoint(source.rect, source.side);
  const p2 = portPoint(target.rect, target.side);
  const s1 = step(p1, startDir, margin);
  const s2 = step(p2, endDir, margin);

  // Blocks that sit too close to a port use their real outline instead of the
  // inflated one (or are ignored when overlapping), so a route always exists.
  const rects = [];
  for (const r of obstacles) {
    const big = inflate(r, margin);
    if (!containsStrict(big, s1) && !containsStrict(big, s2)) {
      rects.push(big);
      continue;
    }
    if (containsStrict(r, s1) || containsStrict(r, s2)) continue;
    rects.push(r);
  }

  const arrivalDir = (endDir + 2) % 4;
  const middle = findPath(s1, startDir, s2, arrivalDir, rects, margin) ?? fallbackPath(s1, startDir, s2);
  return simplify([p1, ...middle, p2]);
}
