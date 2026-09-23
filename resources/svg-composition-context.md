# Original composition: visible SVG is the executable score

This is a provenance contract, not an artistic recipe. Invent whatever SVG vocabulary and synthesis graph serve the request. Do not copy the optional example's melody, form, palette, density or element types.

For an original composition, put the complete audible arrangement into visible SVG geometry. A temporary Python score-builder is welcome when it helps you generate rich, coherent geometry: compose the event relationships, emit the full score.svg, then render by reading that saved SVG. Timing, pitch/contour, duration and event identity must be recoverable from visible paths, polylines, shapes or other rendered marks. Controls such as voice, gain, articulation, pan, modulation or routing may use attributes attached to those marks when geometry alone is unsuitable.

Do not store the musical score in metadata, base64, JSON blobs, hidden elements or an embedded preview image. Do not keep note lists, pattern expansion, section schedules or independent accompaniment in render.py. The renderer may freely define instruments, synthesis algorithms, effects and decoding rules, but every audible event and continuous musical gesture must originate from the visible score. Reading a token motif from SVG while arranging the actual piece in Python does not satisfy this contract.

No fixed schema, primitive, event count, instrument set, genre or compositional method is required. SVG paths can be sparse or extremely dense; repeated material may be generated procedurally before serialization. The requirement is causal: editing an audible visible mark and rerendering must change the corresponding sound, while deleting all audible marks must leave the renderer with no composition to perform.
