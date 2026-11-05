import { useEffect, useId, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { translate } from '../lib/i18n.js';

const fields = [
  ["airline", "Airline"],
  ["inboundFlightNumber", "Inbound flight number"],
  ["aircraftType", "Aircraft type"],
  ["eta", "ETA"],
  ["gate", "Tow from"],
  ["towSpot", "Tow to"],
  ["tailNumber", "Aircraft Reg"],
  ["driver", "Tractor Driver"],
  ["headsetOperator", "Headset Operator"],
  ["leftWingWalker", "Wing Walker LH"],
  ["rightWingWalker", "Wing Walker RH"],
  ["otherTeamMembers", "Other team members"]
];

export function TowForm({ value, onChange, compact = false, manual = false, airlines = [], language = 'en' }) {
  const aircraftTypes = airlines.find((airline) => airline.code.toUpperCase() === String(value.airline || '').toUpperCase())?.aircraftTypes || [];
  const update = (field, fieldValue) => {
    const next = { ...value, [field]: fieldValue };
    if (field === 'airline') {
      const types = airlines.find((airline) => airline.code === fieldValue)?.aircraftTypes || [];
      if (!types.includes(value.aircraftType)) next.aircraftType = '';
    }
    onChange(next);
  };

  return (
    <div className={compact ? "form-grid compact" : "form-grid"}>
      {fields.filter(([field]) => !manual || !['inboundFlightNumber', 'eta'].includes(field)).map(([field, label]) => (
        <label key={field}>
          <span>{translate(language, ({ airline: 'airline', inboundFlightNumber: 'flight', aircraftType: 'aircraftType', eta: 'eta', gate: 'towFrom', towSpot: 'towTo', tailNumber: 'aircraftReg', driver: 'driver', headsetOperator: 'headset', leftWingWalker: 'leftWalker', rightWingWalker: 'rightWalker', otherTeamMembers: 'otherTeam' })[field]) || label}</span>
          {field === 'airline' ? (
            <select value={value.airline || ''} onChange={(event) => update(field, event.target.value)}>
              <option value="">{translate(language, 'selectAirline')}</option>
              {value.airline && !airlines.some((airline) => airline.code === value.airline) && (
                <option value={value.airline}>{value.airline}</option>
              )}
              {airlines.map((airline) => <option key={airline.code} value={airline.code}>{airline.code}{airline.name ? ` - ${airline.name}` : ''}</option>)}
            </select>
          ) : field === 'aircraftType' ? (
            <select value={value.aircraftType || ''} onChange={(event) => update(field, event.target.value)}>
              <option value="">{translate(language, 'selectAircraftType')}</option>
              {value.aircraftType && !aircraftTypes.includes(value.aircraftType) && <option value={value.aircraftType}>{value.aircraftType}</option>}
              {aircraftTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          ) : ['driver', 'headsetOperator'].includes(field) ? (
            <CrewInput role={field === 'driver' ? 'driver' : 'headset'} value={value[field] || ''} onChange={(next) => update(field, next)} />
          ) : <input value={value[field] || ""} onChange={(event) => update(field, event.target.value)} />}
        </label>
      ))}
      <label className="full">
        <span>{translate(language, 'notes')}</span>
        <textarea value={value.notes || ""} onChange={(event) => update("notes", event.target.value)} />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={Boolean(value.needsReview)}
          onChange={(event) => update("needsReview", event.target.checked)}
        />
        {translate(language, 'needsReview')}
      </label>
    </div>
  );
}
function CrewInput({ role, value, onChange }) {
  const listId = useId();
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const load = () => api.listCrewMembers(role).then(setMembers).catch(() => {});
  useEffect(() => { void load(); }, [role]);
  async function remember() {
    if (!value.trim()) return;
    try { setMembers(await api.rememberCrewMember(role, value.trim())); } catch { /* Tow saving remains independent of suggestions. */ }
  }
  async function toggleFavorite(member) {
    await api.setCrewFavorite(member.id, !member.favorite);
    await load();
  }
  async function remove(member) {
    await api.deleteCrewMember(member.id);
    await load();
  }
  return <div className="crew-input">
    <input list={listId} value={value} onBlur={() => void remember()} onChange={(event) => onChange(event.target.value)} />
    <datalist id={listId}>{members.map((member) => <option key={member.id} value={member.name} />)}</datalist>
    {members.length > 0 && <button className="crew-manage-toggle" onClick={() => setOpen((current) => !current)} type="button">{open ? 'Hide' : 'Favorites & recent'}</button>}
    {open && <div className="crew-suggestions">
      {members.map((member) => <div key={member.id}>
        <button className="crew-name" onClick={() => { onChange(member.name); setOpen(false); }} type="button">{member.name}</button>
        <button aria-label={`${member.favorite ? 'Remove' : 'Add'} ${member.name} ${member.favorite ? 'from' : 'to'} favorites`} className={member.favorite ? 'crew-favorite active' : 'crew-favorite'} onClick={() => void toggleFavorite(member)} title="Favorite" type="button"><Star size={16} fill={member.favorite ? 'currentColor' : 'none'} /></button>
        <button aria-label={`Remove ${member.name} from recent crew`} className="crew-remove" onClick={() => void remove(member)} title="Remove suggestion" type="button"><Trash2 size={16} /></button>
      </div>)}
    </div>}
  </div>;
}
