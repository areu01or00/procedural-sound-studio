from pathlib import Path
import math, random

out=Path(__file__).parent/'painting.svg'; random.seed(17); W,H=960,600
p=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" data-seed="1709">',f'<rect data-stage="0" x="0" y="0" width="{W}" height="{H}" fill="#101927"/>']
# Stage 1: broad dusk atmosphere.
for i,(c,o) in enumerate([('#263d58',.65),('#445d70',.38),('#b16f61',.22)]):
 y=60+i*95; pts=' '.join(f'{x},{y+22*math.sin(x/170+i)}' for x in range(-40,W+80,80)); p.append(f'<polyline data-stage="1" data-brush="wash" points="{pts}" fill="none" stroke="{c}" stroke-width="150" opacity="{o}"/>')
# Stage 2: distant ridges and water mass.
for j,(base,c) in enumerate([(330,'#26364a'),(390,'#17283a'),(450,'#101d2c')]):
 pts=[(-20,H),( -20,base)]+[(x,base-45*math.sin(x/125+j)-random.randint(0,35)) for x in range(0,W+80,70)]+[(W+20,H)]
 p.append(f'<polygon data-stage="2" points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="{c}" opacity=".96"/>')
p.append('<rect data-stage="2" x="0" y="442" width="960" height="158" fill="#132b39"/>')
# Stage 3: aurora ribbons, their repeated paths establish the main gesture.
for j,c in enumerate(['#62d6ba','#a7e9c6','#6db5d4','#d9b3da']):
 pts=[]
 for x in range(-20,1000,32):
  y=155+j*30+42*math.sin(x/125+j*.9)+16*math.sin(x/43+j)
  pts.append(f'{x},{y:.1f}')
 p.append(f'<polyline data-stage="3" data-brush="glaze" points="{" ".join(pts)}" fill="none" stroke="{c}" stroke-width="{26-j*3}" opacity="{.34-j*.035}"/>')
# Stage 4: reflections and tree rhythm.
for x in range(40,960,27):
 top=455+random.randint(-8,12); length=random.randint(25,110); c=random.choice(['#4cb4aa','#8ed4bd','#b17485','#5f9db2'])
 p.append(f'<line data-stage="4" data-brush="dry" x1="{x}" y1="{top}" x2="{x+random.randint(-7,7)}" y2="{min(590,top+length)}" stroke="{c}" stroke-width="{random.randint(2,7)}" opacity=".42"/>')
for x in list(range(15,215,20))+list(range(760,955,18)):
 top=random.randint(325,405); p.append(f'<polygon data-stage="4" points="{x},455 {x+random.randint(7,13)},455 {x+5},{top}" fill="#07131a" opacity=".92"/>')
# Stage 5: stars, shore light and finishing accents.
for _ in range(54):
 x=random.randint(25,935); y=random.randint(25,280); r=random.choice([.8,1,1.2,1.8]); p.append(f'<circle data-stage="5" cx="{x}" cy="{y}" r="{r}" fill="#e9eee5" opacity="{random.uniform(.35,.9):.2f}"/>')
p.extend(['<ellipse data-stage="5" cx="633" cy="366" rx="9" ry="4" fill="#f2c786"/>','<polyline data-stage="5" data-brush="light" points="610,459 632,456 658,460" fill="none" stroke="#f0c07a" stroke-width="5" opacity=".75"/>','<text data-stage="5" x="28" y="572" fill="#bdc7c8" font-size="12" font-family="monospace">AURORA STUDY · six cumulative passes</text>','</svg>'])
out.write_text('\n'.join(p))
