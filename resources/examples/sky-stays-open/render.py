"""Render the pitch ribbons in score.svg. No external assets required."""
from pathlib import Path
import xml.etree.ElementTree as E
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt
P=Path(__file__).resolve().parent

def render():
 root=E.parse(P/'score.svg').getroot(); sr=int(root.get('data-sr')); dur=float(root.get('data-duration')); rng=np.random.default_rng(int(root.get('data-seed')))
 n=int(sr*dur); mix=np.zeros((n,2)); wet=np.zeros_like(mix)
 voices=['metal','air','bell','reed','strings','bass','kick','snare','tick']
 origin=float(root.get('data-time-origin')); scale=float(root.get('data-time-scale'))
 def filt(x,hz,kind):return sosfilt(butter(2,hz,kind,fs=sr,output='sos'),x)
 count=0
 for z in root.iter('{http://www.w3.org/2000/svg}polyline'):
  v=z.get('data-voice'); lane=voices.index(v); xy=np.array([list(map(float,p.split(','))) for p in z.get('points').split()]); times=(xy[:,0]-origin)/scale; pitches=60+(160+lane*73-xy[:,1])/.62
  start=int(round(times[0]*sr)); length=int(round((times[-1]-times[0])*sr)); t=np.arange(length)/sr; d=length/sr
  f=440*2**((np.interp(t,times-times[0],pitches)-69)/12); phase=2*np.pi*np.cumsum(f)/sr; a=float(z.get('data-amp'))
  attack=.008; release=.06; send=.23
  if v=='bell':
   x=sum(g*np.sin(phase*r)*np.exp(-t/(d*c)) for r,g,c in [(1,1,.43),(2,.3,.21),(2.997,.14,.12),(4,.035,.08)])
   x+=filt(rng.normal(size=length),3500,'lowpass')*.022*np.exp(-t*70);send=.42
  elif v=='metal':
   x=sum(np.sin(phase*r+j)*np.exp(-t/(d*(.2+.06*j)))/(1+j) for j,r in enumerate([1,1.413,2.09,2.71,3.89,5.17])); x=filt(x,5400,'lowpass');send=.5
  elif v=='reed':
   ph=phase+.018*np.sin(2*np.pi*5.2*t)*np.minimum(t/.3,1)
   x=sum(np.sin(ph*k)*(.57**(k-1))/k for k in range(1,8)); x*=.85+.15*np.sin(np.pi*t/d);attack=.018;release=.09;send=.19
  elif v=='strings':
   x=np.zeros(length)
   for cents in [-7,0,6]:
    ph=phase*2**(cents/1200)+.025*np.sin(2*np.pi*(4.7+cents*.04)*t)
    x+=sum(np.sin(ph*k+.3*k)/(k**1.65) for k in range(1,9))/3
   attack=.35;release=.6;send=.35
  elif v=='bass':
   x=np.sin(phase)+.22*np.sin(phase*2)+.08*np.sin(phase*3);x*=np.exp(-t/(d*.7));attack=.015;release=.14;send=.035
  elif v=='kick':
   hz=46+112*np.exp(-t*33);ph=2*np.pi*np.cumsum(hz)/sr;x=np.sin(ph)*np.exp(-t*13)+.07*filt(rng.normal(size=length),1900,'lowpass')*np.exp(-t*120);attack=.002;send=.04
  elif v=='snare':
   noise=filt(rng.normal(size=length),1400,'highpass');x=.55*noise*np.exp(-t*24)+.28*np.sin(2*np.pi*183*t)*np.exp(-t*32);attack=.002;send=.18
  elif v=='tick':
   x=filt(rng.normal(size=length),6800,'highpass')*.45*np.exp(-t*65);attack=.001;release=.014;send=.12
  else:
   noise=filt(rng.normal(size=length),2600,'lowpass');noise=filt(noise,350,'highpass');x=noise*(.5+.5*np.sin(phase*.013)**2);attack=min(1,d*.4);release=min(1.4,d*.5);send=.65
  env=np.minimum(t/max(attack,1/sr),1)*np.minimum((d-t)/max(release,1/sr),1);env=np.sin(np.clip(env,0,1)*np.pi/2)**2
  duck=float(z.get('data-duck','0')); beat=float(root.get('data-beat','0.5'))
  pump=1-duck*np.exp(-np.mod(t+times[0],beat)/.105)
  x=x*env*a*pump
  pan=np.linspace(float(z.get('data-pan')),float(z.get('data-end-pan')),length);st=x[:,None]*np.stack([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)],axis=1)
  end=min(start+length,n); mix[start:end]+=st[:end-start]; wet[start:end]+=st[:end-start]*send;count+=1
 # Shared diffuse tail, with staggered cross-channel reflections and darkening.
 wet=np.column_stack([filt(wet[:,c],4700,'lowpass') for c in range(2)])
 for j,delay in enumerate([.071,.113,.179,.263,.389,.547,.733,1.013,1.337,1.711,2.113,2.617,3.13]):
  shift=int(delay*sr);mix[shift:]+=wet[:-shift,::-1 if j%2 else 1]*(.33*np.exp(-delay/1.2))
 # Gentle global fade only at outer boundaries. Preserve section dynamics.
 mix-=mix.mean(axis=0);fade=int(.8*sr);mix[-fade:]*=np.linspace(1,0,fade)[:,None];mix[:220]*=np.linspace(0,1,220)[:,None]
 assert np.isfinite(mix).all()
 mix*=.84/max(np.max(np.abs(mix)),1e-9)
 sf.write(P/'audio.wav',mix,sr,subtype='PCM_24')
 check,rate=sf.read(P/'audio.wav');assert rate==sr and check.shape==(n,2) and np.isfinite(check).all() and np.max(np.abs(check))<.85
 print({'events':count,'duration_seconds':len(check)/sr,'sample_rate':sr,'peak':float(np.max(np.abs(check))),'rms':float(np.sqrt(np.mean(check**2)))})
if __name__=='__main__':render()
