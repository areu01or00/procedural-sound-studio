# Painting delivery

Create one independent artifact package: painting.svg, render.py, painting.png, process.mp4 or process.gif, notes.md and result.json. Keep the SVG passive and self-contained. The renderer must parse it and create both the final image and progressive frames from the same ordered marks.

Before delivery, parse the SVG, confirm meaningful visible marks in at least three stages, render twice with the same seed and compare hashes, then mutate one copied mark or control and confirm pixels change. Check image dimensions and process duration with Pillow/FFprobe. Do not leave the mutation in the delivered score. Write result.json last.
