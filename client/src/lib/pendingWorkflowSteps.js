const storageKey = "towteam.pendingWorkflowSteps.v1";

export const workflowStatuses = {
  setupStartedAt: "setup_started",
  goaaCalledAt: "goaa_called",
  goaaArrivalAt: "goaa_arrival",
  pushStartedAt: "push_started",
  towStartedAt: "tow_started",
  towCompletedAt: "tow_completed",
  towPaperCompletedAt: "completed"
};

function readQueue() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  window.localStorage.setItem(storageKey, JSON.stringify(items));
}

export function pendingWorkflowStepCount() {
  return readQueue().length;
}

export function applyWorkflowStep(tow, step, timestamp) {
  return {
    ...tow,
    [step]: timestamp,
    status: workflowStatuses[step] || tow.status
  };
}

export function queueWorkflowStep(towId, step, timestamp) {
  const item = {
    id: `${towId}-${step}-${timestamp}`,
    towId,
    step,
    timestamp,
    createdAt: new Date().toISOString()
  };
  const queue = readQueue();
  if (!queue.some((queued) => queued.id === item.id)) {
    writeQueue([...queue, item]);
  }
  return item;
}

export async function syncPendingWorkflowSteps(api) {
  const queue = readQueue();
  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await api.logStep(item.towId, item.step, { timestamp: item.timestamp });
      synced += 1;
    } catch (error) {
      if (error.networkError) {
        remaining.push(item);
      } else if (!String(error.message || "").includes("already been logged")) {
        remaining.push(item);
      }
    }
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length };
}
