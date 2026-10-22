import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeEdge, nearestSide, portPoint } from '../public/js/router.js';

function crossesInterior(a, b, r) {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  return maxX > r.x && minX < r.x + r.w && maxY > r.y && minY < r.y + r.h;
}

function assertOrthogonal(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    assert.ok(a.x === b.x || a.y === b.y, `segment ${i} is diagonal`);
  }
}

test('straight route when nothing is in the way', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = { x: 300, y: 0, w: 100, h: 50 };
  const points = routeEdge({ rect: a, side: 'right' }, { rect: b, side: 'left' }, [a, b]);
  assert.deepEqual(points, [{ x: 100, y: 25 }, { x: 300, y: 25 }]);
});

test('route snakes around a block in the way', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const blocker = { x: 180, y: -40, w: 60, h: 130 };
  const b = { x: 320, y: 0, w: 100, h: 50 };
  const points = routeEdge({ rect: a, side: 'right' }, { rect: b, side: 'left' }, [a, blocker, b]);
  assertOrthogonal(points);
  assert.deepEqual(points[0], portPoint(a, 'right'));
  assert.deepEqual(points.at(-1), portPoint(b, 'left'));
  for (let i = 1; i < points.length; i++) {
    assert.ok(!crossesInterior(points[i - 1], points[i], blocker), `segment ${i} crosses blocker`);
  }
});

test('route never passes through source or target', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = { x: 300, y: 0, w: 100, h: 50 };
  const points = routeEdge({ rect: a, side: 'left' }, { rect: b, side: 'right' }, [a, b]);
  assertOrthogonal(points);
  for (let i = 2; i < points.length - 1; i++) {
    assert.ok(!crossesInterior(points[i - 1], points[i], a));
    assert.ok(!crossesInterior(points[i - 1], points[i], b));
  }
});

test('nearestSide picks the closest port', () => {
  const r = { x: 0, y: 0, w: 100, h: 100 };
  assert.equal(nearestSide(r, { x: 50, y: -10 }), 'top');
  assert.equal(nearestSide(r, { x: 120, y: 50 }), 'right');
});

test('routing 50 blocks stays fast', () => {
  const rects = [];
  for (let i = 0; i < 50; i++) rects.push({ x: (i % 10) * 220, y: Math.floor(i / 10) * 180, w: 160, h: 64 });
  const t0 = performance.now();
  for (let i = 0; i < 49; i++) routeEdge({ rect: rects[i], side: 'right' }, { rect: rects[49 - i], side: 'left' }, rects);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `took ${ms}ms`);
  console.log(`49 routes over 50 blocks: ${ms.toFixed(1)}ms`);
});
