import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

let server;
let base;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'workflows-'));
  server = await createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('saves, lists, loads and deletes a workflow', async () => {
  const doc = { name: 'Demo', nodes: [], edges: [] };
  const put = await fetch(`${base}/api/workflows/demo-1`, { method: 'PUT', body: JSON.stringify(doc) });
  assert.equal(put.status, 200);

  const list = await (await fetch(`${base}/api/workflows`)).json();
  assert.deepEqual(list.map((w) => w.id), ['demo-1']);

  const loaded = await (await fetch(`${base}/api/workflows/demo-1`)).json();
  assert.equal(loaded.name, 'Demo');

  const del = await fetch(`${base}/api/workflows/demo-1`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal((await fetch(`${base}/api/workflows/demo-1`)).status, 404);
});

test('rejects invalid ids and bodies', async () => {
  assert.equal((await fetch(`${base}/api/workflows/BAD_ID`)).status, 400);
  const bad = await fetch(`${base}/api/workflows/ok`, { method: 'PUT', body: '{"name":1}' });
  assert.equal(bad.status, 400);
});

test('serves the app and blocks path traversal', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 403);
});

test('serves the web app manifest with its MIME type', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/manifest+json');
});
