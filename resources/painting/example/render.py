#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import xml.etree.ElementTree as ET
import subprocess, random, re, sys

HERE=Path(__file__).parent; SVG=HERE/'painting.svg'; W,H=960,600
root=ET.parse(SVG).getroot(); seed=int(root.get('data-seed','0'))
def tag(n): return n.tag.rsplit('}',1)[-1]
def color(value,opacity=1):
 value=value or '#ffffff'; rgb=tuple(int(value.lstrip('#')[i:i+2],16) for i in (0,2,4)); return (*rgb,int(255*opacity))
def points(value): return [(float(x),float(y)) for x,y in re.findall(r'(-?[\d.]+),(-?[\d.]+)',value or '')]
def paint(max_stage):
 im=Image.new('RGBA',(W,H),(16,25,39,255)); rng=random.Random(seed); d=ImageDraw.Draw(im,'RGBA')
 for n in root.iter():
  if tag(n) not in {'rect','polygon','polyline','line','circle','ellipse'} or int(n.get('data-stage','0'))>max_stage: continue
  o=float(n.get('opacity','1')); fill=color(n.get('fill'),o) if n.get('fill') not in (None,'none') else None; stroke=color(n.get('stroke'),o) if n.get('stroke') not in (None,'none') else None; width=max(1,int(float(n.get('stroke-width','1'))))
  if tag(n)=='rect': d.rectangle((float(n.get('x',0)),float(n.get('y',0)),float(n.get('x',0))+float(n.get('width',0)),float(n.get('y',0))+float(n.get('height',0))),fill=fill)
  elif tag(n)=='polygon': d.polygon(points(n.get('points')),fill=fill)
  elif tag(n)=='polyline':
   pts=points(n.get('points')); d.line(pts,fill=stroke,width=width,joint='curve')
   if n.get('data-brush') in {'wash','glaze'}:
    for _ in range(5):
     off=rng.uniform(-width*.18,width*.18); d.line([(x,y+off) for x,y in pts],fill=(*stroke[:3],max(4,stroke[3]//8)),width=max(1,width//3),joint='curve')
  elif tag(n)=='line':
   xy=(float(n.get('x1')),float(n.get('y1')),float(n.get('x2')),float(n.get('y2'))); d.line(xy,fill=stroke,width=width)
  elif tag(n)=='circle':
   x,y,r=map(float,(n.get('cx'),n.get('cy'),n.get('r'))); d.ellipse((x-r,y-r,x+r,y+r),fill=fill)
  elif tag(n)=='ellipse':
   x,y,rx,ry=map(float,(n.get('cx'),n.get('cy'),n.get('rx'),n.get('ry'))); d.ellipse((x-rx,y-ry,x+rx,y+ry),fill=fill)
 # SVG-declared marks drive composition; this seeded grain is only surface texture.
 grain=Image.effect_noise((W,H),18).convert('L'); veil=Image.new('RGBA',(W,H),(255,241,220,0)); veil.putalpha(grain.point(lambda x:x//11)); return Image.alpha_composite(im,veil).convert('RGB')
for stage in range(6): paint(stage).save(HERE/f'frame-{stage:02d}.png')
paint(99).save(HERE/'painting.png')
subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','0.5','-i',str(HERE/'frame-%02d.png'),'-vf','fps=24,format=yuv420p','-c:v','libx264',str(HERE/'process.mp4')],check=True)
for stage in range(6): (HERE/f'frame-{stage:02d}.png').unlink(missing_ok=True)
