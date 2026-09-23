#!/usr/bin/env python3
import ast, hashlib, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

svg,code,image,process=map(Path,sys.argv[1:5]); issues=[]; warnings=[]; report={}
try:
 root=ET.parse(svg).getroot(); view=root.get('viewBox'); draw={'path','rect','circle','ellipse','line','polyline','polygon','image'}; marks=[]; stages=set()
 for n in root.iter():
  tag=n.tag.rsplit('}',1)[-1]
  if tag in ('script','foreignObject') or any(k.lower().startswith('on') for k in n.attrib): issues.append('SVG contains executable content.')
  if tag in draw:
   marks.append(n); stage=n.get('data-stage')
   if stage is not None: stages.add(stage)
 if not view: issues.append('Painting SVG needs a viewBox.')
 if len(marks)<3: issues.append('Painting SVG has fewer than three visible marks.')
 if len(stages)<3: issues.append('Painting SVG needs at least three ordered data-stage groups.')
 report['svg']={'visibleMarks':len(marks),'stages':len(stages),'viewBox':view}
except Exception as e: issues.append('SVG parse/structure error: '+str(e))
try:
 source=code.read_text(); ast.parse(source); report['renderer']={'readsSvg':('painting.svg' in source),'readsStages':('data-stage' in source)}
 if 'painting.svg' not in source: issues.append('Renderer does not reference painting.svg.')
 if 'data-stage' not in source: issues.append('Renderer does not consume SVG stage order.')
except Exception as e: issues.append('Renderer Python syntax error: '+str(e))
try:
 with Image.open(image) as im:
  im.verify(); report['image']={'width':im.width,'height':im.height,'sha256':hashlib.sha256(image.read_bytes()).hexdigest()}
  if im.width<64 or im.height<64: issues.append('Painting is too small to inspect.')
except Exception as e: issues.append('Image decode error: '+str(e))
if process.suffix.lower() not in ('.mp4','.gif'): issues.append('Process must be MP4 or GIF.')
report.update(issues=sorted(set(issues)),warnings=sorted(set(warnings)))
print(json.dumps(report))
