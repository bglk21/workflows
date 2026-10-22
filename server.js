import http from 'node:http';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isValidDoc(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (typeof doc.name !== 'string') return false;
  return Array.isArray(doc.nodes) && Array.isArray(doc.edges);
}

async function listWorkflows(dataDir) {
  const files = await readdir(dataDir);
  const items = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const doc = JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
      items.push({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
    } catch {
      // Skip unreadable or corrupt files instead of failing the whole list.
    }
  }
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function handleWorkflow(req, res, dataDir, id) {
  if (!ID_PATTERN.test(id)) return sendJson(res, 400, { error: 'Invalid id' });
  const file = path.join(dataDir, `${id}.json`);

  if (req.method === 'GET') {
    try {
      return send(res, 200, await readFile(file, 'utf8'));
    } catch {
      return sendJson(res, 404, { error: 'Not found' });
    }
  }

  if (req.method === 'PUT') {
    let doc;
    try {
      doc = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    if (!isValidDoc(doc)) return sendJson(res, 400, { error: 'Invalid workflow' });

    const saved = { ...doc, id, updatedAt: new Date().toISOString() };
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(saved, null, 2));
    await rename(tmp, file);
    return sendJson(res, 200, { id, updatedAt: saved.updatedAt });
  }

  if (req.method === 'DELETE') {
    try {
      await unlink(file);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    res.writeHead(204);
    return res.end();
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}

async function handleApi(req, res, dataDir, pathname) {
  if (pathname === '/api/workflows') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, await listWorkflows(dataDir));
  }

  const match = pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (!match) return sendJson(res, 404, { error: 'Not found' });
  return handleWorkflow(req, res, dataDir, match[1]);
}

async function serveStatic(res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return send(res, 400, 'Bad request', 'text/plain');
  }

  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');

  try {
    const data = await readFile(file);
    const type = MIME_TYPES[path.extname(file)] || 'application/octet-stream';
    return send(res, 200, data, type);
  } catch {
    return send(res, 404, 'Not found', 'text/plain');
  }
}

export async function createServer({ dataDir }) {
  await mkdir(dataDir, { recursive: true });

  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) return await handleApi(req, res, dataDir, pathname);
      if (req.method !== 'GET') return send(res, 405, 'Method not allowed', 'text/plain');
      return await serveStatic(res, pathname);
    } catch (err) {
      console.error(err);
      if (res.headersSent) return res.end();
      return sendJson(res, 500, { error: 'Internal server error' });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const dataDir = process.env.WORKFLOWS_DATA_DIR || path.join(ROOT, 'data');
  const server = await createServer({ dataDir });
  server.listen(port, host, () => {
    console.log(`Workflows running at http://${host}:${port}`);
    console.log(`Saving workflows to ${dataDir}`);
  });
}
