import { useEffect, useMemo, useState } from "react";
import { Download, History, LayoutDashboard, Plus, RefreshCcw, Save, Trash2, Upload } from "lucide-react";
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
  const [candidates, setCandidates] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({});
  const filters = tab === "history" ? historyFilters : tab === "summary" ? { status: "completed" } : { status: "active" };
  const { tows, error, loading, load } = useTows(filters);
  const activeTows = useMemo(() => tows.filter((tow) => tow.status !== "completed"), [tows]);
  const completedTows = useMemo(() => tows.filter((tow) => tow.status === "completed"), [tows]);

  async function saveManual() {
    await api.createTow(manualTow);
    setManualTow(emptyTow);
    setTab("dashboard");
    await load();
  }

  async function parseImport() {
    const result = await api.parsePlan(pasteText);
    setCandidates(result.candidates);
  }

  async function saveCandidates() {
    await api.createBulk(candidates);
    setCandidates([]);
    setPasteText("");
    setTab("dashboard");
    await load();
  }

  async function refreshTow(nextTow) {
    setActiveTow(nextTow);
    await load();
  }

  async function logStep(step) {
    if (step === "towCompletedAt" && !window.confirm("Complete this tow and move it to summary/history?")) return;
    await refreshTow(await api.logStep(activeTow.id, step));
  }

  async function editTimestamp(field) {
    const value = window.prompt("Timestamp (ISO or local parseable time)", activeTow[field] || new Date().toISOString());
    if (!value) return;
    await refreshTow(await api.updateTow(activeTow.id, { [field]: new Date(value).toISOString() }));
  }

  async function saveActiveTow() {
    await refreshTow(await api.updateTow(activeTow.id, activeTow));
  }

  async function deleteActiveTow() {
    if (!window.confirm("Delete this tow record?")) return;
    await api.deleteTow(activeTow.id);
    setActiveTow(null);
    await load();
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

      <nav className="tabs">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
          <LayoutDashboard size={18} /> Active
        </button>
        <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>
          <Plus size={18} /> Setup
        </button>
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>
          <Save size={18} /> Summary
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          <History size={18} /> History
        </button>
      </nav>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="notice">Loading...</div>}

      <main>
        {tab === "dashboard" && (
          <section>
            <div className="section-head">
              <h2>Active Tows</h2>
              <span>{activeTows.length} open</span>
            </div>
            <div className="tow-grid">
              {activeTows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={setActiveTow} />)}
            </div>
          </section>
        )}

        {tab === "setup" && (
          <section className="setup-grid">
            <div className="panel">
              <h2>Manual Tow</h2>
              <TowForm value={manualTow} onChange={setManualTow} />
              <button className="btn green wide" onClick={saveManual}><Save size={18} />Save Tow</button>
            </div>
            <div className="panel">
              <h2>Bulk Import</h2>
              <textarea className="paste-box" value={pasteText} onChange={(event) => setPasteText(event.target.value)} />
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
            </div>
          </section>
        )}

        {tab === "summary" && (
          <section>
            <div className="section-head">
              <h2>Completed Tow Summary</h2>
              <span>{completedTows.length} complete</span>
            </div>
            <div className="summary-list">
              {completedTows.map((tow) => (
                <article className="panel" key={tow.id}>
                  <h3>{tow.tailNumber || `${tow.airline}${tow.inboundFlightNumber}`}</h3>
                  <pre>{completedSummary(tow)}</pre>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "history" && (
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
              {tows.map((tow) => <TowCard key={tow.id} tow={tow} onOpen={setActiveTow} />)}
            </div>
          </section>
        )}
      </main>

      {activeTow && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal">
            <div className="section-head">
              <h2>
                {activeTow.airline}
                {activeTow.inboundFlightNumber}
              </h2>
              <button className="icon-btn" onClick={() => setActiveTow(null)}>x</button>
            </div>
            {activeTow.parserWarnings?.length > 0 && <div className="notice warn">{activeTow.parserWarnings.join(" ")}</div>}
            <TowForm value={activeTow} onChange={setActiveTow} />
            <Workflow tow={activeTow} onLog={logStep} onEditTimestamp={editTimestamp} />
            {activeTow.status === "completed" && <pre>{completedSummary(activeTow)}</pre>}
            <div className="modal-actions">
              <button className="btn green" onClick={saveActiveTow}><Save size={18} />Save</button>
              <button className="btn red" onClick={deleteActiveTow}><Trash2 size={18} />Delete</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
