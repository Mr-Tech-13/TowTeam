import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { towPermitTemplatePath } from './towPermit.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

export function paperEditorAssetsPath() {
  return path.resolve(root, process.env.TOW_PAPER_ASSETS_PATH || 'data/paper-editor-assets');
}

export async function preparePaperEditorAssets(options = {}) {
  const templatePath = options.templatePath || towPermitTemplatePath();
  try { await fs.access(templatePath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
  const result = await run(options.pythonBin || process.env.PDF_PYTHON_BIN || 'python3', [
    path.join(root, 'server/scripts/prepareTowPaperAssets.py'), templatePath,
    options.assetsPath || paperEditorAssetsPath()
  ], { timeout: 180_000, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}
