const headers = { "Content-Type": "application/json" };

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers,
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listTows: (params = {}) => request(`/tows?${new URLSearchParams(params)}`),
  getTow: (id) => request(`/tows/${id}`),
  createTow: (tow) => request("/tows", { method: "POST", body: JSON.stringify(tow) }),
  createBulk: (tows) => request("/tows/bulk", { method: "POST", body: JSON.stringify({ tows }) }),
  updateTow: (id, tow) => request(`/tows/${id}`, { method: "PUT", body: JSON.stringify(tow) }),
  deleteTow: (id) => request(`/tows/${id}`, { method: "DELETE" }),
  parsePlan: (text) => request("/tows/parse", { method: "POST", body: JSON.stringify({ text }) }),
  logStep: (id, step, payload = {}) => request(`/tows/${id}/steps/${step}`, { method: "POST", body: JSON.stringify(payload) })
};

export function exportUrl(filters = {}) {
  return `/api/tows/export.csv?${new URLSearchParams(filters)}`;
}
