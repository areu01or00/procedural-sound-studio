"""Deterministic excerpt -> spectrogram + spectral SVG -> verified reconstruction."""
from pathlib import Path
import base64
import hashlib
import io
import json
import shutil
import sys
import xml.etree.ElementTree as ET
import numpy as np
from scipy import signal
import soundfile as sf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from render import decode

out = Path(sys.argv[1])
audio, sr = sf.read(out/'original.wav', always_2d=True, dtype='float32')
if not (0 < len(audio) <= sr*120) or not np.isfinite(audio).all():
    raise ValueError('Invalid or oversized excerpt')
if np.max(np.abs(audio)) < 1e-8:
    raise ValueError('Selected excerpt is silent. Choose another passage.')
nfft, hop = min(2048, len(audio)), min(1024, len(audio)//2)
f, t, _ = signal.stft(audio[:, 0], fs=sr, nperseg=nfft, noverlap=nfft-hop)
z = np.stack([signal.stft(c, fs=sr, nperseg=nfft, noverlap=nfft-hop)[2] for c in audio.T]).astype(np.complex64)
mag = np.mean(np.abs(z), axis=0)
fig, axes = plt.subplots(2, 1, figsize=(13, 5.5), gridspec_kw={'height_ratios':[1,3]}, layout='constrained')
fig.patch.set_facecolor('#17191c')
for ax in axes:
    ax.set_facecolor('#17191c'); ax.tick_params(colors='#d8e5e4'); ax.xaxis.label.set_color('#d8e5e4'); ax.yaxis.label.set_color('#d8e5e4')
step = max(1, len(audio)//10000)
axes[0].plot(np.arange(len(audio))[::step]/sr, audio[::step, 0], color='#a5dfcc', linewidth=.5)
axes[0].set_ylabel('Amplitude')
axes[1].pcolormesh(t, f, 20*np.log10(np.maximum(mag, 1e-8)), shading='auto', cmap='magma', vmin=-90, vmax=-15, rasterized=True)
axes[1].set_ylim(30, sr/2); axes[1].set_yscale('log'); axes[1].set_ylabel('Frequency / Hz'); axes[1].set_xlabel('Seconds from excerpt start')
fig.savefig(out/'spectrogram.png', dpi=110); plt.close(fig)

packed = io.BytesIO()
np.savez_compressed(packed, z=z, sr=sr, nfft=nfft, hop=hop, samples=len(audio))
ns = 'http://www.w3.org/2000/svg'; ET.register_namespace('', ns)
root = ET.Element(f'{{{ns}}}svg', {'width':'1430','height':'655','viewBox':'0 0 1430 655','data-representation':'complex-stft-v1'})
ET.SubElement(root, f'{{{ns}}}title').text = 'Spectral reconstruction baseline'
ET.SubElement(root, f'{{{ns}}}desc').text = 'Full complex STFT coefficients preserve magnitude and phase. Preview shows mean channel magnitude. This is not a semantic note score.'
ET.SubElement(root, f'{{{ns}}}metadata', {'id':'spectrum','encoding':'base64-npz-complex64'}).text = base64.b64encode(packed.getvalue()).decode('ascii')
ET.SubElement(root, f'{{{ns}}}metadata', {'id':'edits'}).text = json.dumps({'gain_db':0, 'bands':[]})
ET.SubElement(root, f'{{{ns}}}rect', {'width':'1430','height':'655','fill':'#17191c'})
ET.SubElement(root, f'{{{ns}}}image', {'x':'0','y':'0','width':'1430','height':'605','href':'data:image/png;base64,'+base64.b64encode((out/'spectrogram.png').read_bytes()).decode('ascii')})
ET.SubElement(root, f'{{{ns}}}text', {'x':'25','y':'635','fill':'#a5dfcc','font-size':'17'}).text = 'Spectral SVG / magnitude + phase / editable gain and time-frequency regions / stereo preserved'
ET.ElementTree(root).write(out/'score.svg', encoding='utf-8', xml_declaration=True)
shutil.copyfile(Path(__file__).with_name('render.py'), out/'render.py')
reconstructed, _ = decode(out/'score.svg')
sf.write(out/'reconstruction.wav', reconstructed, sr, subtype='FLOAT')
# Verify the saved decoded WAV, rather than just an in-memory round trip.
check, _ = sf.read(out/'reconstruction.wav', always_2d=True)
error = audio.astype(np.float64)-check
snr = float(10*np.log10(max(np.sum(audio.astype(np.float64)**2),1e-30)/max(np.sum(error**2),1e-30)))
if snr < 100:
    raise ValueError(f'Reconstruction fidelity check failed: {snr:.2f} dB SNR')
frames = []
for start in range(0, len(audio), sr):
    block = audio[start:start+sr]
    frames.append({'start':start/sr,'rms':float(np.sqrt(np.mean(block**2)))})
energy = mag**2
centroid = np.sum(f[:,None]*energy,axis=0)/np.maximum(np.sum(energy,axis=0),1e-30)
flux = np.maximum(np.diff(mag,axis=1),0).sum(axis=0)
onsets, _ = signal.find_peaks(flux, distance=max(1,int(.15*sr/hop)), prominence=max(float(np.std(flux)),1e-8))
report = {'representation':'Full complex STFT in SVG metadata; visible spectrogram is a preview, not note transcription or source separation.',
 'duration':len(audio)/sr,'sample_rate':sr,'channels':audio.shape[1],'fft':nfft,'hop':hop,
 'peak':float(abs(audio).max()),'rms':float(np.sqrt(np.mean(audio**2))), 'reconstruction_snr_db':snr,
 'max_abs_error':float(np.max(abs(error))), 'spectral_centroid_hz_median':float(np.median(centroid)),
 'onset_candidates_seconds':[float(t[i+1]) for i in onsets[:300]],'rms_by_second':frames,
 'original_sha256':hashlib.sha256((out/'original.wav').read_bytes()).hexdigest(),
 'reconstruction_sha256':hashlib.sha256((out/'reconstruction.wav').read_bytes()).hexdigest()}
(out/'analysis.json').write_text(json.dumps(report, indent=2))
(out/'notes.md').write_text('Reference reconstruction baseline\n\nOriginal excerpt → complex STFT → spectral SVG → inverse STFT. All frequency bins and both phase and magnitude are retained; no original WAV bytes are embedded. The SVG carries compressed numerical coefficients and a spectrogram preview. This is signal reconstruction, not inferred instruments or musical notes.\n\nThe matching renderer can regenerate audio from score.svg alone. Edit metadata#edits for gain/time-frequency regions, or build a new renderer for more ambitious changes. Avoid printing the large payload into model context. The preview does not automatically redraw after coefficient/parameter edits. Compare against original.wav. Provenance and excerpt timestamps are in provenance.json; numerical checks are in analysis.json.\n')
print(json.dumps({k:report[k] for k in ['duration','sample_rate','channels','reconstruction_snr_db','max_abs_error']}))
