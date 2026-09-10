# Generation hook: compose once, represent and render the same music

This is original composition or revision of generated music. Use procedural synthesis and an executable musical score. Do not run a recording-reconstruction workflow unless the current request actually depends on a recording. Earlier source tasks do not change a new creation request into a reconstruction.

## The working method

Design a musical performance, not an SVG file and an audio script as separate deliverables. Work programmatically: compose motifs, phrasing, voices and their development; resolve the performance; serialize its musical decisions; decode those decisions for synthesis and a readable score. Generating hundreds or thousands of marks with loops is normal. Hand-writing a few sample marks to stand in for a long performance loses the relationship we need.

The invariant is **one authoritative composition, two consistent manifestations: audible performance and visible score**. SVG remains the saved composition representation. Choose its schema freely—events, curves, patterns with repeat schedules, density fields or other suitable structures. Timbre algorithms can be arbitrary Python. Do not impose a universal instrument library or a fixed note schema.

A practical flow (illustrative names, not a required API):

    composition = compose_the_requested_work()
    write_svg_score(composition, "score.svg")
    saved_composition = read_svg_score("score.svg")
    performance = resolve_patterns_and_controls(saved_composition)
    synthesize(performance, voices, "audio.wav")

The visible SVG marks must describe that same performance or a clearly labeled compact representation of its patterns and repeat schedule. Generate their placement from the same time/pitch/lane mapping. If you store compact patterns, your arrangement must also come from the saved score, and the displayed repeat schedule must describe the expansion. It is fine to store procedural parameters rather than every sample or event; the saved parameters must actually control the piece.

Avoid a partial score plus another hidden composition in the renderer. A decoder that reads 20 seed notes and then independently invents the counterline, final cadence and orchestration in Python has two sources of musical truth. Moving the picture around will not fix that. Put those musical choices into the saved representation or derive them from its explicit controls. Effects and synthesis internals need not become thousands of SVG decorations.

## Keep creativity in composition, not packaging work

Develop the requested idea with phrasing, independent roles, meaningful repetition, anticipation and payoff. This listener values both rich interplay and a recognizable foreground. Do not reduce the music to simplify XML or satisfy a checker. Use code to expand the detail economically. A worked reference is available at the path supplied by Studio: read its composition→SVG→parse→synthesis flow for technique, not its melody or exact style.

Declare the time mapping, lane boundaries and local pitch scale once; use those mappings when producing marks and interpreting geometry. If attributes carry music and geometry is only its display, derive display geometry from those attributes. Do not maintain unrelated hard-coded coordinates. For a 90-second arrangement, the score must make its full structure intelligible, even when using compact repeated motifs.

For expressive variation use deliberate distributions and reproducible seeds. Separate arrangement randomness from timbre/noise randomness so a display edit or a different iteration order cannot accidentally change note selection.

## Revisions have a specific target

For musical edits: start from the requested saved composition and change its musical data/control logic. Preserve what the human wants retained. A new creation instruction can start afresh.

For visual-only edits: keep musical data, timing, articulation, pan, arrangement expansion, sound algorithms and rendered audio unchanged. Change only the projection/layout, or preserve and migrate every musical attribute if replacing element types. Compare decoded audio before and after. Never rebuild a simplified approximation to fix a picture.

The score is not necessarily note-based, and density is not a numerical quota. Success is that its editable musical specification, its audible result and its visual explanation agree. After this generation flow, normal packaging and validation apply; validation cannot create this agreement retroactively.
