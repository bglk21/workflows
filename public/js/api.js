// Storage for workflows. Uses the Node server's API when it is available and
// falls back to browser localStorage otherwise (e.g. on GitHub Pages).

const LOCAL_KEY = 'workflows:docs';

async function request(method, url, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${method} ${url} failed with ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

const serverBackend = {
  mode: 'server',
  list: () => request('GET', '/api/workflows'),
  load: (id) => request('GET', `/api/workflows/${encodeURIComponent(id)}`),
  save: (doc) => request('PUT', `/api/workflows/${encodeURIComponent(doc.id)}`, doc),
  remove: (id) => request('DELETE', `/api/workflows/${encodeURIComponent(id)}`),
  saveOnUnload(doc) {
    // keepalive lets the request finish while the page unloads.
    fetch(`/api/workflows/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
      keepalive: true,
    });
  },
};

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLocal(docs) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(docs));
}

function saveLocal(doc) {
  const docs = readLocal();
  const updatedAt = new Date().toISOString();
  docs[doc.id] = { ...doc, updatedAt };
  writeLocal(docs);
  return { id: doc.id, updatedAt };
}

const localBackend = {
  mode: 'local',
  async list() {
    return Object.values(readLocal())
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  async load(id) {
    const doc = readLocal()[id];
    if (!doc) throw new Error(`Workflow ${id} not found`);
    return doc;
  },
  save: async (doc) => saveLocal(doc),
  async remove(id) {
    const docs = readLocal();
    delete docs[id];
    writeLocal(docs);
    return null;
  },
  saveOnUnload: saveLocal,
};

let backend = null;

async function detectBackend() {
  if (backend) return backend;
  try {
    const res = await fetch('/api/workflows');
    const isJson = (res.headers.get('Content-Type') || '').includes('application/json');
    backend = res.ok && isJson ? serverBackend : localBackend;
  } catch {
    backend = localBackend;
  }
  return backend;
}

/** 'server' or 'local'; only meaningful after the first call below. */
export const storageMode = () => backend?.mode;

export const listWorkflows = async () => (await detectBackend()).list();
export const loadWorkflow = async (id) => (await detectBackend()).load(id);
export const saveWorkflow = async (doc) => (await detectBackend()).save(doc);
export const deleteWorkflow = async (id) => (await detectBackend()).remove(id);
export const saveOnUnload = (doc) => backend?.saveOnUnload(doc);
