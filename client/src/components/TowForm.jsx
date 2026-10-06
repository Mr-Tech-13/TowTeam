const fields = [
  ["airline", "Airline"],
  ["inboundFlightNumber", "Inbound flight number"],
  ["aircraftType", "Aircraft type"],
  ["eta", "ETA"],
  ["gate", "Tow from"],
  ["towSpot", "Tow to"],
  ["tailNumber", "Aircraft Reg"],
  ["driver", "Tractor Driver"],
  ["leftWingWalker", "Wing Walker LH"],
  ["rightWingWalker", "Wing Walker RH"],
  ["otherTeamMembers", "Other team members"]
];

export function TowForm({ value, onChange, compact = false, manual = false, airlines = [] }) {
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
          <span>{label}</span>
          {field === 'airline' ? (
            <select value={value.airline || ''} onChange={(event) => update(field, event.target.value)}>
              <option value="">Select airline</option>
              {value.airline && !airlines.some((airline) => airline.code === value.airline) && (
                <option value={value.airline}>{value.airline}</option>
              )}
              {airlines.map((airline) => <option key={airline.code} value={airline.code}>{airline.code}{airline.name ? ` - ${airline.name}` : ''}</option>)}
            </select>
          ) : field === 'aircraftType' ? (
            <select value={value.aircraftType || ''} onChange={(event) => update(field, event.target.value)}>
              <option value="">Select aircraft type</option>
              {value.aircraftType && !aircraftTypes.includes(value.aircraftType) && <option value={value.aircraftType}>{value.aircraftType}</option>}
              {aircraftTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          ) : <input value={value[field] || ""} onChange={(event) => update(field, event.target.value)} />}
        </label>
      ))}
      <label className="full">
        <span>Notes</span>
        <textarea value={value.notes || ""} onChange={(event) => update("notes", event.target.value)} />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={Boolean(value.needsReview)}
          onChange={(event) => update("needsReview", event.target.checked)}
        />
        Needs Review
      </label>
    </div>
  );
}
