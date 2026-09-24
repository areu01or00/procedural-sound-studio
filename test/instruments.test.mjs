import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PYTHON } from '../server/python.mjs';
const run = promisify(execFile), root = fileURLToPath(new URL('..', import.meta.url));
const python = PYTHON;

test('gm.py: empty score is silence; notes sound; renders are deterministic; >15 channel groups split cleanly', async () => {
  const script = `
import json, numpy as np
from gm import render_notes, GM, DRUMS
out = {}
out['empty_peak'] = float(np.abs(render_notes([], 2.0)).max())
ev = [dict(program=GM['flute'], pitch=72 + i, start=i * .25, dur=.24, vel=.8, pan=-.5) for i in range(6)]
ev += [dict(program='drums', pitch=DRUMS['kick'], start=0, dur=.2, vel=.9)]
a, b = render_notes(ev, 2.0), render_notes(ev, 2.0)
out['peak'] = float(np.abs(a).max()); out['same'] = bool(np.array_equal(a, b)); out['frames'] = len(a)
many = [dict(program=p, pitch=60, start=0, dur=.5, vel=.6, pan=(p % 5 - 2) / 2) for p in range(40)]
out['many_peak'] = float(np.abs(render_notes(many, 1.0)).max())
print(json.dumps(out))`;
  const { stdout } = await run(python, ['-c', script], { cwd: `${root}resources/instruments`, timeout: 60000 });
  const r = JSON.parse(stdout);
  assert.equal(r.empty_peak, 0); assert.ok(r.peak > 0.01, JSON.stringify(r)); assert.equal(r.same, true);
  assert.equal(r.frames, Math.round(5.0 * 44100)); assert.ok(r.many_peak > 0.01);
});
