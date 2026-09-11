"""Compare saved foreground pitches using identical neutral synthesis, not a quality score."""
from pathlib import Path
import json, xml.etree.ElementTree as E
import numpy as np
import soundfile as sf
P=Path(__file__).resolve().parent
D=P.parents[1]/'.studio'
NS='{http://www.w3.org/2000/svg}'
E.register_namespace('',NS[1:-1])
def write(name,events):
 root=E.Element(NS+'svg',viewBox='0 0 1000 300')
 E.SubElement(root,NS+'metadata',id='notes').text=json.dumps(events)
 E.SubElement(root,NS+'rect',width='1000',height='300',fill='#101923')
 E.SubElement(root,NS+'text',x='20',y='25',fill='white').text=name+' — neutral foreground probe, 16 seconds'
 for t,d,p in events:
  E.SubElement(root,NS+'rect',x=str(30+t*58),y=str(265-(p-48)*5),width=str(max(1,d*58)),height='4',fill='#ffc583')
 dest=P/(name+'.svg');E.ElementTree(root).write(dest,encoding='utf-8',xml_declaration=True)
 # Decode the saved representation, use identical voice and fixed gain in both arms.
 events=json.loads(E.parse(dest).find(NS+'metadata').text)
 sr=24000;out=np.zeros(16*sr)
 for onset,dur,pitch in events:
  start=round(onset*sr);n=min(round(dur*sr),len(out)-start)
  if n<=0:continue
  t=np.arange(n)/sr;phase=2*np.pi*440*2**((pitch-69)/12)*t
  env=np.minimum(t/.02,1)*np.clip((n/sr-t)/.08,0,1)
  out[start:start+n]+=.12*(np.sin(phase)+.15*np.sin(phase*2))*env
 assert np.isfinite(out).all() and np.max(abs(out))<1
 sf.write(P/(name+'.wav'),out,sr,subtype='PCM_24')
 return {'notes':len(events),'duration':16,'peak':float(np.max(abs(out)))}
r=E.parse(D/'ace695d0-4d52-4c47-b60d-0179e6f19fb0/score.svg').getroot();sky=[]
for e in r.iter(NS+'polyline'):
 if e.get('data-voice')!='bell':continue
 xy=[list(map(float,p.split(','))) for p in e.get('points').split()]
 t=(xy[0][0]-float(r.get('data-time-origin')))/float(r.get('data-time-scale'))
 if 7.2-1e-6<=t<23.2:
  sky.append([max(0,t-7.2),(xy[-1][0]-xy[0][0])/float(r.get('data-time-scale')),60+(306-xy[0][1])/.62])
r=E.parse(D/'f8609379-d4c6-44da-82f0-b836ed074597/score.svg')
s=json.loads(r.find('.//'+NS+'metadata[@id="composition"]').text)
pelagic=[[e['t']-11.3,e['d'],e['note']] for e in s['events'] if e['role']=='brass' and 11.3<=e['t']<27.3]
report={'sky':write('sky',sky),'pelagic':write('pelagic',pelagic),'scope':'Saved lead notes with identical neutral voice; not original mix, not a musical-quality metric. Different passages/harmonies are confounds.'}
(P/'comparison.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
