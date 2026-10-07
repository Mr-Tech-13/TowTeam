import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateTowPermitPdf } from '../services/towPermit.js';

test('edited tow paper uses only saved answers without auto-filled details or marks', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edited-tow-paper-'));
  const python = process.env.PDF_PYTHON_BIN || 'python3';
  try {
    execFileSync(python, ['-c', "from PIL import Image; from pathlib import Path; import sys; [(Image.new('RGB',(10,10),'white').save(Path(sys.argv[1])/f'page-{i}.png')) for i in range(1,4)]", dir]);
    await fs.writeFile(path.join(dir, 'fields.json'), JSON.stringify([
      {name:'Airline',type:'/Tx',page:0,rect:[96,682,155,696]},
      {name:'undefined_2',type:'/Tx',page:1,rect:[294,450,555,472]},
      {name:'Check Box56',type:'/Btn',page:1,rect:[250,450,270,473]},
      {name:'Check Box57',type:'/Btn',page:1,rect:[271,450,291,473]}
    ]));
    const tow = {airline:'AUTOFILL',tailNumber:'SHOULDNOTAPPEAR',driver:'AUTODRIVER'};
    for (const [name,state] of [
      ['blank',{text:{},answers:{},risk:{}}],
      ['saved',{text:{Airline:'MANUAL',undefined_2:'Saved exception'},answers:{0:'no'},risk:{}}]
    ]) {
      const bytes = await generateTowPermitPdf(tow,{state,assetsPath:dir,pythonBin:python});
      const file = path.join(dir, `${name}.pdf`); await fs.writeFile(file,bytes);
      const text = execFileSync(python,['-c',"from pypdf import PdfReader; import sys; r=PdfReader(sys.argv[1]); assert len(r.pages)==3; print('\\n'.join(p.extract_text() for p in r.pages))",file],{encoding:'utf8'});
      assert.doesNotMatch(text,/AUTOFILL|SHOULDNOTAPPEAR|AUTODRIVER/);
      if (name==='blank') assert.equal(text.trim(),'');
      else {assert.match(text,/MANUAL/);assert.match(text,/Saved exception/);assert.equal(text.match(/\bX\b/g)?.length,1);}
    }
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
