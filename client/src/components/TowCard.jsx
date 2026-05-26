import { AlertTriangle, Clock, MapPin, Plane, User } from "lucide-react";

export function TowCard({ tow, onOpen }) {
  return (
    <button className="tow-card" onClick={() => onOpen(tow)} type="button">
      <div className="tile-top">
        <span className="flight">
          {tow.airline}
          {tow.inboundFlightNumber}
        </span>
        <span className={`status status-${tow.status}`}>{tow.status.replaceAll("_", " ")}</span>
      </div>
      <div className="tile-grid">
        <span><Plane size={17} />{tow.inboundStation || "Station ?"}</span>
        <span><Clock size={17} />ETA {tow.eta || "?"}</span>
        <span><MapPin size={17} />{tow.gate || "Gate ?"}</span>
        <span><MapPin size={17} />{tow.towSpot || "Spot ?"}</span>
        <span><User size={17} />{tow.tailNumber || "Tail unknown"}</span>
      </div>
      {tow.needsReview && (
        <span className="review-badge">
          <AlertTriangle size={16} /> Needs Review
        </span>
      )}
    </button>
  );
}
