import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bug, ChevronLeft, ChevronRight, Clipboard, Download, Eye, History, LayoutDashboard, LogOut, Plus, RefreshCcw, RotateCcw, Save, Search, Trash2, Upload, Users } from "lucide-react";
import { api, backupDatabaseUrl, towChecklistPreviewUrl, towChecklistUrl } from "./lib/api.js";
import { completedSummary } from "./lib/summary.js";
import { applyWorkflowStep, pendingWorkflowStepCount, queueWorkflowStep, syncPendingWorkflowSteps } from "./lib/pendingWorkflowSteps.js";
import { TowCard } from "./components/TowCard.jsx";
import { AirlineSettings } from "./components/AirlineSettings.jsx";
import { AppSettings } from "./components/AppSettings.jsx";
import { PaperBackupSettings } from "./components/PaperBackupSettings.jsx";
import { TowForm } from "./components/TowForm.jsx";
import { Workflow } from "./components/Workflow.jsx";
import "./styles/main.css";
import { version } from "../../package-lock.json";

const emptyTow = {
  airline: "",
  inboundFlightNumber: "",
  inboundStation: "",
  aircraftType: "",
  eta: "",
  gate: "",
  fromLocation: "",
  toLocation: "",
  towSpot: "",
  tailNumber: "",
  driver: "",
  leftWingWalker: "",
  rightWingWalker: "",
  otherTeamMembers: "",
  notes: "",
  needsReview: false,
  parserWarnings: []
};

function deriveLocations(tow) {
  const gate = tow.gate || "";
  const towSpot = tow.towSpot || "";
  const hasExistingDirection = Boolean(tow.fromLocation || tow.toLocation);
  if (!gate || !towSpot || hasExistingDirection) return tow;
  return {
    ...tow,
    fromLocation: gate,
    toLocation: towSpot
  };
}

function prepareTow(tow) {
  return deriveLocations(tow);
}

