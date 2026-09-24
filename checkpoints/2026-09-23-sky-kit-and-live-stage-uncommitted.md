# Checkpoint — 2026-09-23: Sky working example + live score stage (uncommitted)

Status: implemented and checked; not committed (the user decides after listening/looking). Parent commit: `f17bd11`.

## Motivation

The user found recent compositions not catchy or rich enough compared with their favourite, "The Sky Stays Open" (version `8e38995f`, to which they replied "HOLY SHIT"), and asked for (1) the harness to supply more so the model carries less, and (2) a score view that moves with the music.

## Changes

- `resources/examples/sky-stays-open/`: the favourite's `score.svg` (all 684 polylines marked `data-audible`) and its unchanged ~60-line `render.py`, plus `NOTES.md` describing the reusable instrument kit, the score conventions, and what the listener rewarded (identical hook repetition, groove, one break, long payoff, cadence). It replaces `glass_tide_example.py` as the sound-mode working example; the per-turn text now says the renderer may be copied into the delivery and extended, while the music must be the model's own.
- `svg-composition-context.md`: one sentence asking scores to declare `data-time-origin`/`data-time-scale` on the root so Studio can animate playback.
- `web/score-stage.js` (new) + markup/CSS: live score stage above the editor. The generated SVG is parsed, allow-list sanitized (drawing elements only; scripts, foreignObject, event handlers and external links removed) and inlined in a shadow root. It follows AudioMass's own playback clock: playhead with sweep, sounding marks glow, finished marks settle, onsets ripple in their mark colour, click to seek, zoom-and-follow, full screen. Time axis from `data-time-origin`/`data-time-scale` (also `data-x0` + px-per-second/beat variants), otherwise an approximate mapping; marks from `data-audible`, otherwise data-bearing drawables.
- `test/stage-ui.cjs` (new, Electron): seeds Sky plus a hostile SVG, plays, captures `/tmp/studio-stage-{playing,full,zoom}.png`.

## Validation

- Packaged example renders bit-identical to the favourite's `audio.wav`; silence test passes (684 marks, peak 0.0, ~3 s); `check_output.py` no issues.
- `npm test` 36/36. `electron test/stage-ui.cjs`: hostile SVG neutralised (no script ran, 0 scripts/handlers left); during playback at 0:09, 5 marks sounding, 43 finished, 8 ripples; pause works; no console errors. Frames inspected visually.
- Fixed during the run: the glow filter used bounding-box units and erased flat or vertical lines (playhead, horizontal ribbons); now user-space.

## Limitations

- No live model run with the new example yet; whether it makes compositions catchier is untested and needs the listener.
- The stage follows whatever audio the editor holds; an unrelated file loaded into AudioMass would desync it.
- Scores without a declared time axis animate with approximate timing.

## Rollback

`git restore` tracked files; delete `resources/examples/`, `web/score-stage.js`, `test/stage-ui.cjs` and this checkpoint.

## Correction after live runs (same day)

Six Claude runs made with the kit wording (effort low/medium) were fast but samey. Their renderers were 77–91% textually identical to Sky's (difflib ratio), and transcripts show each run reading NOTES.md and the Sky renderer. Output tokens fell to 18–31k (2–3 min) from 47–100k (6–20 min) at default effort. The "persistent white noise" in "Lúthien before the Throne of Morgoth" is its lead voice: every lead note mixes in near-white breath noise (6-sample moving average, breath 0.10–0.35) about 20 dB below the tone for 81 of 90 s, plus a white-noise reverb impulse. The "copy the kit" wording was withdrawn: the example is now reference-only ("do not copy its renderer, instruments or melody; invent the synthesis"). Effort is the user's setting; low effort measurably cut the thinking. No audio-quality gate was added.

## Recorded instruments (same day)

Diagnosis: at default effort Claude's "Second Kinslaying" (cf6791a3) was well composed on paper (two leitmotifs, fragmentation, reversed interval, minor-mode lament) but sounded like toys: its "flute" was a sine plus two overtones and noise, its "brass" a filtered sawtooth. `composer.md` itself told models to "prefer direct synthesis" with no extra dependencies, so acoustic instruments had to be faked with formulas. A/B with identical notes, balance and loudness (534 of 548 events re-voiced through General MIDI; blows, wind, glides kept synthesized): the user judged the recorded-instrument version "much better".

Change: `resources/instruments/gm.py` (new) writes a MIDI file directly from note events (no Python dependency), renders with FluidSynth + FluidR3_GM.sf2 (system packages `fluidsynth`, `soundfont-fluid`, installed by the user), returns stereo float audio; empty events give silence without a subprocess; works inside the silence-test sandbox. `composer.md` now offers recorded instruments for acoustic sounds and keeps synthesis for synthetic sounds; each sound turn names gm.py's path. Test `test/instruments.test.mjs`; `npm test` 37/37. Bug found while building: the tempo meta event had an extra byte, which made FluidSynth silently drop every note.

Not yet verified: a model composing with gm.py end to end.

## Correction: example removed from sound turns (same day)

- Measurement error corrected: the earlier "77–91% identical to Sky's renderer" figures used difflib `quick_ratio` (a character-multiset upper bound). Real line-level `ratio()` is 0.00–0.05 for all recent pieces (Neon Faultline 0.19); the pre-example control Fingolfin scores 0.01. Code was not being copied; the "kit copying" diagnosis above is withdrawn.
- New evidence: MiMo (OpenRouter, effort high, "Song of the Ainur") opened with "I'll study the listener-favored example" and read Sky's NOTES.md and renderer before the request. The notes' "what the listener rewarded" section (identical hook repetition, four-on-the-floor, one break, payoff) functions as a style prescription labelled as the user's taste — the v4/v5 failure mode.
- Change: sound turns no longer name any example; the contract's "do not copy the optional example" sentence was removed with it. `resources/examples/sky-stays-open/` remains only for `test/stage-ui.cjs`. Recorded-instrument guidance (gm.py) stays. `npm test` 37/37.
- Not verified: that pieces improve without the example; needs listening.
