import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TYPES, labelFontSize } from '../public/js/model.js';

const block = (type, w, h) => ({ type, w, h });

test('labels keep their base size at the default block size', () => {
  assert.equal(labelFontSize(block('process', NODE_TYPES.process.w, NODE_TYPES.process.h)), 14);
  assert.equal(labelFontSize(block('decision', NODE_TYPES.decision.w, NODE_TYPES.decision.h)), 13);
});

test('labels scale with the block, limited by its tighter side', () => {
  const { w, h } = NODE_TYPES.process;
  assert.equal(labelFontSize(block('process', w * 2, h * 2)), 28);
  assert.equal(labelFontSize(block('process', w * 3, h * 2)), 28);
});

test('label scaling is clamped', () => {
  const { w, h } = NODE_TYPES.process;
  assert.equal(labelFontSize(block('process', w * 10, h * 10)), 56);
  assert.equal(labelFontSize(block('process', w / 4, h / 4)), 10.5);
});

test('relativeTime gives short edit labels', async () => {
  const { relativeTime } = await import('../public/js/model.js');
  const now = Date.parse('2026-10-22T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(relativeTime(ago(20 * 1000), now), 'just now');
  assert.equal(relativeTime(ago(5 * 60 * 1000), now), '5 min ago');
  assert.equal(relativeTime(ago(3 * 3600 * 1000), now), '3 h ago');
  assert.equal(relativeTime(ago(30 * 3600 * 1000), now), 'yesterday');
  assert.equal(relativeTime(ago(4 * 86400 * 1000), now), '4 days ago');
  assert.equal(relativeTime(undefined, now), '');
});
