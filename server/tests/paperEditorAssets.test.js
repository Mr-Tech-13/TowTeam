import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preparePaperEditorAssets } from '../services/paperEditorAssets.js';

test('private template assets generate on clean startup, cache, rebuild, and reject invalid templates', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tow-paper-assets-'));
  const pythonBin = process.env.PDF_PYTHON_BIN || 'python3';
  const templatePath = path.join(dir, 'TowPermit.pdf');
  const assetsPath = path.join(dir, 'assets');
  const options = { templatePath, assetsPath, pythonBin };
  try {
    assert.equal(await preparePaperEditorAssets(options),false);
    const fixture = fileURLToPath(new URL('./fixtures/towPaperTemplate.py',import.meta.url));
    execFileSync(pythonBin,[fixture,templatePath]);
    const source = await fs.readFile(templatePath);
    assert.equal(await preparePaperEditorAssets(options),'generated');
    assert.deepEqual(await fs.readFile(templatePath),source);
    const fields = JSON.parse(await fs.readFile(path.join(assetsPath,'fields.json'),'utf8'));
    assert.equal(fields.filter(field=>field.type==='/Btn').length,50);
    assert.equal(fields.find(field=>field.name==='Aircraft Type').page,0);
    for (let index=1;index<=3;index+=1) {
      const png = await fs.readFile(path.join(assetsPath,`page-${index}.png`));
      assert.equal(png.subarray(1,4).toString(),'PNG');
      assert.ok(png.readUInt32BE(16)>1000); assert.equal(png.readUInt32BE(20),2200);
    }
    const template = await fs.readFile(path.join(assetsPath,'template.js'),'utf8');
    const data = JSON.parse(template.slice('window.TOW_TEMPLATE = '.length).trim().replace(/;$/,''));
    assert.equal(data.pages.length,3); assert.deepEqual(data.fields,fields);
    const before = await fs.stat(path.join(assetsPath,'template.js'));
    assert.equal(await preparePaperEditorAssets(options),'cached');
    assert.equal((await fs.stat(path.join(assetsPath,'template.js'))).mtimeMs,before.mtimeMs);
    await fs.unlink(path.join(assetsPath,'page-3.png'));
    assert.equal(await preparePaperEditorAssets(options),'generated');
    execFileSync(pythonBin,[fixture,templatePath,'Changed template']);
    assert.equal(await preparePaperEditorAssets(options),'generated');
    const manifest = await fs.readFile(path.join(assetsPath,'manifest.json'),'utf8');
    await fs.writeFile(templatePath,'Not a PDF');
    await assert.rejects(preparePaperEditorAssets(options));
    assert.equal(await fs.readFile(path.join(assetsPath,'manifest.json'),'utf8'),manifest);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
