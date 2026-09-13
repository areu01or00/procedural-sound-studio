# Checkpoint — 2026-09-13: preserve creative baseline before reliability fixes

## Motivation

The user reports excellent, complex SVG compositions from DeepSeek and wants that freedom preserved. Save the current implementation before changing provider routing and research handling. No timing optimizations, DSP scaffold, preview gate, caching, score schema or additional artistic prescriptions are authorized in the next change.

## State saved by this commit

OpenRouter inference-provider picker and authenticated streaming relay; current creative-context rollback; mandatory ad hoc research; the incident audit in [AUDIT-2026-09-13.md](../AUDIT-2026-09-13.md). Local audio, credentials and conversation stores remain outside version control.

Known defects: loaded threads can retain the previous inference endpoint; model-written web wrappers can discard string results; research failures are not adequately distinguished from sandbox/browser limitations; citations in notes are not proof of retrieval. The audit separates these from synthesis runtime and upstream failures.

Validation before checkpoint: `npm test` passed 13/13; `git diff --check` passed. These checks did not detect the loaded-thread switch defect and do not establish musical quality or paid-provider availability.

## Next work (must remain uncommitted)

Fix provider switching; teach correct web-result handling and bounded permission-aware recovery; retain observed research evidence without treating model-authored citations as verification. Preserve existing SVG, renderer and creative freedom. Document implementation and tests in the next checkpoint entry without committing it until requested.

## History policy

Every future commit must include a checkpoint documenting its motivation, actual changes, validation and remaining limitations. Do not retrofit unobserved results into earlier checkpoints. This commit's identity is available with `git log -- checkpoints/2026-09-13-before-reliability-fixes.md`.
