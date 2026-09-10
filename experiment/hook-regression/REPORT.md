# Generation regression diagnosis — 2026-09-10

## Observed failure

The original Last Train, First Light version (`../../.studio/7c34f2fd-8114-4b0a-b26a-217194650b09/`) stored a small seed score. Its `render.py:31` reads SVG events, but lines 39–48 independently specify hook notes, a counterline and final cadence. The SVG therefore did not describe the full audible arrangement. Custom event elements also had no browser-visible projection.

The follow-up (`../../.studio/6e15f61a-b65c-4379-b5da-8ce6ffda4399/`) made seed marks visible without resolving the arrangement mismatch and dropped pan attributes used by the renderer. A visual repair could consequently change sound.

## Causal boundary

The saved context for these requests did not include the reference workflow. Both ran on Luna at low effort; earlier successful Luna outputs also exist. Neither a model-only explanation nor a claim that reference instructions directly caused these two failures is supported. The concrete contract weakness was that “reads the SVG” permitted a partly independent musical composition inside Python.

This establishes a mechanism for the observed score/audio disagreement, not a controlled explanation of all perceived musical-quality regression.

## Repair

- `resources/generation-context.md` teaches a compose → serialize → decode → synthesize method. The saved composition controls both visual and audible arrangement. Arbitrary synthesis, patterns, curves and custom schemas remain supported.
- `resources/composer.md` closes the partial-consumption loophole explicitly.
- `resources/workbench-context.md` retains common taste guidance; source workflow details are routed separately.
- `server/hooks.mjs` routes by the nearest task boundary, including recorded workflow. A fresh composition supersedes older source requests, including on subsequent “continue” turns.
- Existing output checks remain a secondary guard; they cannot establish semantic or artistic correspondence.

## Verification and limits

`test/context.test.mjs` exercises original generation, reference follow-ups, a source → fresh composition → continue sequence, visual repair, bass adjustment and recorded workflow inheritance. The existing suite also checks spectral reconstruction/editing, output repair lifecycle and provider settings.

No new listening evaluation or controlled model A/B was performed for this patch. Passing deterministic tests verifies hook delivery and lifecycle behavior, not that a probabilistic composer will always follow its instructions or that its next composition will sound better. Historical artifacts remain unchanged. Restart Studio to load the changed routing and base instructions.
