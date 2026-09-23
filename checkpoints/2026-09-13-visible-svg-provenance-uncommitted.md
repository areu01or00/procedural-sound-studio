# Draft checkpoint — 2026-09-13: restore visible SVG provenance

Status: uncommitted.

## 2026-09-15 extension — executable SVG painting

The uncommitted work now extends the same inspectable-artifact idea into a separate Painting mode without changing the Sound contract. Painting projects accept original prompts or a local image, measure supplied pixels before the model turn, inject painting-only context into isolated threads, and validate a distinct image/process manifest. The UI exposes the final render, process playback, SVG score, source comparison and analysis artifacts.

`resources/painting/example/` and `experiment/painting-demo/` contain Aurora Study, a six-stage executable score with 124 visible marks. Its renderer reads SVG stage order and geometry, produces a 960×600 PNG plus a 12-second MP4, and uses a declared seed for surface texture. Automated coverage checks preprocessing, hook isolation, deterministic rerendering, SVG mutation response, manifest decoding, stage count and the HTTP image-ingestion path. The final image was also inspected directly. This demonstrates plumbing and causal editability; it does not claim human-level painting quality or model quality across prompts.

## Motivation

The approved Sky trajectory was audited after a visible-rectangle ablation appeared to reject the SVG thesis. Sky contained no opaque payload: hundreds of audible polylines carried time and pitch geometry, while temporary Python builders generated the detailed score and a bespoke renderer decoded it. Current Studio language still allowed metadata projections and its validator did not establish that an original renderer read visible geometry. Consequently technically valid container SVGs could pass without reproducing Sky's causal structure.

## Change

Hook v9 adds a generation-only provenance contract modeled on the successful mechanism without copying its music: free temporary score builders, arbitrary visible SVG vocabularies, arbitrary bespoke synthesis, and complete audible arrangements serialized as visible marks. Original-composition metadata/hidden score payloads and Python-held event schedules are disallowed. Reference reconstruction keeps its packed spectral metadata workflow.

The output checker now receives workflow identity. For original generation it requires semantic visible marks, rejects metadata score storage, and statically verifies that the paired renderer references score.svg and geometry fields. These checks establish basic provenance, not perfect semantic equivalence; generated code is still not executed by the checker. No fixed schema, shape, event count, genre, instrument, melody rule or renderer library was added.

## Validation and limits

`npm test` passes 16/16, including a provenance test that accepts a Sky-style visible polyline renderer, rejects generation metadata payloads and Python-only arrangements, and confirms reference metadata remains allowed. The original first Sky package also passes the new generation checker, while the existing spectral helper passes in reference mode. `git diff --check` passes.

The validator cannot prove every audible sample depends exclusively on SVG or detect deliberately obscured hardcoded arrangements. Its purpose is to reject clear regressions while retaining the open representation that produced Sky. Musical quality remains a listening judgment. No live model composition or listening acceptance has been run under hook v9 yet.
