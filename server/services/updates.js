import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { db } from '../db/database.js';
import packageInfo from '../../package.json' with { type: 'json' };

const currentVersion = packageInfo.version;

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const updateEnabled = process.env.APP_UPDATE_ENABLED === "true";
let updateInProgress = false;

function releaseSetting(key, fallback = '') {
  try { return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || fallback; }
  catch (error) { if (error.code === 'SQLITE_ERROR') return fallback; throw error; }
}

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

async function readRemoteVersion(run, ref = '@{u}') {
  try {
    const raw = await run(["show", `${ref}:package.json`]);
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function environmentKeys(contents) {
  const keys = new Set();
  for (const line of String(contents).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

export function mergeEnvironmentTemplate({ directory = rootDir, timestamp = new Date() } = {}) {
  const environmentPath = path.join(directory, '.env');
  const templatePath = path.join(directory, '.env.example');
  if (!fs.existsSync(environmentPath)) return { changed: false, added: [], skipped: '.env does not exist' };
  if (!fs.existsSync(templatePath)) return { changed: false, added: [], skipped: '.env.example does not exist' };

  const existing = fs.readFileSync(environmentPath, 'utf8');
  const template = fs.readFileSync(templatePath, 'utf8');
  const existingKeys = environmentKeys(existing);
  const additions = [];
  const added = [];
  for (const line of template.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || existingKeys.has(match[1])) continue;
    existingKeys.add(match[1]);
    added.push(match[1]);
    additions.push(line);
  }
  if (!additions.length) return { changed: false, added: [] };

  const slug = timestamp.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${environmentPath}.pre-update-${slug}`;
  const temporaryPath = `${environmentPath}.tmp-${process.pid}`;
  const separator = existing.endsWith('\n') || !existing ? '' : '\n';
  const merged = `${existing}${separator}\n# Added automatically from .env.example during update ${timestamp.toISOString()}\n${additions.join('\n')}\n`;
  const mode = fs.statSync(environmentPath).mode;
  fs.copyFileSync(environmentPath, backupPath, fs.constants.COPYFILE_EXCL);
  try {
    fs.writeFileSync(temporaryPath, merged, { mode });
    fs.renameSync(temporaryPath, environmentPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  return { changed: true, added, backup: path.basename(backupPath) };
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

  const releaseChannel = releaseSetting('releaseChannel', 'stable');
  const pinnedVersion = releaseSetting('pinnedVersion');
  if (releaseChannel === 'pinned') {
    return {
      enabled: true, releaseChannel, pinnedVersion, currentVersion,
      updateAvailable: Boolean(pinnedVersion && pinnedVersion !== currentVersion), canUpdate: false,
      message: pinnedVersion && pinnedVersion !== currentVersion
        ? `This node is pinned to ${pinnedVersion}. Install that release through the deployment manager.`
        : `This node is pinned to ${pinnedVersion || currentVersion}.`
    };
  }
  const targetRef = releaseChannel === 'preview' ? (process.env.APP_UPDATE_PREVIEW_REF || 'origin/dev') : '@{u}';

  if (fetch) await run(["fetch", "--prune"]);
  const [branch, upstream, currentCommit, upstreamCommit, counts, changes, latestCommit, remoteVersion] = await Promise.all([
    run(["branch", "--show-current"]),
    run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run(["rev-parse", "HEAD"]),
    run(["rev-parse", targetRef]),
    run(["rev-list", "--left-right", "--count", `HEAD...${targetRef}`]),
    run(["status", "--porcelain", "--untracked-files=no"]),
    run(["log", "-1", "--format=%h %s", targetRef]),
    readRemoteVersion(run, targetRef)
  ]);
  const [ahead = 0, behind = 0] = counts.split(/\s+/).map(Number);
  const dirty = Boolean(changes);
  const updateAvailable = behind > 0;

  return {
    enabled: true,
    releaseChannel,
    targetRef,
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

export async function installUpdate({ run = runGit, enabled = updateEnabled, mergeEnvironment = mergeEnvironmentTemplate } = {}) {
  if (updateInProgress) throw new Error("An update is already in progress.");
  const status = await checkForUpdates({ fetch: true, run, enabled });
  if (!status.enabled) throw new Error(status.message);
  if (!status.updateAvailable) return { updated: false, restartRequired: false, status };
  if (!status.canUpdate) throw new Error(status.message);

  updateInProgress = true;
  try {
    if (status.releaseChannel === 'preview') await run(['merge', '--ff-only', status.targetRef]);
    else await run(["pull", "--ff-only"]);
    let environment;
    try { environment = mergeEnvironment(); }
    catch (error) {
      environment = { changed: false, added: [], error: `Update installed, but .env could not be merged: ${error.message}` };
    }
    return {
      updated: true,
      restartRequired: true,
      previousCommit: status.currentCommit,
      currentCommit: await run(["rev-parse", "HEAD"]),
      remoteVersion: status.remoteVersion,
      environment
    };
  } finally {
    updateInProgress = false;
  }
}

export function restartForUpdate() {
  const timer = setTimeout(() => process.exit(0), 500);
  timer.unref();
}
