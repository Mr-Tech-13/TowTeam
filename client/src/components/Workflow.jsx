import { useEffect, useMemo, useState } from "react";
import { Check, PhoneCall, Play, ShieldCheck } from "lucide-react";
import { fmtDateTime, isWestRamp } from "../lib/summary.js";

const baseSteps = [
  ["setupStartedAt", "Start Tow Setup", "setupStartedAt", ShieldCheck],
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

function StepSlider({ label, disabled, onComplete }) {
  const [value, setValue] = useState(0);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    setValue(0);
    setLogging(false);
  }, [label]);

  async function handleChange(event) {
    const nextValue = Number(event.target.value);
    setValue(nextValue);
    if (nextValue < 100 || logging || disabled) return;
    setLogging(true);
    try {
      await onComplete();
    } finally {
      setValue(0);
      setLogging(false);
    }
  }

  return (
    <div className="slide-control">
      <div className="slide-label">
        <span>{logging ? "Logging..." : `Slide to log ${label}`}</span>
        <strong>{value}%</strong>
      </div>
      <input
        aria-label={`Slide to log ${label}`}
        disabled={disabled || logging}
        max="100"
        min="0"
        onChange={handleChange}
        type="range"
        value={value}
      />
    </div>
  );
}

export function Workflow({ tow, onLog, onEditTimestamp }) {
  const steps = useMemo(() => workflowFor(tow), [tow]);
  const activeStep = steps.find(([_step, _label, field]) => !tow[field]);

  return (
    <div className="workflow">
      {steps.map(([step, label, field, Icon]) => {
        const done = Boolean(tow[field]);
        const active = activeStep?.[0] === step;
        return (
          <div className={done ? "workflow-step done" : active ? "workflow-step active-step" : "workflow-step"} key={step}>
            <div>
              <Icon size={20} />
              <strong>{label}</strong>
              <span>{done ? `${fmtDateTime(tow[field])} EST` : active ? "Ready to log" : "Waiting"}</span>
            </div>
            {done ? (
              <button className="btn ghost" onClick={() => onEditTimestamp(field)}>
                Edit Time
              </button>
            ) : active ? (
              <StepSlider label={label} onComplete={() => onLog(step)} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
