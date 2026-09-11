# Melody audit — first Sky, 2026-09-10

Baseline committed before edits: 4b589ca. New work remains uncommitted.

The user explicitly selected the first Sky: The Machine Remembers the Sky, version ace695d0-4d52-4c47-b60d-0179e6f19fb0. This supersedes the assumption that its later hook-focused revision is the intended reference.

## Evidence

The original score contains a seven-note bell phrase starting at 7.2 seconds: MIDI 74,81,77,76,69,74,76. The rhythm has uneven spacing and a longer final event. Its next statement starts at 12 seconds with the same identity; a later statement transposes the phrase and a reed carries it at 28.8 seconds. See the original score, render.py and notes.md in that version directory. Geometry decodes to pitch and time, so these are actual musical decisions rather than descriptions.

Pelagic Grid (f8609379-d4c6-44da-82f0-b836ed074597) uses the brass offsets [0,3,6,2,9] against a changing root, with reversal/inversion and altered offsets later. Its cable line cycles chord degrees and register changes beside it. A melody is technically present. The hypothesis is weaker phrase continuity and competing foreground material, not an inability to synthesize pitched notes. These observations cannot alone establish why a listener likes one more.

The last harness revision prioritized palette, density and independence, but supplied no comparably explicit melodic drafting/review step. The maximalist test prompt likewise emphasized texture and novelty without explicitly asking for a memorable melody. Both are plausible contributors; no controlled model comparison establishes exclusive causality.

## Improvement loop

1. Audited the original Sky and latest score rather than adding density rules.
2. Generated paired neutral-voice foreground probes from their saved SVG notes, isolating some timbral differences. probe.py writes and decodes the probe SVGs. Both are 16 seconds, fixed gain, identical oscillator/envelope; they are not reproductions of the original mix and retain different harmony/phrase contexts. No listening verdict is asserted.
3. Added a bounded draft → isolated phrase → arrangement → targeted revision loop to the generation hook. Explicitly distinguish a melody from root-following cells/arpeggios, preserve identity across harmonies, and protect audibility. This is guidance inside a generation turn, not an unbounded sequence of paid model calls.
4. Retained dense orchestration, free form and nonmelodic sound-design scope. No forced key, phrase length, theme, instrument or universal schema.

New composition/listening validation remains outstanding; technical tests only verify delivery of the guidance. The evidence probes let the listener inspect the proposed distinction directly. Original versions remain unchanged.
