import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { beforeTurn } from '../server/hooks.mjs';
const run = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const python = process.env.STUDIO_PYTHON || '/home/x/Downloads/venv/bin/python';

test('context hook retains source workflow across follow-ups and advertises real local excerpts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-context-'));
  try {
    const ref = path.join(dir, 'references', 'example'); await fs.mkdir(ref, {recursive:true});
    await fs.writeFile(path.join(ref, 'excerpt.wav'), 'fixture');
    await fs.writeFile(path.join(ref, 'excerpt.json'), JSON.stringify({source_url:'https://youtu.be/example',source_start_seconds:375,source_end_seconds:425,focus_offset_seconds:20,duration_seconds:50}));
    const first = await beforeTurn({root, dataDir:dir, prompt:'Compose an original mechanical waltz'});
    assert.equal(first.audit.referenceWorkflow, false);
    assert.ok(first.text.includes('no quick-demo requirement'));
    assert.ok(first.text.includes('synthesis-notebook.md'));
    assert.ok(first.text.includes('melodic composition its own pass'));
    assert.ok(first.text.includes('no compulsory hook'));
    assert.ok(first.text.includes('nonmusical sound design'));
    assert.ok(first.text.length < 10000);
    assert.ok(first.text.includes('SVG browsers do not draw'));
    const fresh = await beforeTurn({root,dataDir:dir,prompt:'Compose a new techno-jazz song that feels nocturnal. Deliver audio.wav and score.svg.',history:[{prompt:'Reconstruct https://youtu.be/example'}]});
    assert.equal(fresh.audit.referenceWorkflow,false);
    const next = await beforeTurn({root, dataDir:dir, prompt:'continue', history:[{prompt:'Mod https://youtu.be/example at 6:35'}]});
    assert.equal(next.audit.referenceWorkflow, true);
    assert.ok(next.text.includes(path.join(ref, 'excerpt.wav')));
    assert.ok(next.text.includes('"focusOffset": 20'));
    assert.ok(next.text.includes('analyse.py'));
    assert.ok(next.text.includes('byte-identical audio is not success'));
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('generation hook follows the nearest task boundary and supplies composition authority', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-routing-'));
  try {
    const source = {prompt:'Reconstruct https://youtu.be/example'};
    const creation = {prompt:'Create an original techno jazz composition'};
    for (const prompt of ['continue', 'the SVG is empty', 'make the bass quieter']) {
      const result = await beforeTurn({root,dataDir:dir,prompt,history:[source,creation]});
      assert.equal(result.audit.workflow,'generation');
      assert.ok(result.text.includes('one authoritative composition'));
      assert.ok(result.text.includes('preserve every musical parameter'));
      assert.ok(!result.text.includes('Available reconstruction helper:'));
    }
    const adjustment = await beforeTurn({root,dataDir:dir,prompt:'make the bass quieter',history:[source]});
    assert.equal(adjustment.audit.workflow,'reference');
    const reference = await beforeTurn({root,dataDir:dir,prompt:'continue',history:[creation,source]});
    assert.equal(reference.audit.workflow,'reference');
    assert.ok(!reference.text.includes('# Generation hook:'));
    const recorded = await beforeTurn({root,dataDir:dir,prompt:'continue',history:[source,{prompt:'keep going',contextHook:{workflow:'generation'}}]});
    assert.equal(recorded.audit.workflow,'generation');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('spectral helper reconstructs stereo and SVG gain editing changes decoded samples', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-spectrum-'));
  try {
    await run(python, ['-c', `import numpy as np,soundfile as sf,sys
from pathlib import Path
p=Path(sys.argv[1]); sr=48000; t=np.arange(sr*2)/sr
rng=np.random.default_rng(42)
a=np.stack([.2*np.sin(2*np.pi*(220*t+200*t*t)),.3*np.sin(2*np.pi*731*t)],axis=1)+rng.normal(0,.001,(len(t),2))
sf.write(p/'original.wav',a,sr,subtype='FLOAT')`, dir]);
    await run(python, [path.join(root,'resources/reference/analyse.py'),dir], {timeout:60000});
    const report = JSON.parse(await fs.readFile(path.join(dir,'analysis.json')));
    assert.ok(report.reconstruction_snr_db > 100);
    assert.equal(report.duration,2); assert.equal(report.channels,2);
    const {stdout} = await run(python, ['-c', `from pathlib import Path
import sys,json,xml.etree.ElementTree as E,numpy as np,soundfile as sf
p=Path(sys.argv[1]);sys.path.insert(0,str(p));from render import decode
before=sf.read(p/'reconstruction.wav',always_2d=True)[0]
r=E.parse(p/'score.svg');next(z for z in r.getroot() if z.get('id')=='edits').text=json.dumps({'gain_db':-6,'bands':[]});r.write(p/'modified.svg')
a,sr=decode(p/'modified.svg');ratio=np.sqrt(np.mean(a*a))/np.sqrt(np.mean(before*before));print(ratio)
assert np.allclose(a,before*10**(-6/20),atol=2e-7)
assert not np.array_equal(a,before)`,dir]);
    assert.ok(Math.abs(Number(stdout.trim()) - 10**(-6/20)) < 1e-6);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
