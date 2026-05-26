const fields = [
  ["airline", "Airline"],
  ["inboundFlightNumber", "Inbound flight number"],
  ["inboundStation", "From station"],
  ["eta", "ETA"],
  ["gate", "Gate"],
  ["fromLocation", "From location"],
  ["toLocation", "To location"],
  ["towSpot", "Tow spot"],
  ["tailNumber", "Tail number"],
  ["driver", "Driver"],
  ["leftWingWalker", "Left wing walker"],
  ["rightWingWalker", "Right wing walker"],
  ["otherTeamMembers", "Other team members"]
];

export function TowForm({ value, onChange, compact = false }) {
  const update = (field, fieldValue) => onChange({ ...value, [field]: fieldValue });

  return (
    <div className={compact ? "form-grid compact" : "form-grid"}>
      {fields.map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <input value={value[field] || ""} onChange={(event) => update(field, event.target.value)} />
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
