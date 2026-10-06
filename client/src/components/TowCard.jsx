import { AlertTriangle, CalendarDays, Clock, MapPin, Plane, User } from "lucide-react";
import { fmtDate } from "../lib/summary.js";

export function TowCard({ tow, onOpen, airlines = [] }) {
  const airline = airlines.find((item) => item.code.toUpperCase() === String(tow.airline || '').toUpperCase());
  const outline = tow.needsReview ? 'review' : ['completed', 'tow_completed'].includes(tow.status) ? 'complete' : tow.status === 'planned' ? 'planned' : 'progress';
  return (
    <button className={`tow-card outline-${outline}`} onClick={() => onOpen(tow)} type="button">
      <div className="tile-top">
        <div className="tile-title">
          <span className={tow.tailNumber ? "tail-lead" : "tail-lead unknown"}>{tow.tailNumber || "Aircraft Reg unknown"}</span>
          <span className="flight-sub">
            <span className="airline-label" title={airline?.name || tow.airline}>
              <span className="airline-swatch" style={{ backgroundColor: airline?.color || '#94a3b8' }} />
              {tow.airline || 'Unknown airline'}
            </span>
            {tow.inboundFlightNumber && <span>{tow.inboundFlightNumber}</span>}
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
        {tow.inboundFlightNumber && <span className="flight-detail"><User size={17} />Flight {tow.airline}{tow.inboundFlightNumber}</span>}
      </div>
      {tow.needsReview && (
        <span className="review-badge">
          <AlertTriangle size={16} /> Needs Review
        </span>
      )}
    </button>
  );
}
