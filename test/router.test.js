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

test('blocks of different heights facing each other get a straight line', () => {
  const start = { x: 40, y: 110, w: 140, h: 52 }; // centre y 136
  const step = { x: 300, y: 110, w: 160, h: 64 }; // centre y 142
  const points = routeEdge({ rect: start, side: 'right', slack: 0 }, { rect: step, side: 'left', slack: 20 }, [start, step]);
  assert.deepEqual(points, [{ x: 180, y: 136 }, { x: 300, y: 136 }]);
});

test('the end with no slack keeps its midpoint, the other slides', () => {
  const step = { x: 0, y: 110, w: 160, h: 64 }; // centre y 142
  const decision = { x: 300, y: 100, w: 160, h: 100 }; // centre y 150, tip must stay
  const points = routeEdge({ rect: step, side: 'right', slack: 20 }, { rect: decision, side: 'left', slack: 0 }, [step, decision]);
  assert.deepEqual(points, [{ x: 160, y: 150 }, { x: 300, y: 150 }]);
});

test('no straight line when the offset is larger than the slack', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const b = { x: 300, y: 60, w: 100, h: 50 };
  const points = routeEdge({ rect: a, side: 'right', slack: 5 }, { rect: b, side: 'left', slack: 5 }, [a, b]);
  assert.ok(points.length > 2);
});

test('no straight line through a block in between', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const blocker = { x: 180, y: 0, w: 40, h: 50 };
  const b = { x: 300, y: 4, w: 100, h: 50 };
  const points = routeEdge({ rect: a, side: 'right', slack: 13 }, { rect: b, side: 'left', slack: 13 }, [a, blocker, b]);
  for (let i = 1; i < points.length; i++) {
    assert.ok(!crossesInterior(points[i - 1], points[i], blocker), `segment ${i} crosses blocker`);
  }
});
