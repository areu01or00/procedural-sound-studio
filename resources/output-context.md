# Output delivery hook: playable audio AND a readable executable score

Before you finish a creation or repair, inspect the actual delivery. Studio checks files after the turn and may return a precise validation failure for one repair pass. Do not call a delivery complete because a WAV exists.

## Protect the successful composition

For a display-only repair (for example “SVG is empty”), preserve the audio exactly. Keep synthesis parameters, event timing, random seed, random-number consumption, pan, articulation and arrangement unchanged. Compare decoded audio/hash before and after. In a recent “visible score” repair, removing group pan attributes changed the sound. That was a regression, not a necessary consequence of drawing the score.

Do not simplify a rich arrangement to make visualization easier. Draw the arrangement you actually render. Existing procedural voices, repeated motifs and synthesis methods can remain flexible.

## Validate the SVG as a visible document

1. Parse the saved XML. The root must be SVG with a valid viewport. Escape text (especially `&`, `<`, and quotes in attributes). Do not leave code fences or truncated XML in the file.
2. SVG browsers do not draw custom `<event>` or `<section>` elements. They can hold data for your renderer, but the score also needs real visible SVG primitives or an accurate preview. Metadata, a background, labels and gridlines alone are not a visible score.
3. Render/inspect the saved SVG using available image/browser tools before claiming its appearance is correct. If rasterization is needed, use an available SVG renderer; do not infer visual correctness from successful XML parsing. Report if you cannot perform visual inspection rather than claiming you did.
4. Check timeline bounds and mapping. In the failed Last Train score, the visible cells occupied only the first eight seconds while the audio lasted ninety. Its labels also mapped 80 seconds to the right edge of a ninety-second piece. If you use compact repeated patterns, label them as patterns and show their repeat/section schedule; otherwise expand them across the actual arrangement. Do not misrepresent a motif bank as the complete time-expanded performance.
5. Check lane boundaries and pitch coordinates. A hook must appear in its labeled hook lane, not on top of the bass lane. Keep labels legible and note marks inside the viewport. Musical pitch scales may differ by lane; define them consistently.
6. Keep preview and executable meaning consistent. If geometry drives synthesis, draw and decode the same mappings. If attributes drive synthesis, the picture must faithfully display those attributes. If metadata stores spectral coefficients, show its spectrogram and explain the payload. Do not claim every visible mark is executable when it is a preview.
7. Inspect the rendered appearance, not just element count. A syntactically valid rectangle can have zero size, zero opacity, lie off-canvas, or be hidden by CSS or a parent. A dense score need not be visually noisy, but it must show the relevant material.

## Validate audio and the paired renderer

Check the saved WAV for nonzero duration, finite samples, channels, peak/RMS and intentional boundaries. Float reconstruction may preserve source overs above 1.0; document that rather than claiming no clipping merely from a floating file. For new compositions leave headroom. Rerun the renderer in the delivery directory and confirm it actually reads the saved SVG. Do not just hash the same file twice without running it.

For a requested musical modification, verify a substantive decoded-audio difference in the intended region. For a faithful reconstruction or visual-only repair, matching audio is desirable. Do not apply a blanket novelty rule. Numerical checks cannot decide artistic success.

## Package honestly

Deliver result.json, the referenced SVG, paired Python renderer, WAV and notes. Write result.json last. Keep dependencies local and previous versions unchanged. Mention blockers plainly; do not invent files or a reconstruction to appease the packaging requirement. The automatic output hook validates structure and audio, not taste or every visual/semantic relationship.

When the output hook requests a repair, fix its specific findings in the same delivery directory. Preserve the musical content unless the fault is in the audio itself. Reinspect, rerender only when appropriate, and update the manifest last. Do not start a new composition or claim the check passed without checking.
