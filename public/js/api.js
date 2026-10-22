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

export const listWorkflows = () => request('GET', '/api/workflows');
export const loadWorkflow = (id) => request('GET', `/api/workflows/${encodeURIComponent(id)}`);
export const saveWorkflow = (doc) => request('PUT', `/api/workflows/${encodeURIComponent(doc.id)}`, doc);
export const deleteWorkflow = (id) => request('DELETE', `/api/workflows/${encodeURIComponent(id)}`);
