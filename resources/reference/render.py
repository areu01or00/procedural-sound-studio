"""Decode the complex STFT stored in score.svg; no source recording is read.

The visible image is a preview. The metadata payload contains compressed complex
frequency coefficients (not WAV bytes). Edit the JSON in metadata#edits for
whole-mix gain or smooth time/frequency gains. This is spectral editing, not
instrument separation or note transcription. Use a new copy for modifications.
"""
from pathlib import Path
import base64
import io
import json
import sys
import xml.etree.ElementTree as ET
import numpy as np
from scipy import signal
import soundfile as sf


def decode(svg):
    root = ET.parse(svg).getroot()
    meta = {e.get('id'): e.text for e in root if e.tag.endswith('metadata')}
    with np.load(io.BytesIO(base64.b64decode(meta['spectrum'])), allow_pickle=False) as p:
        z = p['z'].copy()
        sr, nfft, hop, samples = (int(p[k]) for k in ('sr', 'nfft', 'hop', 'samples'))
    edits = json.loads(meta.get('edits') or '{}')
    z *= 10 ** (float(edits.get('gain_db', 0)) / 20)
    # Smooth windows avoid hard spectral/time boundaries when applying local gain.
    f = np.arange(z.shape[1]) * sr / nfft
    t = np.arange(z.shape[2]) * hop / sr
    for band in edits.get('bands', []):
        low, high = float(band.get('low_hz', 0)), float(band.get('high_hz', sr/2))
        start, end = float(band.get('start', 0)), float(band.get('end', samples/sr))
        smooth_hz, smooth_s = max(1, float(band.get('smooth_hz', 80))), max(.01, float(band.get('smooth_seconds', .08)))
        w_f = np.clip((f-low)/smooth_hz, 0, 1) * np.clip((high-f)/smooth_hz, 0, 1)
        w_t = np.clip((t-start)/smooth_s, 0, 1) * np.clip((end-t)/smooth_s, 0, 1)
        z *= 10 ** (float(band.get('gain_db', 0)) * w_f[None, :, None] * w_t[None, None, :] / 20)
    audio = np.stack([signal.istft(c, fs=sr, nperseg=nfft, noverlap=nfft-hop, boundary=True)[1][:samples] for c in z], axis=1)
    if audio.shape != (samples, z.shape[0]) or not np.isfinite(audio).all():
        raise ValueError('Invalid reconstructed audio')
    return audio, sr


if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    audio, sr = decode(Path(sys.argv[1]) if len(sys.argv) > 1 else here/'score.svg')
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else here/'audio.wav'
    sf.write(out, audio, sr, subtype='FLOAT')
    print(json.dumps({'duration': len(audio)/sr, 'sample_rate': sr, 'channels': audio.shape[1], 'peak': float(abs(audio).max())}))
