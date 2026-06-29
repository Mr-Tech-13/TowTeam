const headers = { "Content-Type": "application/json" };

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers,
      credentials: "include",
      ...options
    });
  } catch {
    const error = new Error("Network unavailable. The action was not saved to the server yet.");
    error.networkError = true;
    throw error;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  me: () => request("/auth/me"),
  login: (credentials) => request("/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  listUsers: () => request("/users"),
  createUser: (user) => request("/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (id, user) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(user) }),
  updatePassword: (id, password) => request(`/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),
  reportIssue: (issue) => request("/issues", { method: "POST", body: JSON.stringify(issue) }),
  listIssues: () => request("/issues"),
  updateIssue: (id, issue) => request(`/issues/${id}`, { method: "PATCH", body: JSON.stringify(issue) }),
  listAudit: () => request("/audit"),
  listTows: (params = {}) => request(`/tows?${new URLSearchParams(params)}`),
  getTow: (id) => request(`/tows/${id}`),
  createTow: (tow) => request("/tows", { method: "POST", body: JSON.stringify(tow) }),
  createBulk: (tows) => request("/tows/bulk", { method: "POST", body: JSON.stringify({ tows }) }),
  updateTow: (id, tow) => request(`/tows/${id}`, { method: "PUT", body: JSON.stringify(tow) }),
  deleteTow: (id) => request(`/tows/${id}`, { method: "DELETE" }),
  parsePlan: (text) => request("/tows/parse", { method: "POST", body: JSON.stringify({ text }) }),
  logStep: (id, step, payload = {}) => request(`/tows/${id}/steps/${step}`, { method: "POST", body: JSON.stringify(payload) }),
  undoLastStep: (id) => request(`/tows/${id}/steps/undo`, { method: "POST" })
};

export function exportUrl(filters = {}) {
  return `/api/tows/export.csv?${new URLSearchParams(filters)}`;
}

export function exportExcelUrl(filters = {}) {
  return `/api/tows/export.xls?${new URLSearchParams(filters)}`;
}
