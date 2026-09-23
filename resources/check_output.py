"""Trusted read-only checks for generated artifacts. Never executes generated code."""
import ast
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as E
import numpy as np
import soundfile as sf

svg, code, wav = map(Path, sys.argv[1:4])
workflow = sys.argv[4] if len(sys.argv) > 4 else 'reference'
issues, warnings = [], []
report = {'issues': issues, 'warnings': warnings}
try:
    raw = svg.read_text()
    if '<!DOCTYPE' in raw.upper() or '<!ENTITY' in raw.upper():
        raise ValueError('DTD/entity declarations are not supported')
    root = E.fromstring(raw)
    if root.tag != '{http://www.w3.org/2000/svg}svg':
        raise ValueError('Root must be svg in the SVG namespace')
    local = lambda e: e.tag.rsplit('}', 1)[-1]
    drawable = {'rect','path','polyline','polygon','line','circle','ellipse','image','use'}
    custom_events, visible_events, embedded_images, timed, metadata_nodes = [], [], [], [], []
    def visit(node, semantic=False, hidden=False, definitions=False):
        tag = local(node)
        style = node.get('style', '').replace(' ', '').lower()
        hidden = hidden or node.get('display') == 'none' or node.get('visibility') == 'hidden' or 'display:none' in style or 'visibility:hidden' in style or node.get('opacity') == '0'
        definitions = definitions or tag in ('defs','metadata','clipPath','mask','symbol')
        if tag == 'metadata': metadata_nodes.append(node)
        semantic = semantic or any(k in node.attrib for k in ('data-role','data-voice','data-t','data-time','data-pitch','data-amplitude','data-energy'))
        if tag in ('script', 'foreignObject') or any(k.lower().startswith('on') for k in node.attrib):
            issues.append('SVG contains executable script/HTML/event handlers; use a passive image score.')
        for attr, value in node.attrib.items():
            if attr.rsplit('}',1)[-1] == 'href' and value and not value.startswith(('#','data:image/png;base64,','data:image/jpeg;base64,')):
                issues.append('SVG has external linked content; use local embedded imagery or inline geometry.')
        if not hidden and not definitions:
            if tag == 'event': custom_events.append(node)
            if tag in drawable and semantic: visible_events.append(node)
            if tag == 'image': embedded_images.append(node)
            if tag in drawable and 'data-t' in node.attrib and 'data-d' in node.attrib:
                try: timed.append((float(node.get('data-t')), float(node.get('data-d'))))
                except ValueError: issues.append('Visible event has invalid numeric timing.')
        for child in node: visit(child, semantic, hidden, definitions)
    visit(root)
    if custom_events and not visible_events and not embedded_images:
        issues.append('Musical data uses non-rendering <event> elements with no visible event representation. Draw real SVG marks or an accurate preview; preserve the sound.')
    # Empty or metadata-only documents cannot provide Studio's score display.
    visible_tags = [local(n) for n in root.iter() if local(n) in drawable]
    if not visible_tags or (len(visible_tags) == 1 and visible_tags[0] == 'rect' and not visible_events):
        issues.append('SVG has no score graphics beyond a background or metadata.')
    if workflow == 'generation':
        if metadata_nodes:
            issues.append('Original composition stores data in SVG metadata. Move every musical event into visible SVG marks; attributes attached to those marks may carry non-geometric controls.')
        if embedded_images:
            warnings.append('Original composition includes an image. Verify it is decorative and that all audible events remain editable visible SVG geometry.')
        if not visible_events:
            issues.append('Original composition has no visible semantic event marks. The complete audible arrangement must originate from rendered SVG geometry.')
    view = root.get('viewBox')
    if view:
        box = list(map(float, view.replace(',', ' ').split()))
        if len(box) != 4 or not np.isfinite(box).all() or min(box[2:]) <= 0:
            issues.append('SVG viewBox must have finite positive width and height.')
    sections = []
    for node in root.iter():
        if local(node) == 'section' and node.get('t') and node.get('d'):
            sections.append(float(node.get('t'))+float(node.get('d')))
    if timed and sections and max(t+d for t,d in timed) < max(sections)*.25:
        warnings.append('Visible timed marks cover only an early pattern while sections extend much longer. Verify a clearly labeled motif bank plus repeat schedule, or draw the full arrangement.')
    report['svg'] = {'customEvents':len(custom_events),'visibleEventMarks':len(visible_events),'images':len(embedded_images),'metadataNodes':len(metadata_nodes),'workflow':workflow}
except Exception as e:
    issues.append('SVG parse/structure error: '+str(e))
try:
    source = code.read_text()
    tree = ast.parse(source, filename=code.name)
    if workflow == 'generation':
        strings = {n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)}
        reads_svg = any('score.svg' in s for s in strings)
        geometry = {'points','d','x','y','x1','x2','y1','y2','cx','cy','r','width','height'}
        reads_geometry = bool(strings & geometry) or ('.attrib' in source and any(x in source for x in ('polyline','path','rect','circle','line')))
        report['renderer'] = {'readsScoreSvg':reads_svg,'readsVisibleGeometry':reads_geometry}
        if not reads_svg:
            issues.append('Original-composition renderer does not reference score.svg; the saved SVG must be the executable score.')
        if not reads_geometry:
            issues.append('Original-composition renderer does not visibly decode SVG geometry. Derive event timing/pitch/gesture from rendered marks rather than a Python-held arrangement.')
except Exception as e:
    issues.append('Renderer Python syntax error: '+str(e))
try:
    with sf.SoundFile(wav) as f:
        info = {'frames':len(f),'sampleRate':f.samplerate,'channels':f.channels,'duration':len(f)/f.samplerate}
        peak, energy, count, finite = 0., 0., 0, True
        for a in f.blocks(blocksize=65536, dtype='float64', always_2d=True):
            finite = finite and bool(np.isfinite(a).all())
            if not finite: break
            peak = max(peak,float(np.max(abs(a)))); energy += float(np.sum(a*a)); count += a.size
        info.update(peak=peak,rms=float(np.sqrt(energy/max(count,1))),finite=finite)
        report['audio'] = info
        if not finite: issues.append('WAV contains NaN or infinity.')
        if not count or peak < 1e-9: issues.append('WAV is empty or silent.')
        if peak > 1: warnings.append('Audio exceeds digital full scale; preserve only if intentional source reconstruction, otherwise leave headroom.')
except Exception as e:
    issues.append('WAV decoding error: '+str(e))
print(json.dumps(report))
