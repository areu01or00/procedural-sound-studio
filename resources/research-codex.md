# Codex web-wrapper handling

Codex web tools are called through `functions.exec`. Emit the return value directly:

```js
const result = await tools.web__run({search_query: [{q: "your task-specific query"}], response_length: "short"});
text(result);
```

Use the actual available tool name/schema. A return value can be a string or a structured object: do not assume `result.content` exists, and do not discard the result by iterating over `result.content ?? []`. Inspect the emitted value before interpreting it. Empty displayed output from a wrapper is not evidence of an empty search. If that happens, repeat once with direct emission. This guidance is Codex tooling only; it accompanies the shared research rules in `research-context.md`.
