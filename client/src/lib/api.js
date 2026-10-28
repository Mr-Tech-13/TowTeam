import { paperArchiveFilename } from '../../../shared/paperExport.js';

const headers = { "Content-Type": "application/json" };

function downloadFilename(response, fallback) {
  return response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallback;
}

async function downloadResponse(response, fallbackFilename, onProgress) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  const total = Number(response.headers.get('content-length')) || null;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: total || blob.size, percent: 100 });
    return { blob, filename: downloadFilename(response, fallbackFilename) };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  onProgress?.({ loaded, total, percent: total ? 0 : null });
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total, percent: total ? Math.min(100, Math.round(loaded / total * 100)) : null });
  }
  onProgress?.({ loaded, total: total || loaded, percent: 100 });
  return {
    blob: new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' }),
    filename: downloadFilename(response, fallbackFilename)
  };
}

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
  paperBackupStatus: () => request('/settings/paper-backups'),
  clearPaperBackupQueue: () => request('/settings/paper-backups/clear', { method: 'POST', body: '{}' }),
  retryPaperBackups: (replace = false) => request('/settings/paper-backups/retry', { method: 'POST', body: JSON.stringify({ replace }) }),
  getSettings: () => request('/settings'),
  uploadFavicon: async (file) => request('/settings/favicon', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: await file.arrayBuffer() }),
  resetFavicon: () => request('/settings/favicon', { method: 'DELETE' }),
  updateSettings: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  listPendingAnnouncements: () => request('/announcements/pending'),
  listAnnouncements: () => request('/announcements'),
  createAnnouncement: (announcement) => request('/announcements', { method: 'POST', body: JSON.stringify(announcement) }),
  deleteAnnouncement: (id) => request(`/announcements/${id}`, { method: 'DELETE' }),
  acknowledgeAnnouncement: (id) => request(`/announcements/${id}/acknowledge`, { method: 'POST', body: '{}' }),
  listAirlines: () => request('/airlines'),
  createAirline: (airline) => request('/airlines', { method: 'POST', body: JSON.stringify(airline) }),
  updateAirline: (code, airline) => request(`/airlines/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(airline) }),
  deleteAirline: (code) => request(`/airlines/${encodeURIComponent(code)}`, { method: 'DELETE' }),
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
  listDeletedTows: () => request("/tows?deleted=true"),
  restoreTow: (id) => request(`/tows/${id}/restore`, { method: "POST" }),
  permanentlyDeleteTow: (id) => request(`/tows/${id}/permanent`, { method: "DELETE" }),
  restoreDatabase: async (file) => {
    const buffer = await file.arrayBuffer();
    return request("/maintenance/restore.sqlite", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buffer
    });
  },
  exportPortableData: async (categories, onProgress) => {
    const response = await fetch(`/api/maintenance/export.json?${new URLSearchParams({ categories: categories.join(',') })}`, { credentials: 'include' });
    return downloadResponse(response, 'towteam-export.json', onProgress);
  },
  importPortableData: async (file, categories, mode) => {
    const buffer = await file.arrayBuffer();
    return request(`/maintenance/import.json?${new URLSearchParams({ categories: categories.join(','), mode })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    });
  },
  listTows: (params = {}) => request(`/tows?${new URLSearchParams(params)}`),
  listTowsPage: (params = {}, page = 1, pageSize = 10) => request(`/tows?${new URLSearchParams({ ...params, paginated: "true", page, pageSize })}`),
  getTow: (id) => request(`/tows/${id}`),
  downloadTowPapers: async (ids, scope = 'history', onProgress) => {
    const response = await fetch('/api/tows/paper-export', { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ ids, scope }) });
    const fallback = response.headers.get('content-type')?.startsWith('application/pdf') ? 'tow-paper.pdf' : paperArchiveFilename(scope);
    return downloadResponse(response, fallback, onProgress);
  },
  downloadTowData: async (format, params = {}, onProgress) => {
    if (!['csv', 'xls'].includes(format)) throw new Error('Invalid tow export format.');
    const response = await fetch(`/api/tows/export.${format}?${new URLSearchParams(params)}`, { credentials: 'include' });
    return downloadResponse(response, format === 'csv' ? 'tow-history.csv' : 'tow-history.xls', onProgress);
  },
  createTow: (tow) => request("/tows", { method: "POST", body: JSON.stringify(tow) }),
  createBulk: (tows) => request("/tows/bulk", { method: "POST", body: JSON.stringify({ tows }) }),
  bulkUpdateAircraftType: (filters, aircraftType) => request("/tows/bulk/aircraft-type", { method: "PATCH", body: JSON.stringify({ filters, aircraftType }) }),
  updateTow: (id, tow) => request(`/tows/${id}`, { method: "PUT", body: JSON.stringify(tow) }),
  deleteTow: (id, reason) => request(`/tows/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
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

export function towChecklistUrl(id) {
  return `/api/tows/${id}/tow-checklist.pdf`;
}

export function towChecklistPreviewUrl(id) {
  return `/api/tows/${id}/tow-checklist.pdf?preview=true&v=${Date.now()}`;
}

export function backupDatabaseUrl() {
  return "/api/maintenance/backup.sqlite";
}
