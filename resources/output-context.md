# Delivery: preserve the music, package it once

Deliver score.svg, its paired render.py, audio.wav, notes.md and result.json in the assigned independent directory. Write the manifest last. Keep necessary dependencies local. The renderer must consume the saved score. Preserve prior versions.

Use valid passive SVG with visible marks or an accurate preview, valid viewport and consistent labels/mapping. SVG browsers do not draw custom event tags; data in metadata can have a separate readable projection. Compact patterns with a labeled schedule are valid. An overview need not expose every sample or event.

Parse the XML and check saved audio duration, finite samples and headroom. For new synthesis, confirm the renderer can reproduce the saved composition. For visual-only changes compare decoded samples against the prior audio; keep sound unchanged. Musical edits should change the intended region. Numerical checks cannot establish artistic quality.

If a browser/image renderer is available, inspect the score; otherwise report that visual QA was unavailable. Do not repeatedly try missing rasterization packages or install dependencies merely to draw a preview. Studio performs structural/audio checks after delivery, so avoid duplicating a long packaging audit. Keep final notes focused on the musical result, editable controls and meaningful limitations.

If Studio requests a repair, fix the stated error in the same directory and preserve successful musical content. Warnings are review notes, not an instruction to rewrite the composition. Genuine unavailable inputs must be reported rather than replaced with fabricated results.
