import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const updateEnabled = process.env.APP_UPDATE_ENABLED === "true";
let updateInProgress = false;

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

async function readRemoteVersion(run) {
  try {
    const raw = await run(["show", "@{u}:package.json"]);
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function checkForUpdates({ fetch = true, run = runGit, enabled = updateEnabled } = {}) {
  if (!enabled) {
    return {
      enabled: false,
      updateAvailable: false,
      canUpdate: false,
      message: "Web updates are disabled. Set APP_UPDATE_ENABLED=true for a managed Docker checkout."
    };
  }
  if (!fs.existsSync(path.join(rootDir, ".git"))) {
    throw new Error("This installation is not a Git checkout and cannot update itself.");
  }

  if (fetch) await run(["fetch", "--prune"]);
  const [branch, upstream, currentCommit, upstreamCommit, counts, changes, latestCommit, remoteVersion] = await Promise.all([
    run(["branch", "--show-current"]),
    run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run(["rev-parse", "HEAD"]),
    run(["rev-parse", "@{u}"]),
    run(["rev-list", "--left-right", "--count", "HEAD...@{u}"]),
    run(["status", "--porcelain", "--untracked-files=no"]),
    run(["log", "-1", "--format=%h %s", "@{u}"]),
    readRemoteVersion(run)
  ]);
  const [ahead = 0, behind = 0] = counts.split(/\s+/).map(Number);
  const dirty = Boolean(changes);
  const updateAvailable = behind > 0;

  return {
    enabled: true,
    branch,
    upstream,
    currentCommit,
    upstreamCommit,
    ahead,
    behind,
    dirty,
    updateAvailable,
    canUpdate: updateAvailable && ahead === 0 && !dirty && !updateInProgress,
    updateInProgress,
    remoteVersion,
    latestCommit,
    message: dirty
      ? "Tracked local changes must be committed or reverted before updating."
      : ahead > 0
        ? "This checkout has local commits and cannot be updated automatically."
        : updateAvailable
          ? `${behind} update commit${behind === 1 ? " is" : "s are"} available.`
          : "TowTeam is up to date."
  };
}

export async function installUpdate({ run = runGit, enabled = updateEnabled } = {}) {
  if (updateInProgress) throw new Error("An update is already in progress.");
  const status = await checkForUpdates({ fetch: true, run, enabled });
  if (!status.enabled) throw new Error(status.message);
  if (!status.updateAvailable) return { updated: false, restartRequired: false, status };
  if (!status.canUpdate) throw new Error(status.message);

  updateInProgress = true;
  try {
    await run(["pull", "--ff-only"]);
    return {
      updated: true,
      restartRequired: true,
      previousCommit: status.currentCommit,
      currentCommit: await run(["rev-parse", "HEAD"]),
      remoteVersion: status.remoteVersion
    };
  } finally {
    updateInProgress = false;
  }
}

export function restartForUpdate() {
  const timer = setTimeout(() => process.exit(0), 500);
  timer.unref();
}
