import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bug, Clipboard, Download, History, LayoutDashboard, LogOut, Plus, RefreshCcw, RotateCcw, Save, Trash2, Upload, Users } from "lucide-react";
import { api, exportExcelUrl, exportUrl } from "./lib/api.js";
import { completedSummary } from "./lib/summary.js";
import { TowCard } from "./components/TowCard.jsx";
import { TowForm } from "./components/TowForm.jsx";
import { Workflow } from "./components/Workflow.jsx";
import { QUICK_FILTER_TOW_SPOTS } from "../../shared/towSpots.js";
import "./styles/main.css";

const emptyTow = {
  airline: "",
  inboundFlightNumber: "",
  inboundStation: "",
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

function useTows(filters, enabled = true) {
  const [tows, setTows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setTows(await api.listTows(filters));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) load();
  }, [enabled, JSON.stringify(filters)]);

  return { tows, error, loading, load };
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

function AdminUsersPage({ currentUser, onBack }) {
  const [adminView, setAdminView] = useState("users");
  const [users, setUsers] = useState([]);
  const [issues, setIssues] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [passwords, setPasswords] = useState({});
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
    loadIssues();
    loadAudit();
  }, []);

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

  return (
    <main>
      <section className="page-panel">
        <div className="section-head">
          <div>
            <h2>User Accounts</h2>
            <p className="muted">Admins can create users, change roles, reset passwords, and delete accounts.</p>
          </div>
          <button className="btn ghost" onClick={onBack}><ArrowLeft size={18} /> Menu</button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="admin-subtabs">
          {["users", "issues", "audit"].map((view) => (
            <button className={adminView === view ? "btn green" : "btn ghost"} key={view} onClick={() => setAdminView(view)} type="button">
              {view}
            </button>
          ))}
        </div>
        {adminView === "users" && (
          <>
            <form className="user-create" onSubmit={createUser}>
              <input placeholder="Username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
              <input placeholder="Password" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
              <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn green" type="submit">Create User</button>
            </form>
            <div className="user-list">
              {users.map((user) => (
                <article className="user-row" key={user.id}>
                  <div>
                    <strong>{user.username}</strong>
                    <span>{user.role}{user.id === currentUser.id ? " - you" : ""}</span>
                  </div>
                  <select value={user.role} onChange={(event) => changeRole(user, event.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input
                    placeholder="New password"
                    type="password"
                    value={passwords[user.id] || ""}
                    onChange={(event) => setPasswords({ ...passwords, [user.id]: event.target.value })}
                  />
                  <button className="btn blue" onClick={() => changePassword(user)}>Change Password</button>
                  <button className="btn red" disabled={user.id === currentUser.id || user.username.toLowerCase() === "admin"} onClick={() => removeUser(user)}>Delete</button>
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
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminPanel, setAdminPanel] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [activeTow, setActiveTow] = useState(null);
  const [manualTow, setManualTow] = useState(emptyTow);
  const [pasteText, setPasteText] = useState("");
  const [parseAttempted, setParseAttempted] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({});
  const [towPage, setTowPage] = useState("confirm");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [issueStatus, setIssueStatus] = useState("");
  const [importMeta, setImportMeta] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");
  const historyQuery = { ...historyFilters, status: "completed" };
  const filters = tab === "history" ? historyQuery : { status: "active" };
  const { tows, error, loading, load } = useTows(filters, Boolean(user) && !adminPanel);
  const activeTows = useMemo(() => tows.filter((tow) => tow.status !== "completed"), [tows]);

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

  async function logout() {
    await api.logout();
    setUser(null);
    setActiveTow(null);
    setAdminPanel(false);
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
    await api.createTow(prepareTow(manualTow));
    setManualTow(emptyTow);
    openTab("dashboard");
    await load();
  }

  async function parseImport() {
    const result = await api.parsePlan(pasteText);
    setCandidates(result.candidates);
    setImportMeta({ ignoredCount: result.ignoredCount || 0, totalParsed: result.totalParsed || result.candidates.length });
    setParseAttempted(true);
  }

  async function saveCandidates() {
    await api.createBulk(candidates.map(prepareTow));
    setCandidates([]);
    setPasteText("");
    setParseAttempted(false);
    setImportMeta(null);
    openTab("dashboard");
    await load();
  }

  async function refreshTow(nextTow) {
    setActiveTow(nextTow);
    await load();
  }

  async function logStep(step) {
    const nextTow = await api.logStep(activeTow.id, step);
    await refreshTow(nextTow);
    if (step === "towPaperCompletedAt") setTowPage("complete");
  }

  async function undoWorkflowStep() {
    if (!window.confirm("Undo the last logged workflow step?")) return;
    await refreshTow(await api.undoLastStep(activeTow.id));
    setTowPage("workflow");
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

  async function deleteActiveTow() {
    if (!window.confirm("Delete this tow record?")) return;
    await api.deleteTow(activeTow.id);
    setActiveTow(null);
    await load();
  }

  function openTow(tow) {
    setActiveTow(tow);
    if (tow.status === "completed") setTowPage("complete");
    else if (tow.status === "planned") setTowPage("confirm");
    else setTowPage("workflow");
  }

  async function returnToMenu(nextTab = tab) {
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
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-dot" />
          <h1>TowTeam</h1>
        </div>
        <div className="top-actions">
          <span className="user-pill">{user.username} ({user.role})</span>
          {user.role === "admin" && (
            <button className="icon-btn" onClick={() => { setActiveTow(null); setAdminPanel(true); }} title="Users" type="button">
              <Users size={20} />
            </button>
          )}
          <button className="icon-btn" onClick={load} title="Refresh" type="button">
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
      {loading && <div className="notice">Loading...</div>}

      {adminPanel ? (
        <AdminUsersPage currentUser={user} onBack={() => setAdminPanel(false)} />
      ) : (
      <main>
        {activeTow && towPage === "confirm" && (
          <section className="page-panel">
            <div className="section-head">
              <div>
                <h2>Confirm Tow Details</h2>
                <p className="muted">
                  {activeTow.airline}
                  {activeTow.inboundFlightNumber} from {activeTow.inboundStation || "unknown"}
                </p>
              </div>
              <button className="btn ghost" onClick={() => void returnToMenu()}>
                <ArrowLeft size={18} /> Menu
              </button>
            </div>
            {activeTow.parserWarnings?.length > 0 && <div className="notice warn">{activeTow.parserWarnings.join(" ")}</div>}
            <TowForm value={activeTow} onChange={setActiveTow} />
            <div className="page-actions">
              <button className="btn green" onClick={saveDetailsAndContinue}>
                <Save size={18} /> Save and Continue
              </button>
              <button className="btn red" onClick={deleteActiveTow}>
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
            )}
            <div className="page-actions">
              <button className="btn ghost" onClick={undoWorkflowStep}>
                <RotateCcw size={18} /> Undo Last Step
              </button>
              <button className="btn blue" onClick={() => setTowPage("confirm")}>
                Edit Details
              </button>
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
              <button className="btn ghost" onClick={() => void returnToMenu("history")}>
                <ArrowLeft size={18} /> Menu
              </button>
            </div>
            <pre>{completedSummary(activeTow)}</pre>
            <div className="page-actions">
              <button className="btn green" onClick={copySummary}>
                <Clipboard size={18} /> Copy Summary
              </button>
              <button className="btn blue" onClick={() => setTowPage("confirm")}>
                Edit Historical Details
              </button>
            </div>
            {copyStatus && <p className="muted">{copyStatus}</p>}
          </section>
        )}

        {!activeTow && tab === "dashboard" && (
          <section>
            <div className="section-head">
              <h2>Active Tows</h2>
              <span>{activeTows.length} open</span>
            </div>
            <div className="tow-grid">
              {activeTows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={openTow} />)}
            </div>
          </section>
        )}

        {!activeTow && tab === "setup" && (
          <section className="setup-grid">
            <div className="panel">
              <h2>Manual Tow</h2>
              <TowForm value={manualTow} onChange={setManualTow} />
              <button className="btn green wide" onClick={saveManual}><Save size={18} />Save Tow</button>
            </div>
            <div className="panel">
              <h2>Bulk Import</h2>
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
                      <TowForm compact value={candidate} onChange={(next) => setCandidates(candidates.map((item, i) => (i === index ? next : item)))} />
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
            </div>
          </section>
        )}

        {!activeTow && tab === "history" && (
          <section>
            <div className="section-head">
              <h2>Tow History Database</h2>
              <div className="export-actions">
                <a className="btn blue" href={exportUrl(historyQuery)}><Download size={18} />CSV</a>
                <a className="btn green" href={exportExcelUrl(historyQuery)}><Download size={18} />Excel</a>
              </div>
            </div>
            <div className="filters">
              <div className="spot-quick-filters">
                {QUICK_FILTER_TOW_SPOTS.map((spot) => (
                  <button
                    className={historyFilters.towSpot === spot ? "btn green" : "btn ghost"}
                    key={spot}
                    onClick={() => setHistoryFilters({ ...historyFilters, towSpot: historyFilters.towSpot === spot ? "" : spot })}
                    type="button"
                  >
                    {spot}
                  </button>
                ))}
              </div>
              {[
                ["dateFrom", "From date"],
                ["dateTo", "To date"],
                ["tailNumber", "Tail number"],
                ["inboundFlightNumber", "Flight number"],
                ["gate", "Gate"],
                ["towSpot", "Tow spot"]
              ].map(([field, label]) => (
                <input
                  key={field}
                  type={field.startsWith("date") ? "date" : "search"}
                  placeholder={label}
                  onChange={(event) => setHistoryFilters({ ...historyFilters, [field]: event.target.value })}
                />
              ))}
            </div>
            <div className="tow-grid">
              {tows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={openTow} />)}
            </div>
          </section>
        )}
      </main>
      )}
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
    </div>
  );
}
