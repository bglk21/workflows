import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const publicFile = (path) => new URL(`../public/${path}`, import.meta.url);

test('manifest is valid and its icons exist', async () => {
  const manifest = JSON.parse(await readFile(publicFile('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'needs 192 and 512 icons to be installable');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) await access(publicFile(icon.src));
});

test('every file the service worker pre-caches exists', async () => {
  const sw = await readFile(publicFile('sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const path of shell) await access(publicFile(path === './' ? 'index.html' : path));
});

test('every app module is pre-cached for offline use', async () => {
  const sw = await readFile(publicFile('sw.js'), 'utf8');
  const html = await readFile(publicFile('index.html'), 'utf8');
  const app = await readFile(publicFile('js/app.js'), 'utf8');
  const imports = [...app.matchAll(/from '\.\/([\w-]+\.js)'/g)].map((m) => `js/${m[1]}`);
  for (const path of [...imports, 'js/app.js', 'css/styles.css']) assert.ok(sw.includes(`'${path}'`), `${path} missing from sw.js`);
  assert.ok(html.includes('manifest.webmanifest'));
});
