# Reference audio: acquire → inspect → reconstruct → modify

This turn or its project involves supplied source material. Do this workflow before replacing it with generated music. The hook may list already downloaded references: use a matching local file first. An excerpt's local timestamps differ from the source video; inspect the provenance and perform the subtraction explicitly.

## 1. Resolve the actual input

Read the user's URL, local path and requested timestamps. Preserve the exact requested video or asset. If a usable local file is listed, verify it decodes and reuse it without asking the human to upload the same thing. If only a URL is available, try acquiring its audio with the existing venv's yt-dlp. Use argument-safe commands, a bounded download, no playlist, and a destination inside the new version directory. Do not inspect browser cookies or credentials as a workaround.

Known working invocation in this workspace (replace placeholders, do not execute brackets literally):

    /home/x/Downloads/venv/bin/python -m yt_dlp --ignore-config --no-playlist -f bestaudio --max-filesize 200M --socket-timeout 20 --retries 1 -o '<delivery>/source.%(ext)s' '<video-url>'

If that fails, read the actual error. DNS/permission failures inside the sandbox require a normal tool escalation through Studio's approval controls; they do not show the source is unavailable on the host. An obsolete downloader or extractor failure is distinct from a denied network request. Do not loop endlessly or bypass denied permission. Do not use titles, thumbnails, metadata, search snippets or a video summary as evidence of its sound.

For precise excerpts, decode a locally downloaded source and trim with FFmpeg. Our previous `yt-dlp --download-sections` request for 6:15–7:05 produced 54.97 seconds because of container/packet boundaries. It silently shifted the intended focus. Full-source decoding followed by output trimming fixed that. Example:

    ffmpeg -v error -y -i '<source-file>' -ss 375 -t 50 -ar 48000 -ac 2 -c:a pcm_f32le '<delivery>/original.wav'

Use the USER'S requested times, not the example defaults. If the input is already an excerpt, cut by LOCAL offset rather than applying the video timestamp again. Confirm the decoded sample count, duration, channels, finite values and nonzero signal. Do not clip peaks just by converting to integer PCM. Keep analysis excerpts bounded (usually 30 seconds; the provided helper supports up to 120 seconds). Longer output compositions can grow from shorter references.

If retrieval remains blocked after a reasonable diagnosis, say exactly what failed and request a local file. Do not create a fake reconstruction or generic substitute. A failed acquisition is a blocker for this task, not a reason to abandon source grounding.

## 2. Use the provided reconstruction helper

The hook supplies the absolute path to `resources/reference/analyse.py`. It expects `original.wav` in the directory passed as its argument. Run it with the existing Python:

    <python> <analyse-script> <delivery-directory>

It produces:
- spectrogram.png: waveform and log-frequency spectrogram, with LOCAL seconds.
- score.svg: full complex STFT coefficients in compressed numeric metadata, plus a visual preview and editable gain/time-frequency controls.
- render.py: an independent decoder that reads score.svg, not the original recording.
- reconstruction.wav: the verified baseline reconstructed from the saved SVG.
- analysis.json: reconstruction SNR/error, RMS trajectory, onset candidates and spectral centroid.
- notes.md: the representation and editing mechanics.

The SVG is intentionally a spectral baseline rather than an invented instrument score. All bins and phase are retained; its PNG is a preview. It is not a compression breakthrough or instrument-separation model. The helper rejects silent/invalid input and low-fidelity round trips. Do not paste its large base64 coefficient payload into context. Read the small analysis JSON, inspect the PNG with the image tool and inspect the decoder. You can load the numeric payload programmatically if deeper measurements are needed.

This helper writes score.svg, render.py and notes.md. Run it BEFORE authoring the final modified score, or in a baseline subdirectory, so it cannot overwrite the new composition. Keep original.wav and reconstruction.wav unchanged as evidence. Record provenance.json with the source URL/path, source excerpt start/end, local focus offset and processing choices.

## 3. Inspect before interpreting

Observe the actual spectrogram. Correlate its time axis with the focus passage. Measure frequency trajectories, repetition/onsets, loudness contour and harmonic/spectral behavior as needed. The supplied onset peaks are candidates, and spectral centroid is not musical pitch. For a polyphonic passage, do not label the loudest frequency as the melody without corroboration. Use additional numeric analysis when it matters.

Explain briefly what the evidence establishes and what your musical interpretation is. For a literal reconstruction request, deliver the faithful baseline instead of composing a new tune. Copy reconstruction.wav to audio.wav and keep the spectral SVG and renderer as the runnable source. For a modification request, start with this verified baseline. Do not jump from metadata to an invented score and call it reconstruction.

## 4. Modify ON that baseline

Identify the element the human wants kept: the actual timbre, phrase, groove, texture, vocal delivery or hook. Modify around that anchor. Depending on the request, use spectral masks, EQ/envelopes, phrase cuts/repetition, crossfades, layering, an added procedural counterline or a new synthesis representation grounded in measured source behavior. The existing helper's decoder supports editable global gain and smooth time/frequency band gains via metadata#edits; more complex composition is free to use a new paired renderer.

Signal reconstruction preserves existing voices; it does not grant clean voice/instrument separation or convincing new syllables. If a transformation cannot preserve a particular element, explain the actual limitation rather than substituting an unrelated result.

The new renderer must run from its own directory and actually read the modified SVG. If you reuse the packed spectral baseline, copy it into the delivery and expose meaningful edit parameters instead of merely renaming it. Regenerate an accurate preview if you change data that the previous preview depicts; otherwise label the preview as the original baseline. Preserve the original and reconstruction files for comparison.

## 5. Check the actual requested change

Compare decoded baseline versus modified audio. For an intended audible modification, byte-identical audio is not success; container metadata changes alone also are not success. Measure the change in the intended region/parameter and verify timing, finite samples, peaks and boundaries. Do not normalize away a requested gain change accidentally. For a faithful reconstruction, matching the source is desirable—do not manufacture a difference to pass a generic novelty check.

Make original.wav and reconstruction.wav available as local links alongside the final audio.wav. State precisely which stage was completed. Never infer that the work is exempt from copyright restrictions simply because an excerpt is short or represented as SVG; equally, do not use a vague copyright explanation to conceal an acquisition or synthesis failure. Describe the actual task and evidence.
