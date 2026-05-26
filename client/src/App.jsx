import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, History, LayoutDashboard, Plus, RefreshCcw, Save, Trash2, Upload } from "lucide-react";
import { api, exportUrl } from "./lib/api.js";
import { completedSummary } from "./lib/summary.js";
import { TowCard } from "./components/TowCard.jsx";
import { TowForm } from "./components/TowForm.jsx";
import { Workflow } from "./components/Workflow.jsx";
import "./styles/main.css";

const emptyTow = {
  airline: "MX",
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

function useTows(filters) {
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
    load();
  }, [JSON.stringify(filters)]);

  return { tows, error, loading, load };
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [activeTow, setActiveTow] = useState(null);
  const [manualTow, setManualTow] = useState(emptyTow);
  const [pasteText, setPasteText] = useState("");
  const [parseAttempted, setParseAttempted] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({});
  const [towPage, setTowPage] = useState("confirm");
  const filters = tab === "history" ? historyFilters : { status: "active" };
  const { tows, error, loading, load } = useTows(filters);
  const activeTows = useMemo(() => tows.filter((tow) => tow.status !== "completed"), [tows]);

  async function saveManual() {
    await api.createTow(manualTow);
    setManualTow(emptyTow);
    openTab("dashboard");
    await load();
  }

  async function parseImport() {
    const result = await api.parsePlan(pasteText);
    setCandidates(result.candidates);
    setParseAttempted(true);
  }

  async function saveCandidates() {
    await api.createBulk(candidates);
    setCandidates([]);
    setPasteText("");
    setParseAttempted(false);
    openTab("dashboard");
    await load();
  }

  async function refreshTow(nextTow) {
    setActiveTow(nextTow);
    await load();
  }

  async function logStep(step) {
    if (step === "towCompletedAt" && !window.confirm("Complete this tow and move it to summary/history?")) return;
    const nextTow = await api.logStep(activeTow.id, step);
    await refreshTow(nextTow);
    if (step === "towCompletedAt") setTowPage("complete");
  }

  async function editTimestamp(field) {
    const value = window.prompt("Timestamp (ISO or local parseable time)", activeTow[field] || new Date().toISOString());
    if (!value) return;
    await refreshTow(await api.updateTow(activeTow.id, { [field]: new Date(value).toISOString() }));
  }

  async function saveActiveTow() {
    await refreshTow(await api.updateTow(activeTow.id, activeTow));
  }

  async function saveDetailsAndContinue() {
    const saved = await api.updateTow(activeTow.id, activeTow);
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-dot" />
          <h1>TowTeam</h1>
        </div>
        <button className="icon-btn" onClick={load} title="Refresh" type="button">
          <RefreshCcw size={20} />
        </button>
      </header>

      <nav aria-label="Primary" className="tabs" role="tablist">
        {tabLink("dashboard", "Active", LayoutDashboard)}
        {tabLink("setup", "Setup", Plus)}
        {tabLink("history", "History", History)}
      </nav>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Loading...</div>}

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
            <div className="page-actions">
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
              <button className="btn blue" onClick={() => setTowPage("confirm")}>
                Edit Historical Details
              </button>
            </div>
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
              <a className="btn blue" href={exportUrl(historyFilters)}><Download size={18} />CSV</a>
            </div>
            <div className="filters">
              {["date", "tailNumber", "inboundFlightNumber", "gate", "towSpot"].map((field) => (
                <input key={field} type={field === "date" ? "date" : "search"} placeholder={field} onChange={(event) => setHistoryFilters({ ...historyFilters, [field]: event.target.value })} />
              ))}
            </div>
            <div className="tow-grid">
              {tows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={openTow} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
