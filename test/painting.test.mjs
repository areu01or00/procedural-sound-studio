import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {beforeTurn,afterTurn} from '../server/hooks.mjs';
import {validateResult} from '../server/index.mjs';
const run=promisify(execFile), root=fileURLToPath(new URL('..',import.meta.url)), python=process.env.STUDIO_PYTHON||'/home/x/Downloads/venv/bin/python';

test('painting context is isolated from musical research and source images are measured',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-painting-analysis-'));
 try{
  await run(python,['-c','from PIL import Image\nimport sys\nImage.new("RGB",(90,60),(40,120,180)).save(sys.argv[1])',path.join(dir,'source.png')]);
  await run(python,[path.join(root,'resources/painting/analyse.py'),path.join(dir,'source.png'),dir]);
  const analysis=JSON.parse(await fs.readFile(path.join(dir,'analysis.json')));
  assert.equal(analysis.width,90); assert.equal(analysis.height,60); assert.ok(analysis.palette.length);
  const context=await beforeTurn({root,dataDir:dir,prompt:'Repaint this as a dream',mode:'painting',sourceImage:path.join(dir,'source.png'),analysisPath:path.join(dir,'analysis.json')});
  assert.equal(context.audit.mode,'painting'); assert.equal(context.audit.workflow,'reference');
  assert.ok(context.text.includes('Deterministic measurements')); assert.ok(!context.text.includes('Before composing or musically modifying'));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('example painting validates, rerenders deterministically and responds to an SVG mutation',async()=>{
 const source=path.join(root,'resources/painting/example'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-painting-render-'));
 try{
  for(const name of ['painting.svg','render.py','notes.md','result.json'])await fs.copyFile(path.join(source,name),path.join(dir,name));
  await run(python,[path.join(dir,'render.py')],{timeout:30000});
  const first=(await fs.readFile(path.join(dir,'painting.png'))).toString('base64');
  await run(python,[path.join(dir,'render.py')],{timeout:30000});
  assert.equal((await fs.readFile(path.join(dir,'painting.png'))).toString('base64'),first);
  const score=await fs.readFile(path.join(dir,'painting.svg'),'utf8');
  await fs.writeFile(path.join(dir,'painting.svg'),score.replace('#62d6ba','#ff3000'));
  await run(python,[path.join(dir,'render.py')],{timeout:30000});
  assert.notEqual((await fs.readFile(path.join(dir,'painting.png'))).toString('base64'),first);
  await fs.writeFile(path.join(dir,'painting.svg'),score); await run(python,[path.join(dir,'render.py')],{timeout:30000});
  const artifacts=await validateResult(dir,'painting'); assert.equal(artifacts.type,'painting'); assert.equal(artifacts.width,960);
  const report=await afterTurn({root,dir,artifacts,mode:'painting'}); assert.deepEqual(report.issues,[]); assert.ok(report.svg.stages>=3);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
