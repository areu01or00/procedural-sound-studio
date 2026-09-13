# Research tool handling

Keep the required ad hoc research. This is tool guidance, not a musical recipe.

When calling a web tool through functions.exec, emit its return value directly:

```js
const result = await tools.web__run({search_query: [{q: "your task-specific query"}], response_length: "short"});
text(result);
```

Use the actual available tool name/schema. A return value can be a string or a structured object: do not assume `result.content` exists, and do not discard the result by iterating over `result.content ?? []`. Inspect the emitted value before interpreting it. Empty displayed output from a wrapper is not evidence of an empty search. If that happens, repeat once with direct emission.

If search genuinely fails, try one relevant direct source using available tools. Shell DNS failure inside a network-restricted sandbox does not establish host DNS failure: use the tool's supported escalation/approval mechanism for that failed request when policy permits. Never bypass a refusal or silently grant network access. An unavailable browser does not make other web tools unavailable. Do not repeat identical failed searches indefinitely. If recovery fails or permission is declined, report which path failed and what access/input is missing; do not claim research happened. No substitute source analysis without actual source audio.

For research you actually use, save the returned source text/excerpt in this delivery directory under `research/`, along with its URL, retrieval tool and any tool call/source ID visible to you. Preserve the observed wording; distinguish search snippets from opened-page text and your own interpretation. Link those files from notes.md. Do not manufacture transcripts or claim a saved model-written summary proves retrieval. Studio may also save observed web-tool events in `research-events.jsonl`; an event without source content proves only that a call was observed, not that a page was read. Missing telemetry must be reported as unverified, not as proof no research occurred. Conversational replies and display-only repairs remain exempt.
