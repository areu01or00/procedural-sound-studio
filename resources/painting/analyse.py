#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps, ImageStat
import numpy as np

source=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
im=Image.open(source).convert('RGB'); a=np.asarray(im,dtype=np.float32)/255
lum=.2126*a[:,:,0]+.7152*a[:,:,1]+.0722*a[:,:,2]
small=im.copy(); small.thumbnail((320,320),Image.Resampling.LANCZOS)
quant=small.quantize(colors=8,method=Image.Quantize.MEDIANCUT)
counts=quant.getcolors() or []; palette=quant.getpalette(); total=sum(c for c,_ in counts)
colors=[]
for count,index in sorted(counts,reverse=True):
    rgb=palette[index*3:index*3+3]; colors.append({'hex':'#'+''.join(f'{v:02x}' for v in rgb),'share':round(count/total,4),'rgb':rgb})
edges=ImageOps.autocontrast(im.convert('L').filter(ImageFilter.FIND_EDGES)); edges.save(out/'edges.png')
sw=720; sh=110
parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {sw} {sh}"><rect width="100%" height="100%" fill="#141517"/>']
x=10
for color in colors:
    w=max(20,(sw-20)*color['share']); parts.append(f'<rect x="{x:.1f}" y="10" width="{w:.1f}" height="70" rx="4" fill="{color["hex"]}"/><text x="{x+4:.1f}" y="100" fill="#ddd" font-size="11">{color["hex"]}</text>'); x+=w
parts.append('</svg>'); (out/'palette.svg').write_text(''.join(parts))
gx=np.abs(np.diff(lum,axis=1)).mean(); gy=np.abs(np.diff(lum,axis=0)).mean()
thirds=[]
for row in range(3):
 for col in range(3):
    q=lum[row*im.height//3:(row+1)*im.height//3,col*im.width//3:(col+1)*im.width//3]
    thirds.append({'cell':[col,row],'mean_luminance':round(float(q.mean()),4) if q.size else None,'contrast':round(float(q.std()),4) if q.size else None})
report={'source':source.name,'width':im.width,'height':im.height,'aspect_ratio':round(im.width/im.height,5),'mean_rgb':[round(float(x),4) for x in a.mean(axis=(0,1))], 'mean_luminance':round(float(lum.mean()),4),'luminance_contrast':round(float(lum.std()),4),'edge_energy':{'horizontal':round(float(gx),5) if np.isfinite(gx) else 0,'vertical':round(float(gy),5) if np.isfinite(gy) else 0},'palette':colors,'nine_region_values':thirds,'generated':['edges.png','palette.svg']}
(out/'analysis.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
