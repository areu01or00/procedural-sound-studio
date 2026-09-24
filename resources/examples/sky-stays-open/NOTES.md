# Reference piece: The Sky Stays Open (listener favourite)

The Studio listener's favourite piece so far; their reply to it was "HOLY SHIT". It is a reference, not a template or a kit: do not copy its renderer, instruments, melody, form or palette. Every request deserves its own sound. Reusing this renderer made later pieces sound alike.

## How it is built (for understanding, not reuse)

- `render.py` (~60 lines): nine voices (metal, air, bell, reed, strings, bass, kick, snare, tick) made from phase-continuous pitch ribbons, tapered envelopes, beat-synced ducking (`data-duck` + root `data-beat`) for groove, equal-power pan glides, and one shared dark room tail.
- `score.svg` conventions: each audible event is one `<polyline data-audible="true">` in its voice's lane. Root `data-time-origin` (x at 0 s) and `data-time-scale` (px per second) define time; lane y gives MIDI pitch via `60 + (160 + lane_index*73 - y)/0.62`; intermediate vertices are pitch glides; `data-amp`, `data-pan`, `data-end-pan`, `data-duck` are per-mark controls. Root `data-duration`, `data-sr`, `data-seed`.
- The renderer reads only the saved score, handles an empty score, and writes `audio.wav` next to itself.

## What the listener rewarded here

It came right after a version the listener found clever but unrewarding ("the human mind waits for a pattern and that just isn't appearing"). This revision chose reward over surprise:

- one singable two-bar hook (D5–A5–F5–E5 / D5–F5–E5–D5), repeated with identical pitches and rhythm, each phrase landing on the tonic;
- a dependable groove under it (four-on-the-floor, a bass with its own repeated syncopation, beat-synced pumping);
- exactly one short interruption, then twelve uninterrupted bars of payoff where the hook returns with warmer lead and an octave glass double;
- an explicit cadence and room decay at the end;
- density that supports rather than competes: 684 events over 64 s, yet the hook is never masked.

Form map: 0–8.6 s learn the hook · 8.6–25.7 s lock in · 25.7–30 s one breath · 30–55.7 s payoff · 55.7–64 s cadence.
