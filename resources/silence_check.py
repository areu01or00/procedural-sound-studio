"""Executable provenance check: remove every data-audible mark from a TEMPORARY
copy of the delivery, run the renderer on that empty score inside bubblewrap, and
require finite silence. Generated code never runs unsandboxed, the real delivery
directory is never modified, and nothing outside the copy is writable."""
import json
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as E
from pathlib import Path

import numpy as np
import soundfile as sf

if len(sys.argv) < 5:
    print(json.dumps({'issues': ['usage: silence_check.py <version_dir> <svg_name> <code_name> <audio_name>'], 'warnings': [], 'silence': {}}))
    raise SystemExit(0)
version, svg_name, code_name, wav_name = Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
svg, code = version / svg_name, version / code_name
issues, warnings, silence = [], [], {}
local = lambda e: e.tag.rsplit('}', 1)[-1]
drawable = {'rect', 'path', 'polyline', 'polygon', 'line', 'circle', 'ellipse', 'use'}


def done():
    print(json.dumps({'issues': issues, 'warnings': warnings, 'silence': silence}))
    raise SystemExit(0)


def concealed(node, in_definitions):
    # Mirrors check_output.py: display/visibility style equivalents, opacity="0", definitions containers.
    style = node.get('style', '').replace(' ', '').lower()
    return in_definitions or node.get('display') == 'none' or node.get('visibility') == 'hidden' \
        or 'display:none' in style or 'visibility:hidden' in style or node.get('opacity') == '0'


try:
    raw = svg.read_text()
    if '<!DOCTYPE' in raw.upper() or '<!ENTITY' in raw.upper():
        raise ValueError('DTD/entity declarations are not supported')
    root = E.fromstring(raw)
except Exception as e:
    issues.append('SVG parse/structure error: ' + str(e))
    done()

audible, parents = [], {c: p for p in root.iter() for c in p}


def visit(node, hidden=False, definitions=False):
    definitions = definitions or local(node) in ('defs', 'metadata', 'clipPath', 'mask', 'symbol')
    hidden = concealed(node, hidden or definitions)
    if node.get('data-audible') not in (None, 'false'):
        audible.append((node, hidden))
    for child in node:
        visit(child, hidden, definitions)


visit(root)
silence['marks'] = len(audible)
if not audible:
    issues.append('Original composition declares no audible marks (data-audible). Mark every sound-producing SVG element.')
    done()
for node, hidden in audible:
    if local(node) not in drawable:
        issues.append(f'Audio is declared on a non-drawable <{local(node)}> element; data-audible belongs on a drawable mark.')
    if hidden:
        issues.append(f'Audible <{local(node)}> element is hidden or inside definitions; audible marks must be visible geometry.')

try:
    source = code.read_text()
except Exception as e:
    issues.append('Renderer unreadable: ' + str(e))
    done()
if str(version) in source:
    issues.append('Renderer hardcodes the absolute delivery path; write outputs relative to its own file.')
    silence['ran'] = False
    silence['guard'] = 'absolute-path'
    done()
bwrap = '/usr/bin/bwrap'
if not Path(bwrap).is_file():
    warnings.append('Silence test skipped: bubblewrap unavailable; generated code is never run unsandboxed.')
    silence['ran'] = False
    done()

with tempfile.TemporaryDirectory() as tmp:
    copy = Path(tmp) / 'delivery'
    shutil.copytree(version, copy, ignore=shutil.ignore_patterns(wav_name))  # local helpers come along; delivered audio does not
    E.register_namespace('', 'http://www.w3.org/2000/svg')
    for node, _ in audible:
        parent = parents.get(node)
        if parent is not None:
            parent.remove(node)
    E.ElementTree(root).write(copy / svg_name, encoding='unicode', xml_declaration=True)
    mpl = copy / '.mpl'
    mpl.mkdir(exist_ok=True)
    started = time.monotonic()
    cmd = [bwrap, '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp',
           '--bind', str(copy), str(copy), '--unshare-net', '--die-with-parent', '--chdir', str(copy),
           'env', 'MPLCONFIGDIR=' + str(mpl), sys.executable, code_name]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        warnings.append('Silence test inconclusive: renderer exceeded the 180 s sandbox timeout on an empty score.')
        silence['ran'] = False
        silence['timedOut'] = True
        done()
    silence['ran'] = True
    silence['seconds'] = round(time.monotonic() - started, 2)
    if proc.returncode:
        issues.append('Renderer failed on the score with all audible marks removed; it must handle an empty score and write finite silence.')
        silence['stderrTail'] = (proc.stderr or '')[-400:]
        done()
    out = copy / wav_name
    if not out.is_file():
        issues.append(f'Renderer did not write {wav_name} for an empty score; it must write finite silence when every data-audible mark is removed.')
        done()
    try:
        audio = sf.read(out, always_2d=True)[0]
    except Exception as e:
        issues.append('Renderer output is not decodable audio: ' + str(e))
        done()
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    silence['peak'] = peak if np.isfinite(peak) else None  # JSON has no NaN/Infinity
    if not np.isfinite(audio).all():
        issues.append('Renderer produced non-finite audio for an empty score (guard peak normalisation against division by zero).')
    elif peak > 1e-4:
        issues.append(f'Sound remains after removing every data-audible mark (peak {peak:.4g}). Audible content originates outside the declared visible score.')
done()
