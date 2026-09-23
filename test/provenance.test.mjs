import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),root=fileURLToPath(new URL('..',import.meta.url));
const python=process.env.STUDIO_PYTHON||'/home/x/Downloads/venv/bin/python';

function wav(){
  const b=Buffer.alloc(1644);b.write('RIFF');b.writeUInt32LE(1636,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);
  for(let i=0;i<800;i++)b.writeInt16LE(Math.round(4000*Math.sin(2*Math.PI*220*i/8000)),44+i*2);return b;
}
async function check(dir,workflow){
  const {stdout}=await run(python,[path.join(root,'resources/check_output.py'),path.join(dir,'score.svg'),path.join(dir,'render.py'),path.join(dir,'audio.wav'),workflow]);
  return JSON.parse(stdout);
}
test('generation provenance accepts Sky-style visible geometry and rejects container scores',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-provenance-'));
  try{
    await fs.writeFile(path.join(dir,'audio.wav'),wav());
    await fs.writeFile(path.join(dir,'score.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline points="0,60 40,45 80,52" data-audible="true" fill="none" stroke="blue"/></svg>');
    await fs.writeFile(path.join(dir,'render.py'),'import xml.etree.ElementTree as ET\nr=ET.parse("score.svg")\nfor z in r.iter():\n if z.tag.endswith("polyline"): sound=z.get("points")\n');
    let report=await check(dir,'generation');
    assert.deepEqual(report.issues,[]);assert.equal(report.svg.visibleEventMarks,1);
    assert.deepEqual(report.renderer,{readsScoreSvg:true,readsVisibleGeometry:true});

    await fs.writeFile(path.join(dir,'score.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><metadata>{"events":[1,2,3]}</metadata><path d="M0 50L100 50" data-role="preview"/></svg>');
    report=await check(dir,'generation');
    assert.ok(report.issues.some(x=>x.includes('stores data in SVG metadata')));
    report=await check(dir,'reference');
    assert.ok(!report.issues.some(x=>x.includes('stores data in SVG metadata')));

    await fs.writeFile(path.join(dir,'score.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 50L100 50" data-role="melody"/></svg>');
    await fs.writeFile(path.join(dir,'render.py'),'events=[(0,60,1),(1,64,1)]\n');
    report=await check(dir,'generation');
    assert.ok(report.issues.some(x=>x.includes('does not reference score.svg')));
    assert.ok(report.issues.some(x=>x.includes('does not visibly decode SVG geometry')));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
