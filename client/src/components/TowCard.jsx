import { AlertTriangle, CalendarDays, Clock, MapPin, Plane } from "lucide-react";
import { fmtDate } from "../lib/summary.js";

export function TowCard({ tow, onOpen, airlines = [] }) {
  const airline = airlines.find((item) => item.code.toUpperCase() === String(tow.airline || '').toUpperCase());
  return (
    <button className={`tow-card${tow.needsReview ? ' outline-review' : ''}`} onClick={() => onOpen(tow)} type="button">
      <span className="airline-swatch" title={airline?.name || tow.airline || 'Unknown airline'} style={{ backgroundColor: airline?.color || '#94a3b8' }} />
      <div className="tile-top">
        <div className="tile-title">
          <span className={tow.tailNumber ? "tail-lead" : "tail-lead unknown"}>{tow.tailNumber || "Aircraft Reg unknown"}</span>
          <span className="flight-sub">
            <span className="airline-label" title={airline?.name || tow.airline}>
              {tow.airline || 'Unknown airline'}
            </span>
          </span>
        </div>
        <span className={`status status-${tow.status}`}>{tow.status.replaceAll("_", " ")}</span>
      </div>
      <div className="tile-grid">
        <span><Plane size={17} />Type {tow.aircraftType || "?"}</span>
        <span><CalendarDays size={17} />Date {fmtDate(tow.towCompletedAt || tow.createdAt) || "?"}</span>
        {tow.eta && <span><Clock size={17} />ETA {tow.eta}</span>}
        <span><MapPin size={17} />From {tow.gate || "?"}</span>
        <span><MapPin size={17} />To {tow.towSpot || "?"}</span>
      </div>
      {tow.needsReview && (
        <span className="review-badge">
          <AlertTriangle size={16} /> Needs Review
        </span>
      )}
    </button>
  );
}
