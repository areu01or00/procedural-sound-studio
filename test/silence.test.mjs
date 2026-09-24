import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { RENDERER, wav } from './fixtures.mjs';
import { PYTHON } from '../server/python.mjs';

const run = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const python = PYTHON;
const SCORE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0d1117"/><polyline points="10,60 50,45 90,52" data-audible="true" fill="none"/></svg>';

async function delivery(renderer = RENDERER, score = SCORE) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-silence-'));
  await Promise.all([
    fs.writeFile(path.join(dir, 'score.svg'), score),
    fs.writeFile(path.join(dir, 'render.py'), renderer),
    fs.writeFile(path.join(dir, 'audio.wav'), wav()),
    fs.writeFile(path.join(dir, 'notes.md'), 'Design notes')
  ]);
  return dir;
}
async function silence(dir) {
  const { stdout } = await run(python, [path.join(root, 'resources/silence_check.py'), dir, 'score.svg', 'render.py', 'audio.wav'],
    { timeout: 200000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}
const sine = (freq, amplitude = 0.25) => `t = np.arange(8000) / 8000.0\nmix = ${amplitude} * np.sin(2 * np.pi * ${freq} * t)\n`;

test('honest renderer runs on the stripped score and writes silence', async () => {
  const dir = await delivery();
  try {
    const report = await silence(dir);
    assert.deepEqual(report.issues, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.silence.ran, true);
    assert.equal(report.silence.marks, 1);
    assert.ok(report.silence.peak < 1e-9, `peak ${report.silence.peak}`);
    assert.ok(report.silence.seconds > 0);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('a renderer that hardcodes a note keeps sounding after every mark is removed', async () => {
  const dir = await delivery(`from pathlib import Path\nimport numpy as np, soundfile as sf\nhere = Path(__file__).resolve().parent\n${sine(440)}sf.write(here / "audio.wav", mix.astype("float32"), 8000, subtype="FLOAT")\n`);
  try {
    const report = await silence(dir);
    assert.ok(report.issues.some(x => x.startsWith('Sound remains after removing every data-audible mark')), JSON.stringify(report.issues));
    assert.equal(report.silence.ran, true);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('a renderer that crashes on an empty score fails the test', async () => {
  const dir = await delivery(`from pathlib import Path\nimport xml.etree.ElementTree as ET\nimport numpy as np, soundfile as sf\nhere = Path(__file__).resolve().parent\nmarks = [n for n in ET.parse(here / "score.svg").getroot().iter() if n.get("data-audible") not in (None, "false")]\nif not marks: raise SystemExit("empty score unsupported")\n${sine(660)}sf.write(here / "audio.wav", mix.astype("float32"), 8000, subtype="FLOAT")\n`);
  try {
    const report = await silence(dir);
    assert.ok(report.issues.some(x => x.includes('Renderer failed on the score with all audible marks removed')), JSON.stringify(report.issues));
    assert.ok(report.silence.stderrTail.length > 0);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('non-finite silence is rejected', async () => {
  const dir = await delivery(`from pathlib import Path\nimport xml.etree.ElementTree as ET\nimport numpy as np, soundfile as sf\nhere = Path(__file__).resolve().parent\nmarks = [n for n in ET.parse(here / "score.svg").getroot().iter() if n.get("data-audible") not in (None, "false")]\nmix = np.zeros(8000)\nfor i, node in enumerate(marks): mix += 0.2 * np.sin(2 * np.pi * (220 + 40 * i) * np.arange(8000) / 8000.0)\npeak = float(np.max(np.abs(mix)))\nmix = mix / peak * 0.5\nsf.write(here / "audio.wav", mix.astype("float32"), 8000, subtype="FLOAT")\n`);
  try {
    const report = await silence(dir);
    assert.ok(report.issues.some(x => x.includes('Renderer produced non-finite audio for an empty score')), JSON.stringify(report.issues));
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('a renderer hardcoding the delivery path is rejected statically, not executed', async () => {
  const dir = await delivery();
  try {
    await fs.writeFile(path.join(dir, 'render.py'), `from pathlib import Path\nHERE = Path(${JSON.stringify(dir)})\nprint(HERE)\n`);
    const report = await silence(dir);
    assert.ok(report.issues.some(x => x.includes('hardcodes the absolute delivery path')), JSON.stringify(report.issues));
    assert.equal(report.silence.ran, false);
    assert.equal(report.silence.guard, 'absolute-path');
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('a score with no data-audible marks is reported', async () => {
  const dir = await delivery(RENDERER, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline points="10,60 50,45 90,52" fill="none"/></svg>');
  try {
    const report = await silence(dir);
    assert.deepEqual(report.issues, ['Original composition declares no audible marks (data-audible). Mark every sound-producing SVG element.']);
    assert.equal(report.silence.marks, 0);
    assert.equal(report.silence.ran, undefined);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('the delivered audio file is never modified by the silence test', async () => {
  const dir = await delivery();
  try {
    const before = createHash('sha256').update(await fs.readFile(path.join(dir, 'audio.wav'))).digest('hex');
    await silence(dir);
    const after = createHash('sha256').update(await fs.readFile(path.join(dir, 'audio.wav'))).digest('hex');
    assert.equal(after, before);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});
