"""Sampled instruments for Studio renderers: General MIDI via FluidSynth + FluidR3_GM.

    from gm import render_notes, GM
    audio = render_notes(events, duration=90.0, sr=44100)   # float array (frames, 2)

events: iterable of dicts
    program  GM program 0-127 (see GM, e.g. GM['flute']) or 'drums' (pitch = GM drum key)
    pitch    MIDI note (rounded; bend/glide by synthesis of your own if needed)
    start    seconds;  dur  seconds;  vel  0-1;  pan  -1 (left) .. 1 (right), optional

Returns silence (no subprocess) for an empty event list. Copy this file next to render.py
so the delivery stays self-contained. Your renderer still decodes the SVG; this only plays notes.
"""
import os, shutil, struct, subprocess, tempfile
import numpy as np
import soundfile as sf

_FONTS = ['/usr/share/soundfonts/FluidR3_GM.sf2', '/usr/share/sounds/sf2/FluidR3_GM.sf2', '/opt/homebrew/share/soundfonts/FluidR3_GM.sf2']
SOUNDFONT = os.environ.get('STUDIO_SOUNDFONT') or next((f for f in _FONTS if os.path.exists(f)), _FONTS[0])
_NAMES = """acoustic_grand_piano bright_acoustic_piano electric_grand_piano honky_tonk_piano electric_piano_1 electric_piano_2 harpsichord clavinet
celesta glockenspiel music_box vibraphone marimba xylophone tubular_bells dulcimer
drawbar_organ percussive_organ rock_organ church_organ reed_organ accordion harmonica tango_accordion
acoustic_guitar_nylon acoustic_guitar_steel electric_guitar_jazz electric_guitar_clean electric_guitar_muted overdriven_guitar distortion_guitar guitar_harmonics
acoustic_bass electric_bass_finger electric_bass_pick fretless_bass slap_bass_1 slap_bass_2 synth_bass_1 synth_bass_2
violin viola cello contrabass tremolo_strings pizzicato_strings orchestral_harp timpani
string_ensemble_1 string_ensemble_2 synth_strings_1 synth_strings_2 choir_aahs voice_oohs synth_voice orchestra_hit
trumpet trombone tuba muted_trumpet french_horn brass_section synth_brass_1 synth_brass_2
soprano_sax alto_sax tenor_sax baritone_sax oboe english_horn bassoon clarinet
piccolo flute recorder pan_flute blown_bottle shakuhachi whistle ocarina
lead_square lead_sawtooth lead_calliope lead_chiff lead_charang lead_voice lead_fifths lead_bass_and_lead
pad_new_age pad_warm pad_polysynth pad_choir pad_bowed pad_metallic pad_halo pad_sweep
fx_rain fx_soundtrack fx_crystal fx_atmosphere fx_brightness fx_goblins fx_echoes fx_sci_fi
sitar banjo shamisen koto kalimba bagpipe fiddle shanai
tinkle_bell agogo steel_drums woodblock taiko_drum melodic_tom synth_drum reverse_cymbal
guitar_fret_noise breath_noise seashore bird_tweet telephone_ring helicopter applause gunshot""".split()
GM = {name: i for i, name in enumerate(_NAMES)}
DRUMS = dict(kick=36, snare=38, rimshot=37, clap=39, closed_hat=42, pedal_hat=44, open_hat=46, low_tom=45, mid_tom=47,
             high_tom=50, crash=49, ride=51, china=52, splash=55, cowbell=56, tambourine=54, low_floor_tom=41)
TPQ, TEMPO = 960, 500000          # 120 BPM grid: 1 s = 1920 ticks
TICKS = 2 * TPQ


def _vlq(n):
    out = [n & 0x7F]; n >>= 7
    while n: out.append((n & 0x7F) | 0x80); n >>= 7
    return bytes(reversed(out))


def _midi(events):
    """One track; each (program, pan) pair gets a channel (drums on 9). Returns bytes or None if >15 melodic groups."""
    groups, msgs = {}, []
    for e in events:
        drum = e['program'] == 'drums'
        key = ('drums', 0) if drum else (int(e['program']), round(float(e.get('pan', 0)) * 4) / 4)
        if key not in groups:
            if drum: groups[key] = 9
            else:
                free = [c for c in range(16) if c != 9 and c not in groups.values()]
                if not free: return None
                groups[key] = free[0]
        ch = groups[key]; pitch = int(round(e['pitch'])); vel = max(1, min(127, int(round(float(e.get('vel', .7)) * 127))))
        on = int(round(max(0.0, float(e['start'])) * TICKS)); off = on + max(1, int(round(max(0.03, float(e['dur'])) * TICKS)))
        if 0 <= pitch <= 127: msgs += [(on, 1, bytes([0x90 | ch, pitch, vel])), (off, 0, bytes([0x80 | ch, pitch, 0]))]
    setup = [(0, -1, bytes([0xFF, 0x51, 3]) + TEMPO.to_bytes(3, 'big'))]
    for (prog, pan), ch in groups.items():
        if prog != 'drums': setup.append((0, -1, bytes([0xC0 | ch, prog])))
        setup.append((0, -1, bytes([0xB0 | ch, 10, max(0, min(127, int(64 + pan * 63)))])))
    track, last = b'', 0
    for tick, _, data in sorted(setup + msgs, key=lambda m: (m[0], m[1])):   # note-offs before note-ons on a tick
        track += _vlq(tick - last) + data; last = tick
    track += _vlq(0) + b'\xFF\x2F\x00'
    return b'MThd' + struct.pack('>IHHH', 6, 0, 1, TPQ) + b'MTrk' + struct.pack('>I', len(track)) + track


def _render(events, frames, sr, reverb, gain):
    data = _midi(events)
    if data is None:                               # too many (program, pan) groups: split and sum
        half = len(events) // 2
        return _render(events[:half], frames, sr, reverb, gain) + _render(events[half:], frames, sr, reverb, gain)
    fluid = shutil.which('fluidsynth')
    if not fluid or not os.path.exists(SOUNDFONT):
        raise RuntimeError('fluidsynth and a General MIDI soundfont are required; set STUDIO_SOUNDFONT=/path/to/FluidR3_GM.sf2')
    with tempfile.TemporaryDirectory() as tmp:
        mid, wav = os.path.join(tmp, 'n.mid'), os.path.join(tmp, 'n.wav')
        open(mid, 'wb').write(data)
        subprocess.run([fluid, '-ni', '-q', '-g', str(gain), '-r', str(sr), '-T', 'wav', '-F', wav,
                        '-o', f'synth.reverb.active={int(reverb)}', '-o', 'synth.chorus.active=0', SOUNDFONT, mid],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        audio, rate = sf.read(wav, always_2d=True)
    assert rate == sr
    out = np.zeros((frames, 2)); n = min(frames, len(audio)); out[:n] = audio[:n, :2]
    return out


def render_notes(events, duration, sr=44100, reverb=True, gain=0.5, tail=3.0):
    """Stereo float array of duration+tail seconds. Deterministic for identical events."""
    events = [e for e in events if float(e.get('dur', 0)) > 0]
    frames = int(round((float(duration) + tail) * sr))
    if not events: return np.zeros((frames, 2))
    return _render(sorted(events, key=lambda e: float(e['start'])), frames, sr, reverb, gain)
