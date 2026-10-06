import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

function AirlineRow({ airline, onSave, onDelete }) {
  const [name, setName] = useState(airline.name);
  const [color, setColor] = useState(airline.color);
  const [aircraftTypes, setAircraftTypes] = useState((airline.aircraftTypes || []).join(', '));
  return (
    <form className="airline-row" onSubmit={(event) => { event.preventDefault(); void onSave(airline.code, { name, color, aircraftTypes: parseTypes(aircraftTypes) }); }}>
      <strong>{airline.code}</strong>
      <input aria-label={`${airline.code} airline name`} maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
      <input aria-label={`${airline.code} color`} className="color-input" onInput={(event) => setColor(event.currentTarget.value)} type="color" value={color} />
      <button className="icon-btn" title={`Save ${airline.code}`} type="submit"><Save size={18} /></button>
      <button className="icon-btn" onClick={() => void onDelete(airline.code)} title={`Remove ${airline.code}`} type="button"><Trash2 size={18} /></button>
      <label className="airline-types">Aircraft types<input aria-label={`${airline.code} aircraft types`} placeholder="A220, A320, B777" onChange={(event) => setAircraftTypes(event.target.value)} value={aircraftTypes} /></label>
    </form>
  );
}

const parseTypes = (value) => value.split(',').map((type) => type.trim()).filter(Boolean);

export function AirlineSettings({ airlines, onChange }) {
  const [draft, setDraft] = useState({ code: '', name: '', color: '#38bdf8', aircraftTypes: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function save(code, values) {
    setError('');
    setStatus('');
    try {
      await api.updateAirline(code, values);
      onChange(await api.listAirlines());
      setStatus(`${code} saved.`);
    } catch (err) { setError(err.message); }
  }

  async function create(event) {
    event.preventDefault();
    setError('');
    setStatus('');
    try {
      const airline = await api.createAirline({ ...draft, aircraftTypes: parseTypes(draft.aircraftTypes) });
      onChange(await api.listAirlines());
      setDraft({ code: '', name: '', color: '#38bdf8', aircraftTypes: '' });
      setStatus(`${airline.code} added.`);
    } catch (err) { setError(err.message); }
  }

  async function remove(code) {
    if (!window.confirm(`Remove ${code} from the airline list? Existing tow records will keep their airline code.`)) return;
    setError('');
    setStatus('');
    try {
      await api.deleteAirline(code);
      onChange(await api.listAirlines());
      setStatus(`${code} removed.`);
    } catch (err) { setError(err.message); }
  }

  return (
    <section className="airline-settings">
      <h3>Airlines</h3>
      {error && <div className="notice error" role="alert">{error}</div>}
      {status && <div className="notice" role="status">{status}</div>}
      <form className="airline-create" onSubmit={create}>
        <label>Code<input maxLength={3} minLength={2} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} required value={draft.code} /></label>
        <label>Name<input maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} value={draft.name} /></label>
        <label>Color<input className="color-input" onInput={(event) => setDraft({ ...draft, color: event.currentTarget.value })} type="color" value={draft.color} /></label>
        <button className="btn green" type="submit">Add Airline</button>
        <label className="airline-types">Aircraft types<input placeholder="A220, A320, B777" onChange={(event) => setDraft({ ...draft, aircraftTypes: event.target.value })} value={draft.aircraftTypes} /></label>
      </form>
      <div className="airline-list">
        {airlines.map((airline) => <AirlineRow airline={airline} key={airline.code} onDelete={remove} onSave={save} />)}
        {airlines.length === 0 && <p className="muted">No airlines configured.</p>}
      </div>
    </section>
  );
}
