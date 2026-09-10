# Synthesis and composition notebook — options, not a preset

Choose techniques for the request; do not use all of these or default to an orchestra. No extra dependency is required for the following NumPy/SciPy approaches. These are starting hypotheses to experiment with, not promises of acoustic realism.

## Distinct instrument behavior

- **Struck bodies:** sum damped resonant modes with independently decaying amplitudes. Near-harmonic modes give bars/strings; inharmonic ratios give metal/glass. Vary the excitation spectrum with strike position and velocity. A shared exponential envelope on every partial misses this behavior.
- **Plucked strings:** a noise burst in a fractional-delay feedback loop with frequency-dependent loss; or a modal approximation with pluck-position weighting. Damping, pick noise and sympathetic modes create distinctions beyond changing pitch. Watch stability and Python sample-loop cost; prototype short passages.
- **Breath and bowed gestures:** combine a periodic source with shaped noise and moving resonances. Evolve attack brightness, pressure, vibrato onset and release independently. Static noise over a sine is only a sketch. Phrase-level breath or bow direction can shape a whole line.
- **Electronic voices:** FM/phase modulation with a time-varying index and ratio, wavetable morphing, or filtered band-limited harmonics. Expressive controls should evolve through a note and phrase. Integrate instantaneous frequency to phase for glides. Avoid unbounded harmonics above Nyquist; oversample nonlinear stages when necessary and low-pass before decimation.
- **Rhythmic bodies:** design transient, body and tail separately. Kick pitch falls, snare resonances, noisy wire response, cymbal inharmonic modes and ghost-note articulation occupy different jobs. Velocity should alter excitation/brightness as well as amplitude.
- **Continuous worlds:** filtered stochastic fields, sparse impacts and correlated modulation can make rain, machines or impossible materials. Use several timescales and causal interactions rather than the same white-noise layer throughout.

## Compose relationships

A bass ostinato can change meaning under moving harmony. A counterline can answer or overlap a lead rather than simply double it. Inner voices can move by small steps against a large melodic leap. Rhythms can interlock, displace accents, change subdivision or cross phrase boundaries. Dense sections can contain complementary registers and rests, not just simultaneous attacks. A maximal passage can be earned by thematic combination instead of only increasing gain.

Give motifs transformations appropriate to the piece: rhythmic augmentation, fragmentation, inversion, reharmonization, register transfer or timbral handoff. Preserve identity where desired; don't randomize everything. Let the requested aesthetic determine whether repetition, instability, surprise or resolution dominates. Do not force a breakdown into every composition.

## Depth and mix

Use separate dry/wet routing and distinct spatial roles. Early reflections suggest proximity; filtered late energy suggests enclosure. Duck or arrange competing parts where transients need space. Reserve sub energy deliberately, keep lead detail audible, and avoid normalizing each quiet gesture into equal loudness. Shared global peak normalization is a finishing step, not orchestration.

## Iterate efficiently

Probe the hardest timbre or densest phrase first when it will resolve uncertainty. Reuse computed instrument kernels or vectorized operations where appropriate, while preserving expressive variation. Retain the generator and editable SVG controls so revisions develop the piece rather than reconstructing it from prose. Never equate note count, code size, peak/RMS or a rendered spectrogram with listening approval.