function useDebouncedSearch(value) {
  const [query, setQuery] = useState(value.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [value]);
  return query;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timestampPromptValue(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseTimestampInput(value, existingValue) {
  const trimmed = String(value || "").trim();
  const compactTime = trimmed.match(/^(\d{1,2}):?(\d{2})$/);
  if (compactTime) {
    const hours = Number(compactTime[1]);
    const minutes = Number(compactTime[2]);
    if (hours > 23 || minutes > 59) return null;
    const base = existingValue ? new Date(existingValue) : new Date();
    if (Number.isNaN(base.getTime())) return null;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
  }

  const localDateTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (localDateTime) {
    const [, year, month, day, hours, minutes] = localDateTime.map(Number);
    if (hours > 23 || minutes > 59 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function useTows(filters, enabled = true, pagination = null) {
  const requestId = useRef(0);
  const [tows, setTows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

  const load = async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      if (pagination) {
        const result = await api.listTowsPage(filters, pagination.page, pagination.pageSize);
        if (id !== requestId.current) return;
        setTows(result.tows);
        setPageInfo({ page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
      } else {
        const result = await api.listTows(filters);
        if (id !== requestId.current) return;
        setTows(result);
        setPageInfo({ page: 1, pageSize: result.length, total: result.length, totalPages: 1 });
      }
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) load();
    return () => { requestId.current += 1; };
  }, [enabled, JSON.stringify(filters), JSON.stringify(pagination)]);

  return { tows, error, loading, load, pageInfo };
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login({ username, password });
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-shell">
      <form className="panel login-panel" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-dot" />
          <h1>TowTeam</h1>
        </div>
        <label>
          <span>Username</span>
          <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn green wide" type="submit">Log In</button>
      </form>
    </div>
  );
}

function parseAuditDetails(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function AuditDetails({ details }) {
  const parsed = parseAuditDetails(details);
  if (!Object.keys(parsed).length) return null;
  return (
    <details className="audit-details">
      <summary>Details</summary>
      {parsed.before || parsed.after ? (
        <div className="audit-diff">
          {parsed.before && <pre>{JSON.stringify(parsed.before, null, 2)}</pre>}
          {parsed.after && <pre>{JSON.stringify(parsed.after, null, 2)}</pre>}
        </div>
      ) : (
        <pre>{JSON.stringify(parsed, null, 2)}</pre>
      )}
    </details>
  );
}

const portableDataOptions = [
  ["tows", "Tows and paper drafts"],
  ["airlines", "Airlines and aircraft types"],
  ["settings", "Application settings"],
  ["users", "User accounts"],
  ["issues", "Issue reports"],
  ["audit", "Audit log"]
];

function saveDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function AdminUsersPage({ currentUser, onBack, airlines, onAirlinesChange, settings, onSettingsChange, onAnnouncementCreated }) {
  const [adminView, setAdminView] = useState("users");
  const [users, setUsers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [deletedTows, setDeletedTows] = useState([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [passwords, setPasswords] = useState({});
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [maintenanceStatus, setMaintenanceStatus] = useState("");
  const [portableCategories, setPortableCategories] = useState(["tows"]);
  const [portableImportFile, setPortableImportFile] = useState(null);
  const [portableImportMode, setPortableImportMode] = useState("merge");
  const [portableStatus, setPortableStatus] = useState("");
  const [portableBusy, setPortableBusy] = useState(false);
  const [portableProgress, setPortableProgress] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadUsers() {
    setError("");
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUsers();
    if (currentUser.canManageSettings) {
      loadIssues();
      loadAudit();
    }
    loadDeletedTows();
  }, [currentUser.canManageSettings]);


  async function loadIssues() {
    try {
      setIssues(await api.listIssues());
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAudit() {
    try {
      setAuditLogs(await api.listAudit());
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDeletedTows() {
    try {
      setDeletedTows(await api.listDeletedTows());
    } catch (err) {
      setError(err.message);
    }
  }

  async function createUser(event) {
    event.preventDefault();
    setError("");
    try {
      await api.createUser(newUser);
      setNewUser({ username: "", password: "", role: "user" });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeRole(user, role) {
    setError("");
    try {
      await api.updateUser(user.id, { role });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeAutofill(user, autofill) {
    setError('');
    try { await api.updateUser(user.id, { autofill }); await loadUsers(); }
    catch (err) { setError(err.message); }
  }

  async function changePassword(user) {
    setError("");
    try {
      await api.updatePassword(user.id, passwords[user.id]);
      setPasswords({ ...passwords, [user.id]: "" });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    setError("");
    try {
      await api.deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function closeIssue(issue) {
    setError("");
    try {
      await api.updateIssue(issue.id, { status: issue.status === "closed" ? "open" : "closed" });
      await loadIssues();
      await loadAudit();
    } catch (err) {
      setError(err.message);
    }
  }

  async function restoreDeletedTow(tow) {
    setError("");
    try {
      await api.restoreTow(tow.id);
      await loadDeletedTows();
      await loadAudit();
    } catch (err) {
      setError(err.message);
    }
  }

  async function permanentlyDeleteTow(tow) {
    if (!window.confirm(`Permanently delete tow #${tow.id}?`)) return;
    if (!window.confirm("This cannot be undone. Permanently delete this tow record?")) return;
    setError("");
    try {
      await api.permanentlyDeleteTow(tow.id);
      await loadDeletedTows();
      await loadAudit();
    } catch (err) {
      setError(err.message);
    }
  }

  async function restoreDatabase(event) {
    event.preventDefault();
    setMaintenanceStatus("");
    setError("");
    if (!restoreFile) {
      setMaintenanceStatus("Choose a SQLite backup file first.");
      return;
    }
    if (restoreConfirm !== "RESTORE") {
      setMaintenanceStatus("Type RESTORE to confirm.");
      return;
    }
    if (!window.confirm("Restore this database backup? TowTeam will restart after the upload.")) return;
    try {
      const result = await api.restoreDatabase(restoreFile);
      setMaintenanceStatus(`Restore accepted. Pre-restore backup: ${result.preRestoreBackup}. TowTeam will restart.`);
      setRestoreFile(null);
      setRestoreConfirm("");
    } catch (err) {
      setMaintenanceStatus(err.message);
    }
  }

  function togglePortableCategory(category) {
    setPortableCategories((current) => current.includes(category)
      ? current.filter((value) => value !== category)
      : [...current, category]);
  }

  async function exportPortableData() {
    setPortableStatus("");
    if (!portableCategories.length) { setPortableStatus("Select at least one category."); return; }
    setPortableBusy(true);
    setPortableProgress(null);
    try {
      const result = await api.exportPortableData(portableCategories, ({ percent }) => setPortableProgress(percent));
      saveDownload(result.blob, result.filename);
      setPortableProgress(100);
      setPortableStatus("Selected data exported.");
    } catch (err) {
      setPortableStatus(err.message);
      setPortableProgress(null);
    } finally {
      setPortableBusy(false);
    }
  }

  async function importPortableData(event) {
    event.preventDefault();
    setPortableStatus("");
    if (!portableImportFile) { setPortableStatus("Choose a TowTeam JSON export file."); return; }
    if (!portableCategories.length) { setPortableStatus("Select at least one category."); return; }
    if (portableImportMode === "replace" && !window.confirm(`Replace the selected categories: ${portableCategories.join(", ")}? Unselected categories will remain unchanged.`)) return;
    setPortableBusy(true);
    try {
      const result = await api.importPortableData(portableImportFile, portableCategories, portableImportMode);
      setPortableStatus(`Import complete. Pre-import backup: ${result.preImportBackup}.`);
      setPortableImportFile(null);
      await Promise.all([loadUsers(), loadIssues(), loadAudit(), loadDeletedTows()]);
      const [nextAirlines, nextSettings] = await Promise.all([api.listAirlines(), api.getSettings()]);
      onAirlinesChange(nextAirlines);
      onSettingsChange(nextSettings);
    } catch (err) {
      setPortableStatus(err.message);
    } finally {
      setPortableBusy(false);
    }
  }

  async function checkForUpdates() {
    setUpdateBusy(true);
    setUpdateMessage("Checking GitHub for updates...");
    try {
      const status = await api.checkForUpdates();
      setUpdateStatus(status);
      setUpdateMessage(status.message);
    } catch (err) {
      setUpdateMessage(err.message);
    } finally {
      setUpdateBusy(false);
    }
  }

  async function waitForRestart() {
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`/api/health?update=${Date.now()}`, { cache: "no-store" });
        if (response.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // The server is expected to be unavailable while Compose restarts it.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    setUpdateBusy(false);
    setUpdateMessage("TowTeam has not returned yet. Check the container logs, then refresh this page.");
  }

  async function installUpdate() {
    if (!window.confirm("Install the available TowTeam update now? The service will restart and may be unavailable for a few minutes.")) return;
    setUpdateBusy(true);
    setUpdateMessage("Installing update. Keep this page open while TowTeam restarts...");
    try {
      const result = await api.installUpdate();
      if (!result.restartRequired) {
        setUpdateStatus(result.status || null);
        setUpdateMessage(result.status?.message || "TowTeam is already up to date.");
        setUpdateBusy(false);
        return;
      }
      setUpdateMessage(`Update installed. Backup ${result.preUpdateBackup} created. Waiting for TowTeam to restart...`);
      void waitForRestart();
    } catch (err) {
      setUpdateMessage(err.message);
      setUpdateBusy(false);
    }
  }

  return (
    <main>
      <section className="page-panel">
        <div className="section-head">
          <div>
            <h2>Administration</h2>
          </div>
          <button className="btn ghost" onClick={onBack}><ArrowLeft size={18} /> Menu</button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="admin-subtabs">
          {["users", "airlines", ...(currentUser.canManageSettings ? ["settings", "issues", "audit"] : []), "trash", ...(currentUser.canManageAutofill ? ["backup"] : [])].map((view) => (
            <button className={adminView === view ? "btn green" : "btn ghost"} key={view} onClick={() => setAdminView(view)} type="button">
              {view}
            </button>
          ))}
        </div>
        {adminView === "airlines" && <AirlineSettings airlines={airlines} onChange={onAirlinesChange} />}
        {adminView === "settings" && <AppSettings settings={settings} onChange={onSettingsChange} onAnnouncementCreated={onAnnouncementCreated} />}
        {adminView === "users" && (
          <>
            <form className="user-create" onSubmit={createUser}>
              <input placeholder="Username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
              <input placeholder="Password" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
              <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                {currentUser.canManageAutofill && <option value="super_admin">Super Admin</option>}
              </select>
              <button className="btn green" type="submit">Create User</button>
            </form>
            <div className="user-list">
              {users.map((user) => (
                <article className="user-row" key={user.id}>
                  <div>
                    <strong>{user.username}</strong>
                    <span>{user.accountType === "local_admin" ? "Local Administrator" : user.accountType === "super_admin" ? "Super Admin" : user.role === "admin" ? "Admin" : "User"}{user.id === currentUser.id ? " - you" : ""}</span>
                    {currentUser.canManageAutofill && <label className="check-row"><input type="checkbox" aria-label={`${user.username} Autofill`} checked={Boolean(user.autofill)} onChange={(event) => void changeAutofill(user, event.target.checked)} />Autofill</label>}
                  </div>
                  <select disabled={user.isLocalAdministrator || (user.isSuperAdministrator && !currentUser.canManageAutofill)} value={user.accountType} onChange={(event) => changeRole(user, event.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    {(currentUser.canManageAutofill || user.isSuperAdministrator) && <option value="super_admin">Super Admin</option>}
                    {user.isLocalAdministrator && <option value="local_admin">Local Administrator</option>}
                  </select>
                  <input
                    placeholder="New password"
                    disabled={(user.isLocalAdministrator && !currentUser.canManageAutofill) || (user.isSuperAdministrator && user.id !== currentUser.id && !currentUser.canManageAutofill)}
                    type="password"
                    value={passwords[user.id] || ""}
                    onChange={(event) => setPasswords({ ...passwords, [user.id]: event.target.value })}
                  />
                  <button className="btn blue" disabled={(user.isLocalAdministrator && !currentUser.canManageAutofill) || (user.isSuperAdministrator && user.id !== currentUser.id && !currentUser.canManageAutofill)} onClick={() => changePassword(user)}>Change Password</button>
                  <button className="btn red" disabled={user.id === currentUser.id || user.isLocalAdministrator || (user.isSuperAdministrator && !currentUser.canManageAutofill)} onClick={() => removeUser(user)}>Delete</button>
                </article>
              ))}
            </div>
          </>
        )}
        {adminView === "issues" && (
          <div className="admin-list">
            {issues.map((issue) => (
              <article className="admin-row" key={issue.id}>
                <div>
                  <strong>#{issue.id} {issue.status}</strong>
                  <span>{issue.username || "unknown"} - {issue.createdAt}</span>
                  <p>{issue.message}</p>
                </div>
                <button className={issue.status === "closed" ? "btn ghost" : "btn green"} onClick={() => closeIssue(issue)}>
                  {issue.status === "closed" ? "Reopen" : "Close"}
                </button>
              </article>
            ))}
          </div>
        )}
        {adminView === "audit" && (
          <div className="admin-list">
            {auditLogs.map((log) => (
              <article className="admin-row" key={log.id}>
                <div>
                  <strong>{log.action}</strong>
                  <span>{log.username || "system"} - {log.createdAt}</span>
                  <p>{log.entityType} {log.entityId}</p>
                  <AuditDetails details={log.details} />
                </div>
              </article>
            ))}
          </div>
        )}
        {adminView === "trash" && (
          <div className="admin-list">
            {deletedTows.length === 0 && <p className="muted">Trash is empty.</p>}
            {deletedTows.map((tow) => (
              <article className="admin-row" key={tow.id}>
                <div>
                  <strong>#{tow.id} {tow.tailNumber || `${tow.airline}${tow.inboundFlightNumber}`}</strong>
                  <span>Deleted {tow.deletedAt} by {tow.deletedBy || "unknown"}</span>
                  <p>{tow.gate || "Unknown"} to {tow.towSpot || "Unknown"}{tow.deleteReason ? ` - ${tow.deleteReason}` : ""}</p>
                </div>
                <button className="btn green" onClick={() => restoreDeletedTow(tow)}>Restore</button>
                <button className="btn red" onClick={() => permanentlyDeleteTow(tow)}>Delete Forever</button>
              </article>
            ))}
          </div>
        )}
        {adminView === "backup" && currentUser.canManageAutofill && (
          <div className="admin-list">
            <article className="admin-row">
              <div>
                <strong>TowTeam Updates</strong>
                <span>Current version {version}. Checks the configured Git upstream and installs fast-forward updates only.</span>
                {updateStatus?.enabled && (
                  <p className="muted">
                    {updateStatus.branch} from {updateStatus.upstream}
                    {updateStatus.remoteVersion ? ` · Available version ${updateStatus.remoteVersion}` : ""}
                    {updateStatus.latestCommit ? ` · ${updateStatus.latestCommit}` : ""}
                  </p>
                )}
                {updateMessage && <p className={updateStatus?.dirty || updateStatus?.ahead > 0 ? "warning-text" : "muted"}>{updateMessage}</p>}
              </div>
              <div className="portable-actions">
                <button className="btn blue" disabled={updateBusy} onClick={() => void checkForUpdates()} type="button">
                  <RefreshCcw size={18} /> Check for Updates
                </button>
                <button className="btn green" disabled={updateBusy || !updateStatus?.canUpdate} onClick={() => void installUpdate()} type="button">
                  <Download size={18} /> Update Now
                </button>
              </div>
            </article>
            <PaperBackupSettings />
            <article className="admin-row portable-transfer">
              <div>
                <strong>Selective Data Transfer</strong>
                <span>Export or import only the selected categories. Login sessions and generated PDF files are never included.</span>
                <fieldset className="portable-categories">
                  <legend>Data categories</legend>
                  {portableDataOptions.map(([value, label]) => (
                    <label className="check-row" key={value}>
                      <input checked={portableCategories.includes(value)} onChange={() => togglePortableCategory(value)} type="checkbox" />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {portableCategories.includes("users") && <p className="warning-text">User exports contain password hashes. Store the export like a database backup.</p>}
                <div className="portable-actions">
                  <button className="btn blue" disabled={portableBusy || !portableCategories.length} onClick={() => void exportPortableData()} type="button">
                    <Download size={18} /> Export Selected
                  </button>
                  {portableProgress !== null && <progress aria-label="Export progress" max="100" value={portableProgress} />}
                </div>
              </div>
            </article>
            <form className="admin-row portable-transfer" onSubmit={importPortableData}>
              <div>
                <strong>Import Selected Data</strong>
                <span>The file must contain every category selected above.</span>
                <input accept=".json,application/json" onChange={(event) => setPortableImportFile(event.target.files?.[0] || null)} type="file" />
                <select value={portableImportMode} onChange={(event) => setPortableImportMode(event.target.value)}>
                  <option value="add">Add missing records; keep matching records unchanged</option>
                  <option value="merge">Add missing records and overwrite matching records</option>
                  <option value="replace">Replace selected categories; keep unselected categories</option>
                </select>
                {portableStatus && <p className="muted">{portableStatus}</p>}
              </div>
              <button className={portableImportMode === "replace" ? "btn red" : "btn green"} disabled={portableBusy || !portableImportFile || !portableCategories.length} type="submit">
                <Upload size={18} /> Import
              </button>
            </form>
            <article className="admin-row">
              <div>
                <strong>Download SQLite Backup</strong>
                <span>Creates a point-in-time SQLite backup from the running database.</span>
              </div>
              <a className="btn blue" href={backupDatabaseUrl()}><Download size={18} /> Backup</a>
            </article>
            <form className="admin-row" onSubmit={restoreDatabase}>
              <div>
                <strong>Restore SQLite Backup</strong>
                <span>Creates a pre-restore backup, swaps in the uploaded database, and restarts TowTeam.</span>
                <input accept=".sqlite,.db,application/octet-stream" onChange={(event) => setRestoreFile(event.target.files?.[0] || null)} type="file" />
                <input
                  placeholder="Type RESTORE"
                  value={restoreConfirm}
                  onChange={(event) => setRestoreConfirm(event.target.value)}
                />
                {maintenanceStatus && <p className="muted">{maintenanceStatus}</p>}
              </div>
              <button className="btn red" type="submit">Restore</button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [airlines, setAirlines] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [importError, setImportError] = useState('');
  const [airlineError, setAirlineError] = useState('');
  const [manualError, setManualError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [adminPanel, setAdminPanel] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [towOriginTab, setTowOriginTab] = useState("dashboard");
  const [activeTow, setActiveTow] = useState(null);
  const [manualTow, setManualTow] = useState(emptyTow);
  const [pasteText, setPasteText] = useState("");
  const [parseAttempted, setParseAttempted] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [paperDownloadBusy, setPaperDownloadBusy] = useState(false);
  const [paperDownloadError, setPaperDownloadError] = useState('');
  const [exportProgress, setExportProgress] = useState(null);
  const [historyPaging, setHistoryPaging] = useState({ search: '', pageSize: 10, page: 1 });
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [activeSearch, setActiveSearch] = useState("");
  const [towPage, setTowPage] = useState("confirm");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [issueStatus, setIssueStatus] = useState("");
  const [importMeta, setImportMeta] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [pendingStepCount, setPendingStepCount] = useState(pendingWorkflowStepCount());
  const [workflowSyncStatus, setWorkflowSyncStatus] = useState("");
  const [pendingAnnouncements, setPendingAnnouncements] = useState([]);
  const [announcementError, setAnnouncementError] = useState("");
  const activeSearchQuery = useDebouncedSearch(activeSearch);
  const historySearchQuery = useDebouncedSearch(historySearch);
  const historyPage = historyPaging.search === historySearchQuery && historyPaging.pageSize === historyPageSize ? historyPaging.page : 1;
  const setHistoryPage = (page) => setHistoryPaging({ search: historySearchQuery, pageSize: historyPageSize, page });
  const historyQuery = { search: historySearchQuery, status: "completed" };
  const filters = tab === "history" ? historyQuery : { status: "active", search: activeSearchQuery };
  const historyPagination = tab === "history" ? { page: historyPage, pageSize: historyPageSize } : null;
  const { tows, error, loading, load, pageInfo } = useTows(filters, Boolean(user) && !adminPanel, historyPagination);
  const activeTows = useMemo(() => tows.filter((tow) => tow.status !== "completed"), [tows]);
  const visibleActiveTows = activeTows;
  const paperDownloadDisabled = loading || paperDownloadBusy || !tows.length || tows.some(tow => tow.status !== 'completed') || historySearch.trim() !== historySearchQuery;
  function saveBrowserDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function showExportProgress(label, progress) {
    setExportProgress({ label, percent: progress?.percent ?? null });
  }
  async function downloadVisiblePapers() {
    if (paperDownloadDisabled) return;
    setPaperDownloadBusy(true); setPaperDownloadError(''); setExportProgress({ label: 'Preparing tow papers...', percent: null });
    try {
      const { blob, filename } = await api.downloadTowPapers(tows.map(tow => tow.id), 'history', progress => showExportProgress('Downloading tow papers...', progress));
      saveBrowserDownload(blob, filename);
      setExportProgress({ label: 'Tow paper download ready.', percent: 100 });
    } catch (err) { setPaperDownloadError(err.message); setExportProgress(null); }
    finally { setPaperDownloadBusy(false); }
  }
  async function downloadHistoryData(format) {
    if (loading || paperDownloadBusy) return;
    const label = format === 'csv' ? 'CSV' : 'Excel';
    setPaperDownloadBusy(true); setPaperDownloadError(''); setExportProgress({ label: `Preparing ${label} export...`, percent: null });
    try {
      const { blob, filename } = await api.downloadTowData(format, historyQuery, progress => showExportProgress(`Downloading ${label} export...`, progress));
      saveBrowserDownload(blob, filename);
      setExportProgress({ label: `${label} download ready.`, percent: 100 });
    } catch (err) { setPaperDownloadError(err.message); setExportProgress(null); }
    finally { setPaperDownloadBusy(false); }
  }
  useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon && settings?.faviconUrl) icon.href = settings.faviconUrl;
  }, [settings?.faviconUrl]);
  useEffect(() => {
    setHistoryPaging({ search: historySearchQuery, pageSize: historyPageSize, page: 1 });
  }, [historySearchQuery, historyPageSize]);

  useEffect(() => {
    if (!user) return;
    setAirlineError('');
    api.listAirlines().then(setAirlines).catch((err) => setAirlineError(err.message));
  }, [user, adminPanel]);

  useEffect(() => {
    if (!user) { setSettings(null); return undefined; }
    let cancelled = false;
    async function refreshSettings() {
      try {
        const next = await api.getSettings();
        if (!cancelled) { setSettings(next); setSettingsError(''); }
      } catch (err) { if (!cancelled) setSettingsError(err.message); }
    }
    void refreshSettings();
    window.addEventListener('focus', refreshSettings);
    const interval = window.setInterval(refreshSettings, 15000);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', refreshSettings); };
  }, [user, adminPanel]);

  async function loadPendingAnnouncements() {
    if (!user) return;
    try {
      setPendingAnnouncements(await api.listPendingAnnouncements());
      setAnnouncementError('');
    } catch (err) {
      setAnnouncementError(err.message);
    }
  }

  useEffect(() => {
    if (!user) { setPendingAnnouncements([]); return undefined; }
    void loadPendingAnnouncements();
    const refresh = () => void loadPendingAnnouncements();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(interval); };
  }, [user]);

  async function acknowledgeCurrentAnnouncement() {
    const current = pendingAnnouncements[0];
    if (!current) return;
    try {
      await api.acknowledgeAnnouncement(current.id);
      setPendingAnnouncements((items) => items.filter((item) => item.id !== current.id));
      setAnnouncementError('');
    } catch (err) {
      setAnnouncementError(err.message);
    }
  }

  useEffect(() => {
    if (settings?.bulkImportEnabled) return;
    setCandidates([]);
    setPasteText('');
    setParseAttempted(false);
    setImportMeta(null);
    setImportError('');
  }, [settings?.bulkImportEnabled]);

  useEffect(() => {
    async function loadSession() {
      try {
        const result = await api.me();
        setUser(result.user);
      } catch {
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    loadSession();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('tow');
    if (!/^\d+$/.test(id || '')) return undefined;
    let cancelled = false;
    api.getTow(id).then((tow) => {
      if (cancelled) return;
      const originTab = ['dashboard', 'setup', 'history'].includes(params.get('tab')) ? params.get('tab') : 'dashboard';
      setTab(originTab);
      openTow(tow, originTab);
      const view = params.get('view');
      if (['confirm', 'workflow', 'complete'].includes(view)) setTowPage(view);
      window.history.replaceState(null, '', window.location.pathname);
    }).catch((err) => { if (!cancelled) setManualError(err.message); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    async function syncSteps() {
      try {
        const result = await syncPendingWorkflowSteps(api);
        setPendingStepCount(result.remaining);
        if (result.synced > 0) {
          setWorkflowSyncStatus("Saved pending tow times to the server.");
          await load();
          if (activeTow) setActiveTow(await api.getTow(activeTow.id));
        }
      } catch {
        setPendingStepCount(pendingWorkflowStepCount());
      }
    }

    void syncSteps();
    window.addEventListener("online", syncSteps);
    window.addEventListener("focus", syncSteps);
    const interval = window.setInterval(syncSteps, 15000);
    return () => {
      window.removeEventListener("online", syncSteps);
      window.removeEventListener("focus", syncSteps);
      window.clearInterval(interval);
    };
  }, [user]);

  async function logout() {
    await api.logout();
    setUser(null);
    setActiveTow(null);
    setAdminPanel(false);
  }

  function resetAndRefresh() {
    setActiveSearch("");
    setHistorySearch("");
    setHistoryPaging({ search: "", pageSize: historyPageSize, page: 1 });
    setManualTow(emptyTow);
    setManualError("");
    setPasteText("");
    setCandidates([]);
    setParseAttempted(false);
    setImportMeta(null);
    setImportError("");
    setPaperDownloadError("");
    setExportProgress(null);
    void load();
  }

  async function submitIssue(event) {
    event.preventDefault();
    setIssueStatus("");
    try {
      await api.reportIssue({
        message: issueText,
        page: window.location.href,
        userAgent: window.navigator.userAgent
      });
      setIssueText("");
      setIssueStatus("Issue report saved.");
      setIssueOpen(false);
    } catch (err) {
      setIssueStatus(err.message);
    }
  }

  async function saveManual() {
    setManualError('');
    try {
      await api.createTow(prepareTow(manualTow));
      setManualTow(emptyTow);
      openTab("dashboard");
      await load();
    } catch (err) { setManualError(err.message); }
  }

  function startTowBack(tow) {
    setManualTow({
      ...emptyTow,
      airline: tow.airline || "",
      aircraftType: tow.aircraftType || "",
      gate: tow.towSpot || "",
      tailNumber: tow.tailNumber || ""
    });
    setManualError("");
    openTab("setup");
  }

  async function parseImport() {
    setImportError('');
    try {
      const result = await api.parsePlan(pasteText);
      setCandidates(result.candidates);
      setImportMeta({ ignoredCount: result.ignoredCount || 0, totalParsed: result.totalParsed || result.candidates.length });
      setParseAttempted(true);
    } catch (err) { setImportError(err.message); }
  }

  async function saveCandidates() {
    setImportError('');
    try {
      await api.createBulk(candidates.map(prepareTow));
      setCandidates([]);
      setPasteText("");
      setParseAttempted(false);
      setImportMeta(null);
      openTab("dashboard");
      await load();
    } catch (err) { setImportError(err.message); }
  }

  async function refreshTow(nextTow) {
    setActiveTow(nextTow);
    await load();
  }

  async function logStep(step) {
    const timestamp = new Date().toISOString();
    try {
      const nextTow = await api.logStep(activeTow.id, step, { timestamp });
      await refreshTow(nextTow);
      setWorkflowSyncStatus("");
    } catch (error) {
      if (!error.networkError) throw error;
      queueWorkflowStep(activeTow.id, step, timestamp);
      setPendingStepCount(pendingWorkflowStepCount());
      setWorkflowSyncStatus("Time saved on this device. It will sync when the connection returns.");
      setActiveTow(applyWorkflowStep(activeTow, step, timestamp));
    }
    if (step === "towPaperCompletedAt") setTowPage("complete");
  }

  async function undoWorkflowStep() {
    if (!window.confirm("Undo the last logged workflow step?")) return;
    await refreshTow(await api.undoLastStep(activeTow.id));
    setTowPage("workflow");
  }

  async function moveCompletedTowBackToActive() {
    if (activeTow.status !== "completed") return;
    if (!window.confirm("Move this completed tow back to Active Tows?")) return;
    if (!window.confirm("This will remove the paperwork-complete timestamp and make the tow active again. Continue?")) return;
    await api.undoLastStep(activeTow.id);
    setActiveTow(null);
    setTowPage("confirm");
    setTab("dashboard");
    await load();
  }

  async function copySummary() {
    const text = completedSummary(activeTow);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed. Select the summary text and copy it manually.");
    }
  }

  async function editTimestamp(field) {
    const value = window.prompt("Timestamp (24-hour time or YYYY-MM-DD HH:mm)", timestampPromptValue(activeTow[field]));
    if (!value) return;
    const parsed = parseTimestampInput(value, activeTow[field]);
    if (!parsed) {
      window.alert("Enter a valid time like 13:45, 1345, or 2026-06-17 13:45.");
      return;
    }
    await refreshTow(await api.updateTow(activeTow.id, { [field]: parsed.toISOString() }));
  }

  async function saveActiveTow() {
    await refreshTow(await api.updateTow(activeTow.id, prepareTow(activeTow)));
  }

  async function saveDetailsAndContinue() {
    const saved = await api.updateTow(activeTow.id, prepareTow(activeTow));
    await refreshTow(saved);
    setTowPage(saved.status === "completed" ? "complete" : "workflow");
  }

  function requestDeleteActiveTow() {
    setDeleteReason("");
    setDeleteError("");
    setDeleteDialogOpen(true);
  }

  async function deleteActiveTow(event) {
    event.preventDefault();
    const reason = deleteReason.trim();
    if (!reason) {
      setDeleteError("Enter a reason for deleting this tow.");
      return;
    }
    try {
      await api.deleteTow(activeTow.id, reason);
      setDeleteDialogOpen(false);
      setDeleteReason("");
      setActiveTow(null);
      await load();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  function openTow(tow, originTab = tab) {
    setTowOriginTab(originTab);
    setActiveTow(tow);
    if (tow.status === "completed") setTowPage("complete");
    else if (tow.status === "planned") setTowPage("confirm");
    else setTowPage("workflow");
  }

  async function returnToMenu(nextTab = towOriginTab) {
    if (activeTow && towPage === "confirm") {
      await saveActiveTow();
    }
    setActiveTow(null);
    setTowPage("confirm");
    setTab(nextTab);
    await load();
  }

  function openTab(nextTab) {
    setTab(nextTab);
    setAdminPanel(false);
  }

  function tabLink(id, label, Icon) {
    return (
      <a
        aria-selected={tab === id}
        className={tab === id ? "active" : ""}
        href={`#${id}`}
        onClick={(event) => {
          event.preventDefault();
          if (activeTow) void returnToMenu(id);
          else openTab(id);
        }}
        role="tab"
      >
        <Icon size={18} /> {label}
      </a>
    );
  }

  if (authLoading) {
    return <div className="notice app-loading">Loading...</div>;
  }

  if (!user) {
    return <><LoginPage onLogin={setUser} /><span className="app-version">v{version}</span></>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-dot" />
          <h1>TowTeam</h1>
        </div>
        <div className="top-actions">
          <span className="user-pill">{user.username} ({user.accountType === "local_admin" ? "local admin" : user.accountType === "super_admin" ? "super admin" : user.role})</span>
          {user.role === "admin" && (
            <button className="icon-btn" onClick={() => { setActiveTow(null); setAdminPanel(true); }} title="Users" type="button">
              <Users size={20} />
            </button>
          )}
          <button className="icon-btn" onClick={resetAndRefresh} title="Reset filters and refresh" type="button">
            <RefreshCcw size={20} />
          </button>
          <button className="icon-btn" onClick={logout} title="Log out" type="button">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <nav aria-label="Primary" className="tabs" role="tablist">
        {tabLink("dashboard", "Active", LayoutDashboard)}
        {tabLink("setup", "Setup", Plus)}
        {tabLink("history", "History", History)}
      </nav>

      {error && <div className="notice error">{error}</div>}
      {airlineError && <div className="notice error">{airlineError}</div>}
      {settingsError && <div className="notice error">{settingsError}</div>}
      {loading && <div className="notice">Loading...</div>}
      {(workflowSyncStatus || pendingStepCount > 0) && (
        <div className={pendingStepCount > 0 ? "notice warn" : "notice"}>
          {workflowSyncStatus || "Pending tow times are waiting to sync."}
          {pendingStepCount > 0 ? ` Pending: ${pendingStepCount}` : ""}
        </div>
      )}

      {adminPanel ? (
        <AdminUsersPage currentUser={user} onBack={() => setAdminPanel(false)} airlines={airlines} onAirlinesChange={setAirlines} settings={settings} onSettingsChange={setSettings} onAnnouncementCreated={loadPendingAnnouncements} />
      ) : (
      <main>
        {activeTow && towPage === "confirm" && (
          <section className="page-panel">
            <div className="section-head">
              <div>
                <h2>Confirm Tow Details</h2>
                <p className="muted">
                  {activeTow.airline}
                  {activeTow.inboundFlightNumber}
                </p>
              </div>
              <button className="btn ghost" onClick={() => void returnToMenu()}>
                <ArrowLeft size={18} /> Menu
              </button>
            </div>
            {activeTow.parserWarnings?.length > 0 && <div className="notice warn">{activeTow.parserWarnings.join(" ")}</div>}
            <TowForm value={activeTow} onChange={setActiveTow} airlines={airlines} />
            <div className="page-actions">
              <button className="btn green" onClick={saveDetailsAndContinue}>
                <Save size={18} /> Save and Continue
              </button>
              <a className="btn blue" href={towChecklistUrl(activeTow.id)}>
                <Download size={18} /> Checklist PDF
              </a>
              <a className="btn teal" href={`/api/paper-editor/?tow=${activeTow.id}&return=confirm&tab=${towOriginTab}`}><Clipboard size={18} /> Edit Tow Paper</a>
              <a className="btn ghost" href={towChecklistPreviewUrl(activeTow.id)} rel="noreferrer" target="_blank">
                <Eye size={18} /> Preview PDF
              </a>
              <button className="btn red" onClick={requestDeleteActiveTow}>
                <Trash2 size={18} /> Delete
              </button>
            </div>
          </section>
        )}

        {activeTow && towPage === "workflow" && (
          <section className="page-panel">
            <div className="section-head">
              <div>
                <h2>
                  {activeTow.airline}
                  {activeTow.inboundFlightNumber} Workflow
                </h2>
                <p className="muted">
                  {activeTow.fromLocation || "Unknown"} to {activeTow.toLocation || activeTow.towSpot || "Unknown"}
                </p>
              </div>
              <button className="btn ghost" onClick={() => void returnToMenu()}>
                <ArrowLeft size={18} /> Menu
              </button>
            </div>
            <Workflow tow={activeTow} onLog={logStep} onEditTimestamp={editTimestamp} />
            {activeTow.towCompletedAt && !activeTow.towPaperCompletedAt && (
              <>
                <div className="summary-panel">
                  <h3>Tow Summary</h3>
                  <pre>{completedSummary(activeTow)}</pre>
                  <button className="btn green" onClick={copySummary}>
                    <Clipboard size={18} /> Copy Summary
                  </button>
                  {copyStatus && <p className="muted">{copyStatus}</p>}
                </div>
                <div className="paper-gate">
                  <div>
                    <strong>Tow Paper Complete</strong>
                    <span>Required to save and complete this tow.</span>
                  </div>
                  <label className="paper-check">
                    <input type="checkbox" onChange={(event) => event.target.checked && logStep("towPaperCompletedAt")} />
                    Complete
                  </label>
                </div>
              </>
            )}
            <div className="page-actions">
              <button className="btn ghost" onClick={undoWorkflowStep}>
                <RotateCcw size={18} /> Undo Last Step
              </button>
              <button className="btn blue" onClick={() => setTowPage("confirm")}>
                Edit Details
              </button>
              <a className="btn green" href={towChecklistUrl(activeTow.id)}>
                <Download size={18} /> Checklist PDF
              </a>
              <a className="btn teal" href={`/api/paper-editor/?tow=${activeTow.id}&return=workflow&tab=${towOriginTab}`}><Clipboard size={18} /> Edit Tow Paper</a>
              <a className="btn ghost" href={towChecklistPreviewUrl(activeTow.id)} rel="noreferrer" target="_blank">
                <Eye size={18} /> Preview PDF
              </a>
            </div>
          </section>
        )}

        {activeTow && towPage === "complete" && (
          <section className="page-panel">
            <div className="section-head">
              <div>
                <h2>Completed Tow Summary</h2>
                <p className="muted">
                  {activeTow.airline}
                  {activeTow.inboundFlightNumber}
                </p>
              </div>
              <button className="btn ghost" onClick={() => void returnToMenu()}>
                <ArrowLeft size={18} /> Menu
              </button>
            </div>
            <pre>{completedSummary(activeTow)}</pre>
            <div className="page-actions">
              <button className="btn green" onClick={copySummary}>
                <Clipboard size={18} /> Copy Summary
              </button>
              <a className="btn green" href={towChecklistUrl(activeTow.id)}>
                <Download size={18} /> Checklist PDF
              </a>
              <a className="btn teal" href={`/api/paper-editor/?tow=${activeTow.id}&return=complete&tab=${towOriginTab}`}><Clipboard size={18} /> Edit Tow Paper</a>
              <a className="btn ghost" href={towChecklistPreviewUrl(activeTow.id)} rel="noreferrer" target="_blank">
                <Eye size={18} /> Preview PDF
              </a>
              <button className="btn blue" onClick={() => setTowPage("confirm")}>
                Edit Tow Details
              </button>
              {activeTow.status === "completed" && (
                <button className="btn red" onClick={moveCompletedTowBackToActive}>
                  <RotateCcw size={18} /> Move Back to Active
                </button>
              )}
            </div>
            {copyStatus && <p className="muted">{copyStatus}</p>}
          </section>
        )}

        {!activeTow && tab === "dashboard" && (
          <section>
            <div className="section-head">
              <h2>Active Tows</h2>
              <span>{visibleActiveTows.length === activeTows.length ? `${activeTows.length} open` : `${visibleActiveTows.length} of ${activeTows.length}`}</span>
            </div>
            <div className="active-search">
              <Search aria-hidden="true" size={19} />
              <input
                aria-label="Search active tows"
                onChange={(event) => setActiveSearch(event.target.value)}
                placeholder="Search active tows"
                type="search"
                value={activeSearch}
              />
            </div>
            <div className="tow-grid">
              {visibleActiveTows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={openTow} airlines={airlines} />)}
            </div>
            {visibleActiveTows.length === 0 && <p className="muted empty-state">No active tows match that search.</p>}
          </section>
        )}

        {!activeTow && tab === "setup" && (
          <section className={`setup-grid${settings?.bulkImportEnabled ? '' : ' manual-only'}`}>
            <div className="panel">
              <h2>Manual Tow</h2>
              {manualError && <div className="notice error">{manualError}</div>}
              <TowForm value={manualTow} onChange={setManualTow} manual airlines={airlines} />
              <button className="btn green wide" onClick={saveManual}><Save size={18} />Save Tow</button>
            </div>
            {settings?.bulkImportEnabled && <div className="panel">
              <h2>Bulk Import</h2>
              {importError && <div className="notice error" role="alert">{importError}</div>}
              <textarea
                className="paste-box"
                value={pasteText}
                onChange={(event) => {
                  setPasteText(event.target.value);
                  setParseAttempted(false);
                }}
              />
              <button className="btn blue wide" onClick={parseImport}><Upload size={18} />Parse Import</button>
              {candidates.length > 0 && (
                <div className="candidate-list">
                  {candidates.map((candidate, index) => (
                    <div className="candidate" key={`${candidate.inboundFlightNumber}-${index}`}>
                      <TowForm compact value={candidate} airlines={airlines} onChange={(next) => setCandidates(candidates.map((item, i) => (i === index ? next : item)))} />
                      {candidate.parserWarnings?.length > 0 && <p className="warning-text">{candidate.parserWarnings.join(" ")}</p>}
                    </div>
                  ))}
                  <button className="btn green wide" onClick={saveCandidates}>Save Imported Tows</button>
                </div>
              )}
              {parseAttempted && importMeta && (
                <p className="muted">
                  Parsed {importMeta.totalParsed} possible tow records. Imported {candidates.length}. Ignored {importMeta.ignoredCount} without known tow spots.
                </p>
              )}
              {parseAttempted && candidates.length === 0 && (
                <p className="muted">No importable tows found. Only flights with exact tow spots like BB113, NL614, or WR22 are imported.</p>
              )}
            </div>}
          </section>
        )}

        {!activeTow && tab === "history" && (
          <section>
            <div className="section-head">
              <h2>Tow History Database</h2>
              <div className="export-actions">
                <button className="btn teal" type="button" disabled={paperDownloadDisabled} onClick={() => void downloadVisiblePapers()}><Download size={18} />{paperDownloadBusy ? 'Preparing...' : tows.length > 1 ? 'Download ZIP' : 'Download PDF'}</button>
                <button className="btn blue" disabled={loading || paperDownloadBusy} onClick={() => void downloadHistoryData('csv')} type="button"><Download size={18} />CSV</button>
                <button className="btn green" disabled={loading || paperDownloadBusy} onClick={() => void downloadHistoryData('xls')} type="button"><Download size={18} />Excel</button>
              </div>
            </div>
            <div className="active-search">
              <Search aria-hidden="true" size={19} />
              <input
                aria-label="Search tow history"
                placeholder="Search tow history"
                type="search"
                value={historySearch}
                onChange={(event) => { setHistorySearch(event.target.value); setPaperDownloadError(''); }}
              />
            </div>
            {paperDownloadError && <div className="notice error" role="alert">{paperDownloadError}</div>}
            {exportProgress && (
              <div className="export-progress" role="status">
                <span>{exportProgress.label}{exportProgress.percent !== null ? ` ${exportProgress.percent}%` : ''}</span>
                <progress max="100" {...(exportProgress.percent !== null ? { value: exportProgress.percent } : {})} />
              </div>
            )}
            <div className="tow-grid">
              {tows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={openTow} onTowBack={startTowBack} airlines={airlines} />)}
            </div>
            {!loading && tows.length === 0 && <p className="muted empty-state">No completed tows match that search.</p>}
            <div className="history-pagination">
              <label>
                <span>Per page</span>
                <select value={historyPageSize} onChange={(event) => setHistoryPageSize(Number(event.target.value))}>
                  {[5, 10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <span>{pageInfo.total} tow{pageInfo.total === 1 ? "" : "s"} · Page {pageInfo.page} of {pageInfo.totalPages}</span>
              <div>
                <button
                  aria-label="Previous history page"
                  className="icon-btn"
                  disabled={pageInfo.page <= 1 || loading}
                  onClick={() => setHistoryPage(pageInfo.page - 1)}
                  title="Previous page"
                  type="button"
                >
                  <ChevronLeft size={21} />
                </button>
                <button
                  aria-label="Next history page"
                  className="icon-btn"
                  disabled={pageInfo.page >= pageInfo.totalPages || loading}
                  onClick={() => setHistoryPage(pageInfo.page + 1)}
                  title="Next page"
                  type="button"
                >
                  <ChevronRight size={21} />
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      )}
      <span className="app-version">v{version}</span>
      <button className="issue-button" onClick={() => setIssueOpen(true)} type="button">
        <Bug size={16} /> Report Issue
      </button>
      {issueOpen && (
        <div className="issue-panel">
          <form onSubmit={submitIssue}>
            <div className="section-head">
              <h3>Report Issue</h3>
              <button className="icon-btn" onClick={() => setIssueOpen(false)} type="button">x</button>
            </div>
            <textarea
              autoFocus
              maxLength="2000"
              placeholder="What went wrong?"
              value={issueText}
              onChange={(event) => setIssueText(event.target.value)}
            />
            {issueStatus && <p className="muted">{issueStatus}</p>}
            <button className="btn green wide" type="submit">Submit Issue</button>
          </form>
        </div>
      )}
      {pendingAnnouncements[0] && (
        <div className="modal-backdrop announcement-backdrop">
          <section aria-describedby="global-announcement-message" aria-labelledby="global-announcement-title" aria-modal="true" className={`modal announcement-modal kind-${pendingAnnouncements[0].kind}`} role="alertdialog">
            <span className="announcement-kind">{pendingAnnouncements[0].kind}</span>
            <h2 id="global-announcement-title">{pendingAnnouncements[0].title}</h2>
            <p id="global-announcement-message">{pendingAnnouncements[0].message}</p>
            {pendingAnnouncements[0].imageUrl && <img alt="" className="announcement-image" src={pendingAnnouncements[0].imageUrl} />}
            {pendingAnnouncements.length > 1 && <span className="muted">{pendingAnnouncements.length - 1} more message{pendingAnnouncements.length === 2 ? '' : 's'} waiting</span>}
            {announcementError && <div className="notice error" role="alert">{announcementError}</div>}
            <button className="btn green wide" onClick={() => void acknowledgeCurrentAnnouncement()} type="button">Continue</button>
          </section>
        </div>
      )}
      {deleteDialogOpen && activeTow && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal delete-dialog" onSubmit={deleteActiveTow}>
            <div className="section-head">
              <div>
                <h3>Delete Tow</h3>
                <p className="muted">{activeTow.tailNumber || `${activeTow.airline || ""}${activeTow.inboundFlightNumber || ""}`}</p>
              </div>
            </div>
            <label>
              <span>Reason</span>
              <textarea
                autoFocus
                maxLength="500"
                placeholder="Why is this tow being deleted?"
                required
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
              />
            </label>
            {deleteError && <div className="notice error">{deleteError}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setDeleteDialogOpen(false)} type="button">Cancel</button>
              <button className="btn red" type="submit"><Trash2 size={18} /> Move to Trash</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
