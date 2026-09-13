# Checkpoint — 2026-09-13: provider and research reliability

Status: implemented and tested; committed at the user’s request after review. Parent checkpoint: `98b5569`. API-key storage remains session-only, as requested.

## Motivation

Preserve the user's successful DeepSeek compositions while removing provider-routing and research-handling defects. Time optimizations, synthesis helpers, render gates and creative restrictions were explicitly excluded.

## Changes

- Changing the effective provider route restarts Studio's idle owned app-server. The next turn resumes persisted conversation history with the selected endpoint. The regression test models an app-server that retains live configuration across resume, switches a loaded conversation between pinned endpoints and Automatic, and checks the request routing.
- Hook v8 injects a small research-tool guide: emit the whole result rather than assuming a content array; repeat once on discarded output; distinguish sandbox DNS failure from host failure; use supported permission recovery and a bounded direct-source fallback. Mandatory research is retained.
- The guide asks for actual retrieved source excerpts with provenance alongside notes, distinguishes snippets from opened pages, and forbids claiming invented transcripts as evidence.
- Studio saves observed completed web-tool events in `research-events.jsonl`. Agent prose and links alone are not collected as evidence. Tool arguments are excluded. Events without source text remain explicitly inconclusive. This is evidence retention, not an automatic judge of musical influence.
- Added repository instructions requiring motivation and validation in checkpoints at each future commit.

## Correction to the initial audit

The settings HTTP handler already cleared Studio's local `loaded` set. That alone does not unload the app-server's live thread. The root issue is retained configuration in the live app-server, not simply omission of `thread/resume`. Restarting the idle child before resuming addresses that distinction. The initial checkpoint preserves the original audit; this entry records the correction instead of silently rewriting history.

## Validation

`npm test`: 15/15 passed. Tests cover string/structured result emission using the actual documented snippet; provider switches on a loaded conversation; streaming and authorization; evidence-file persistence; exclusion of prose as retrieval proof; missing source content; and existing output/reference workflows. `git diff --check` passed.

No paid inference, external-provider availability or musical listening test was performed. Tool guidance cannot guarantee model compliance. Nested tool output that app-server does not expose cannot be independently verified by Studio; model-saved research files remain attributed evidence, not trusted execution logs. No new delivery gate or automatic creative retry was added.

## Activation

Restart Studio after the active task finishes to load server/hook changes. Existing conversations are preserved. No running user composition was interrupted during this work.
