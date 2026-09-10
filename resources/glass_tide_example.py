"""Executable SVG score: original 40-second broken-beat miniature."""
from pathlib import Path
import xml.etree.ElementTree as E
import numpy as np
from scipy import signal
from scipy.io import wavfile
import subprocess, json
OUT=Path(__file__).resolve().parent/'glass_tide_output'
OUT.mkdir(parents=True,exist_ok=True)
SR=32000; DUR=40; NS='http://www.w3.org/2000/svg'
E.register_namespace('',NS)
r=E.Element('{%s}svg'%NS,viewBox='0 0 1440 800',width='1440',height='800')
def el(tag,**a): return E.SubElement(r,'{%s}%s'%(NS,tag),{k.replace('_','-'):str(v) for k,v in a.items()})
def txt(x,y,s,size=16,color='#c9d6df'):
    z=el('text',x=x,y=y,fill=color,font_family='sans-serif',font_size=size);z.text=s
el('rect',width=1440,height=800,fill='#101e27')
txt(45,42,'GLASS TIDE / an executable SVG composition',28)
txt(45,72,'Droplets → broken beat → suspended time → transformed return / 120 BPM / 40 seconds')
voices=['glass','bass','kick','snare','hat','pad','pluck','riser']
colors=['#83eee8','#f1bb6c','#ed777e','#d693b7','#ddd4a3','#849be0','#a9d978','#b6bfd0']
for i,v in enumerate(voices):
    y=145+i*73
    el('line',x1=100,x2=1400,y1=y+30,y2=y+30,stroke='#30414a');txt(12,y,v,13)
for t,s in [(0,'DROPLETS'),(8,'BROKEN BEAT'),(16,'SUSPENSION'),(24,'HALFTIME / RETURN'),(32,'LIFT / RESOLVE')]:
    x=110+32*t;txt(x,108,s,12)
    el('line',x1=x,x2=x,y1=120,y2=738,stroke='#38505c')
for t in range(0,41,4):txt(110+32*t,775,str(t)+'s',12)
def event(t,d,p,voice,a=.5,pan=0):
    idx=voices.index(voice);p=p if isinstance(p,list) else [p,p]
    # Each lane shares the same local pitch scale: 1 px = 1 semitone.
    pts=' '.join(f'{110+32*(t+d*j/(len(p)-1)):.4f},{145+idx*73+(60-n):.4f}' for j,n in enumerate(p))
    el('polyline',points=pts,fill='none',stroke=colors[idx],stroke_width=1+a*6,
       stroke_linecap='round',data_voice=voice,data_pan=pan)
