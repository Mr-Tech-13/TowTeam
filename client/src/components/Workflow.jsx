import { Check, PhoneCall, Play, ShieldCheck } from "lucide-react";
import { isWestRamp } from "../lib/summary.js";

const baseSteps = [
  ["setupStartedAt", "Tow Setup Started", "setupStartedAt", ShieldCheck],
  ["pushStartedAt", "Push Started", "pushStartedAt", Play],
  ["towStartedAt", "Tow Started", "towStartedAt", Play],
  ["towCompletedAt", "Tow Completed", "towCompletedAt", Check]
];

export function workflowFor(tow) {
  const steps = [...baseSteps];
  if (isWestRamp(tow)) {
    steps.splice(1, 0, ["goaaCalledAt", "GOAA Called", "goaaCalledAt", PhoneCall]);
    steps.splice(2, 0, ["goaaArrivalAt", "GOAA Arrival", "goaaArrivalAt", ShieldCheck]);
  }
  return steps;
}

export function Workflow({ tow, onLog, onEditTimestamp }) {
  return (
    <div className="workflow">
      {workflowFor(tow).map(([step, label, field, Icon]) => {
        const done = Boolean(tow[field]);
        return (
          <div className={done ? "workflow-step done" : "workflow-step"} key={step}>
            <div>
              <Icon size={20} />
              <strong>{label}</strong>
              <span>{done ? new Date(tow[field]).toLocaleString() : "Waiting"}</span>
            </div>
            <div className="step-actions">
              <button disabled={done} className={done ? "btn ghost" : "btn blue"} onClick={() => onLog(step)}>
                {done ? "Logged" : "Log"}
              </button>
              <button className="btn ghost" onClick={() => onEditTimestamp(field)}>
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
