# Checkpoint — 2026-09-23: Claude Agent SDK provider (uncommitted draft)

Status: implemented and tested. Correction: the parent `medical_agent/.git` is empty, but `studio/` has its own repository (last commit `0dfc516`); this work is included in the pre-hook-v10 baseline commit. Parent state: `2026-09-13-visible-svg-provenance-uncommitted.md`.

## Motivation

The user is re-testing newer models in this harness and wants Claude alongside Codex and OpenRouter, using the Claude subscription (like Codex's subscription login) instead of API tokens. The Agent SDK was chosen over wrapping `claude -p` because it provides per-tool permission callbacks, typed streaming messages and session resume.

## Changes

- `server/claude.mjs` (new): Agent SDK adapter exposing the Codex app-server subset Studio uses. Maps assistant text, tool starts, Bash output, WebSearch/WebFetch results, result/errors and interruption to Studio's existing notifications; routes `canUseTool` prompts to the approval panel; resumes the Studio thread ID as the Claude session ID.
- `server/index.mjs`: routes each turn, repair turn, cancel and approval reply to the backend of the version's provider; a Codex disconnect no longer fails a Claude turn.
- `server/settings.mjs`, `web/index.html`, `web/studio.js`: third provider `claude` with a model picker. Follow-up the same day: the initial hardcoded list was replaced by the live catalog from the SDK's `supportedModels()` (`GET /api/claude/models`, cached per Studio run, no prompt sent), which is what Claude Code's `/model` offers this login (Default, Opus, Fable `claude-fable-5-1[1m]`, Sonnet, Haiku on 2026-09-23). Model-ID validation now accepts `[` `]`.
- `package.json`: dependency `@anthropic-ai/claude-agent-sdk@^0.3.280`.
- `test/claude.test.mjs` (new): three tests (stream mapping and resume options, approvals/decline/interrupt, end-to-end Studio routing and validation with a scripted SDK).

## Environment repair found during this work

The migration left Studio's default interpreter `<local venv>/bin/python` missing, so 9/19 existing tests failed before any change and every provider would fail at render time. Recreated that venv with uv on Python 3.14 with numpy 2.5.3, scipy 1.18.1, soundfile 0.14.0, pillow 12.3.0 and matplotlib. Baseline then passed 19/19.

## Validation

- `npm test`: 23/23 passed (19 existing + 4 new).
- `npx electron test/settings-ui.cjs` (read-only, extended with a Claude step): the Claude fields show, the dropdown lists the five live models; screenshot `/tmp/studio-settings-claude.png`.
- Live, isolated data directory, Opus 5.5 on the subscription login: a 5-second original sound ("Glass Machine Waking") completed in about 3 minutes, 20 SDK steps; output check had no issues or warnings (29 visible event marks, renderer reads visible SVG geometry, 5.0 s stereo 48 kHz, finite). Two web events with source content were recorded, and excerpts saved under `research/`.
- Live revision in the same project resumed the same Claude session: the model recalled the earlier title and length without being told, and delivered a validated 7-second second version.
- Approval requests during live runs were declined, never auto-accepted. Claude worked around them by writing script files.

Not validated: listening quality (no human listening performed), painting mode with Claude, and reruns after Studio restart (resume after restart uses the same `thread/resume` → SDK `resume` path, exercised only in unit tests).

## Limitations

- This is not a pure model swap: Claude uses Claude Code's tools and sandbox, while other providers use Codex's. Hooks, instructions, delivery contract and checks are shared.
- Claude Code's sandbox still asks about some shell commands (variable-expanded compound commands, multi-line `python -c`) that Codex workspace-write would run; expect a few approval clicks per turn.
- `research-context.md` wording is Codex-oriented (`functions.exec`, `web__run`); Claude followed the general instruction and used WebSearch/WebFetch.

## Rollback

Select another provider in Settings; or remove `server/claude.mjs`, `test/claude.test.mjs`, the dependency, and restore the four edited files (pre-change copies were kept in the session scratchpad only).