# Memorable original pentatonic motif with an occasional major seventh.
motif=[74,78,81,85,83,78,76,73]
chords=[[50,57,61,66],[47,54,57,61],[43,50,54,59],[45,52,59,61]]
for bar in range(20):
    t=bar*2; chord=chords[(bar//2)%4]
    quiet=8<=bar<12
    for j,p in enumerate(chord[1:]):event(t,2.6,p,'pad',.25 if quiet else .16,(j-1)*.65)
    if bar<4:
        for j,o in enumerate([.0,.67,1.25]):event(t+o,.7,motif[(bar*2+j)%8],'glass',.45,(-1)**j*.5)
        if bar>1:event(t,1.4,[chord[0]-12,chord[0]-12],'bass',.3)
    elif quiet:
        event(t+.15,1.7,[motif[(bar-8)*2],motif[(bar-8)*2]+.15],'glass',.38,-.4)
        event(t+.9,1.0,motif[((bar-8)*2+3)%8]-12,'pluck',.32,.5)
    else:
        half=12<=bar<16
        for o in ([0,1.65] if half else [0,.75,1.5]):event(t+o,.26,[43,25],'kick',.85)
        for o in ([1] if half else [.5,1.5]):event(t+o,.19,60,'snare',.5)
        for j in range(8):
            if half and j%2:continue
            event(t+j*.25+(0.035 if j%2 else 0),.07,96,'hat',.18 if j%2 else .28,(-1)**j*.45)
        for j,o in enumerate([0,.7,1.25,1.75]):
            p=chord[0]-12+(12 if j==2 else 0)
            event(t+o,.23 if j!=3 else .36,[p+(.0 if j<3 else 7),p,p],'bass',.55)
        for j,o in enumerate([.15,.85,1.4]):
            p=motif[(bar*2+j)%8]+(12 if bar>=16 else 0)
            event(t+o,.48,p,'glass',.34,(-1)**j*.55)
        for j,o in enumerate([.35,1.1]):event(t+o,.34,chord[1+j]+12,'pluck',.3,(-1)**j*.65)
for t in [7,23,31]:event(t,.9,[65,94],'riser',.25)
event(38,1.9,86,'glass',.55,.1)
svg=OUT/'glass_tide.svg';E.ElementTree(r).write(svg,encoding='utf-8',xml_declaration=True)

def render(path):
    rng=np.random.default_rng(27);mix=np.zeros((DUR*SR,2));counts={v:0 for v in voices}
    for z in E.parse(path).getroot().iter('{%s}polyline'%NS):
        v=z.get('data-voice');idx=voices.index(v)
        pts=np.array([[float(n) for n in p.split(',')] for p in z.get('points').split()])
        times=(pts[:,0]-110)/32;pitches=60+145+idx*73-pts[:,1]
        start=round(times[0]*SR);end=min(DUR*SR,round(times[-1]*SR))
        assert 0<=start<end
        t=np.arange(end-start)/SR;d=len(t)/SR
        hz=440*2**((np.interp(t,times-times[0],pitches)-69)/12)
        phase=2*np.pi*np.cumsum(hz)/SR
        a=(float(z.get('stroke-width'))-1)/6;pan=float(z.get('data-pan'))
        release=np.minimum(1,(d-t)/min(.06,d*.3));attack=np.minimum(1,t/.004)
        if v=='glass':
            wave=(np.sin(phase+2.1*np.exp(-t*8)*np.sin(phase*2))+.22*np.sin(phase*3.01)*np.exp(-t*9))*np.exp(-t*3.5)
        elif v=='bass':
            wave=(np.sin(phase+.75*np.exp(-t*12)*np.sin(phase))+.18*np.sin(2*phase))*np.exp(-t*3)
        elif v=='kick':wave=np.sin(phase)*np.exp(-t*19)+.08*rng.normal(size=len(t))*np.exp(-t*130)
        elif v=='snare':
            noise=signal.sosfilt(signal.butter(2,[1100,9000],btype='bandpass',fs=SR,output='sos'),rng.normal(size=len(t)))
            wave=(noise*.65+np.sin(phase)*.22)*np.exp(-t*24)
        elif v=='hat':
            noise=signal.sosfilt(signal.butter(2,6500,btype='highpass',fs=SR,output='sos'),rng.normal(size=len(t)))
            wave=noise*np.exp(-t*65)
        elif v=='pad':
            wave=sum(np.sin(phase*k+(.25*np.sin(t*1.7+k)))/k**1.8 for k in range(1,7))
            attack=np.minimum(1,t/.45);release=np.minimum(1,(d-t)/.7)
        elif v=='pluck':wave=sum(np.sin(k*phase)*np.exp(-t*(6+k*2))/k**1.1 for k in range(1,9))
        else:
            wave=signal.sosfilt(signal.butter(2,2200,fs=SR,output='sos'),rng.normal(size=len(t)))*.4+np.sin(phase)*.15
            attack=(t/d)**2
        wave*=a*attack*release*.38
        mix[start:end,0]+=wave*np.sqrt((1-pan)/2);mix[start:end,1]+=wave*np.sqrt((1+pan)/2)
        counts[v]+=1
    dry=mix.copy()
    for delay,gain in [(.1875,.16),(.375,.10),(.5625,.06)]:
        n=int(delay*SR);mix[n:]+=dry[:-n,::-1]*gain
    mix[-int(.6*SR):]*=np.linspace(1,0,int(.6*SR))[:,None]
    peak=np.abs(mix).max();mix*=.9/max(peak,1e-9)
    return mix,counts
mix,counts=render(svg)
wav=OUT/'glass_tide.wav';wavfile.write(wav,SR,(mix*32767).astype(np.int16))
subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-q:a','2',str(OUT/'glass_tide.mp3')],check=True)
sr,check=wavfile.read(wav);assert check.shape==(SR*DUR,2) and np.isfinite(mix).all() and np.abs(check.astype(float)).max()<32767
(OUT/'validation.json').write_text(json.dumps({'duration':DUR,'voices':counts,'peak':float(np.abs(mix).max()),'section_rms':[float(np.sqrt(np.mean(mix[t*SR:(t+8)*SR]**2))) for t in range(0,40,8)],'pipeline':'saved SVG -> synthesis -> stereo WAV; no spectrogram'},indent=2))
(OUT/'README.md').write_text('Glass Tide: original 40-second composition, 120 BPM. SVG x coordinates encode time, lane-relative y encodes pitch (one pixel per semitone), stroke width amplitude, voice and pan attributes select synthesis and position. Renderer parses saved SVG. Eight synthetic voices, five sections, shuffled rhythm and halftime transformation. No samples, TTS, spectrogram, or Griffin-Lim. This is a range demonstration, not a controlled proof that SVG improves music. Run scripts/make_glass_tide_svg.py to regenerate.\n')
print(json.dumps({'output':str(OUT),'voices':counts,'duration':DUR}))
