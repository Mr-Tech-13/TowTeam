import { AlertTriangle, Clock, MapPin, Plane, User } from "lucide-react";

export function TowCard({ tow, onOpen }) {
  return (
    <button className="tow-card" onClick={() => onOpen(tow)} type="button">
      <div className="tile-top">
        <div className="tile-title">
          <span className={tow.tailNumber ? "tail-lead" : "tail-lead unknown"}>{tow.tailNumber || "Aircraft Reg unknown"}</span>
          <span className="flight-sub">
            {tow.airline}
            {tow.inboundFlightNumber}
          </span>
        </div>
        <span className={`status status-${tow.status}`}>{tow.status.replaceAll("_", " ")}</span>
      </div>
      <div className="tile-grid">
        <span><Plane size={17} />From {tow.inboundStation || "?"}</span>
        <span><Clock size={17} />ETA {tow.eta || "?"}</span>
        <span><MapPin size={17} />From {tow.gate || "?"}</span>
        <span><MapPin size={17} />To {tow.towSpot || "?"}</span>
        <span><User size={17} />Flight {tow.airline}{tow.inboundFlightNumber}</span>
      </div>
      {tow.needsReview && (
        <span className="review-badge">
          <AlertTriangle size={16} /> Needs Review
        </span>
      )}
    </button>
  );
}
