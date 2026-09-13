# Studio

A local sound workshop built around AudioMass, Electron and Codex app-server.
Describe a sound → Codex writes a visual score and its matching Python synthesizer → Studio validates the WAV and loads it into the editor. Continue the conversation to create another version.

## Run

From this directory:

```sh
npm install
npm start
```

Requires Node.js 22+, a logged-in `codex` CLI on PATH, FFmpeg/ffprobe, and Python with NumPy, SciPy and soundfile. This workspace already has Python at `/home/x/Downloads/venv/bin/python`. Override with `STUDIO_PYTHON=/absolute/path/to/python`; override the Codex executable with `CODEX_BIN`. Model and account come from your existing Codex configuration. Generation consumes that account's usage.

Browser mode: `npm run dev`, then open `http://127.0.0.1:5055`. Set `PORT` if necessary. Electron chooses an available local port automatically.

## Working loop

- **New sound** starts a separate conversation. Describe the asset, its progression and any duration constraints.
- **Make next version** continues the selected sound's conversation. Earlier versions remain available. Revisions refer to the conversation's latest work; name an earlier version in your prompt if you want to branch from it.
- Select a completed version to load its WAV into AudioMass. Play, trim, apply effects and export using AudioMass's existing controls.
- Expand **Visual score & synthesis code** to inspect the SVG and renderer. Download WAV, SVG, Python or notes above the editor.
- Requests for command/file approval appear in the side panel with their details. Approve once or decline. Stop interrupts the current turn.

AudioMass edits are in-memory editor work: export them from its File menu. They do not automatically update the generated SVG or feed back into the Codex conversation. Importing a recording into AudioMass likewise does not attach it to the composer. Studio's version library stores generated deliveries; it is not yet a general audio project manager.

## What is fixed, and what is creative?

`resources/composer.md` transfers the composition lessons: structure, motif transformation, timbral roles, dynamics, direct synthesis, honest validation. `resources/glass_tide_example.py` is a local reference adapted from the earlier successful Glass Tide experiment. It is an example, not a mandatory template.

Each version invents its own SVG representation and paired renderer. The renderer must read the SVG to create its audio. The only fixed contract is a small delivery manifest:

```json
{"title":"Sound title","audio":"audio.wav","svg":"score.svg","code":"render.py","notes":"notes.md"}
```

`result.json` is written last. Studio checks every named artifact stays inside its version directory, checks the WAV header, and verifies duration/channels/sample rate with ffprobe. This validates delivery, not artistic quality or whether the renderer faithfully interprets every SVG element. The generated renderer is not automatically executed by Studio's HTTP backend; Codex runs it with its normal tool and approval mechanisms.

## Files

- `server/codex.mjs`: owned app-server subprocess; JSONL requests, notifications and replies.
- `server/index.mjs`: loopback HTTP, streamed progress, conversation lifecycle, saved versions, approval forwarding and artifact validation.
- `web/`: small Studio shell; upstream AudioMass is a same-origin iframe.
- `desktop/main.cjs`: Electron window, with Node integration disabled and renderer sandbox enabled.
- `resources/`: composition instructions and one worked example.
- `.studio/state.json`: local projects, thread IDs, prompts, logs and version metadata.
- `.studio/<version-id>/`: generated deliverables. Back up this directory with your work. Codex also retains its conversations in its own normal storage.
- `src/`: original AudioMass editor; unchanged by the Studio integration.

No installed Codex plugin, API key relay or separate frontend build system is required. Studio runs its own before-turn context hook; no global Codex configuration is changed. Standard command/file approvals and user questions are supported. Other app-server request types return an explicit unsupported error. This is a local experimental desktop app, not a multi-user network service. Generative quality varies; convincing singing and selective changes to arbitrary recorded vocals remain outside the demonstrated capability.

## Verification

```sh
npm test                                    # No model calls; HTTP/lifecycle/boundary checks
node test/live.mjs                           # Uses Codex: create a five-second sound
node test/live.mjs --revise                  # Uses Codex: revise latest project after restart
./node_modules/.bin/electron test/ui.cjs      # Requires the five-second live asset + desktop session
```

The Electron check verifies AudioMass decoded stereo audio, SVG/code display, and renderer Node isolation; writes `/tmp/studio-ui.png`. It does not assess sound quality by listening. The live scripts never autoaccept an approval request.

## Upstream and references

AudioMass by Panos Kalogiros: https://github.com/pkalogiros/AudioMass, original baseline `21f5ee1`. See `README.md`, `LICENSE` and `THIRD_PARTY_NOTICES.md` for upstream documentation and licenses. Studio additions follow the repository's MIT license.

App-server protocol reference: https://developers.openai.com/codex/app-server/. Implementation was checked against the installed CLI's generated JSON schemas. Recheck those schemas when upgrading Codex.

## Working-context hook

`server/hooks.mjs` runs before every user turn, including turns in an already-loaded conversation. It injects shared listener feedback from `resources/workbench-context.md`. Original generation and revisions receive `resources/generation-context.md`: compose once, serialize the musical decisions into SVG, and derive both the visible score and audible arrangement from those decisions. Instrument algorithms and score schemas remain freely chosen. Source-dependent requests instead receive `resources/reference-context.md`, with acquisition, reconstruction and modification guidance. A short “continue” inherits the nearest task boundary, so a subsequent new composition supersedes an older reference task. Every route receives output guidance. Guides are read on each user turn; changes to hook routing or base composer instructions require restarting Studio. Automatic repair turns retain the context of their originating turn.

The hook advertises existing WAV excerpts with JSON provenance under `.studio/references/<name>/`. Each version saves the exact injected guide as `context.md`, and records hook routing in state.json. URLs and provenance are context for the model, not a claim that source analysis has already happened.

The small optional helper `resources/reference/analyse.py <directory>` consumes `original.wav` and writes a spectrogram, full complex-STFT spectral SVG, matching decoder, reconstruction and numerical analysis. It preserves phase, uses all frequency bins and checks saved-WAV fidelity. The SVG contains compressed numerical coefficients plus a preview; this is a signal representation, not a semantic instrument score. No source waveform is embedded. `metadata#edits` supports gain and smooth time-frequency gains. A model can build a new renderer for further changes.

Reference acquisition is still performed by the agent through its tool/approval workflow. This change deliberately adds context and reusable processing tools, not a new URL-import UI or background media service. Restart Studio once to load the new hook module; existing conversations remain available.

## Output validation and repair

The after-turn hook checks the declared files, parses the SVG, checks Python syntax without executing generated code, and streams through the WAV to check finite/non-silent audio. Browser-invisible custom event data without a visible score is rejected. A suspiciously short visible pattern against a longer arrangement is flagged for review. These checks run before the version becomes completed. A version with structural errors and work on disk gets at most one automatic repair turn in the same conversation and directory. Missing/invalid artifacts after that fail explicitly; warnings remain recorded. Genuine no-output blockers are not turned into infinite repair loops.

Each version records `output-check.json`; an automatic repair also records `output-repair.md`. `resources/output-context.md` instructs the composer to inspect its rendered SVG, match lanes/timelines/geometry to the sound, and preserve the WAV for visual-only fixes. The deterministic checks do not rasterize every SVG or establish musical quality; the agent remains responsible for visual inspection and semantic correspondence. Existing saved versions are not rewritten retroactively.

## Provider and model settings

The small gear in the header opens provider settings. Default uses the existing OpenAI Codex account; the model picker reads the installed app-server's catalog, including additional models. Configured default selects the catalog default. OpenRouter takes a pasted model ID and API key, using its Responses-compatible endpoint. Choose a model that supports agent tool use; compatibility can vary by model/provider.

Provider and model choices persist in `.studio/settings.json`. A pasted OpenRouter key is held only in memory and the owned app-server's environment until Studio closes; it is not written to settings, prompts or model config. You can also supply `OPENROUTER_API_KEY` when launching Studio. Switching provider keeps separate Codex threads per project; the asset history remains shared. Selected models apply to the next turn and its repair pass. Settings cannot change while a turn is active. No global Codex configuration or login is modified.

Verification: `npm test`, `./node_modules/.bin/electron test/settings-ui.cjs` (live catalog/UI, no inference), and `node test/provider-config.mjs` (installed protocol accepts custom-provider config, no inference). A successful OpenRouter paid inference still requires a real key and compatible chosen model.

Provider configuration references: https://learn.chatgpt.com/docs/config-file/config-reference and https://openrouter.ai/docs/api_reference/responses/overview.


## Creative workflow (hook v4)

Generation guidance prioritizes timbral invention, multi-scale development and the requested ambition. It permits compact procedural scores and overview projections; it does not prescribe note density, a fixed form or instrument library. The optional `resources/synthesis-notebook.md` supplies techniques rather than one example song. Common context is deliberately short. The saved SVG remains authoritative.

Advisory warnings are recorded without starting a repair turn. Structural errors still receive the existing bounded repair. Restart Studio to load code changes. Existing conversation history remains present, so a new project is useful for assessing the new guidance without earlier creative instructions. No model/provider preference is changed by this update.

Hook v5 adds an explicit melody-first drafting and revision pass for musical requests, while keeping nonmelodic sound design valid. It uses the first Sky as a technique lesson, not a compulsory theme/form. Diagnostic neutral-voice probes and the evidence boundary are in `experiment/melody-audit/REPORT.md`. This is a bounded within-turn creative process, not automatic indefinite retries or a musical-quality checker.


## Current rollback: hook v6

The v4/v5 creative prescriptions are no longer injected. `generation-context.md` and `synthesis-notebook.md` remain historical resources only; Studio does not advertise or load them. Shared context now covers task handling and evidence, with the original optional working code example restored. Base SVG/audio contract, reference routing, validation and settings remain active. The earlier v3–v5 descriptions above document prior iterations, not current creative guidance.

Restart Studio for the changed hook. Existing model threads retain previously sent instructions; use a new project to evaluate this rollback without that history. No musical improvement is claimed from passing infrastructure tests.


## Ad hoc research before musical work

The shared before-turn context now requires online research tailored to each composition or musical edit, with concrete examples and source links recorded in notes.md. It gives no fixed musical recipe. Display-only repairs and conversation are exempt. It also explicitly directs edits to inspect SVG data and Python synthesis, extending both when existing controls are insufficient. This is a model instruction, not a deterministic web-access gate or proof of improved musical quality. The resource is read on each new user turn; this instruction-only change needs no restart.

## Latest acceptance checkpoint

[2026-09-11 — local minimum](checkpoints/2026-09-11-local-minimum.md): audio reconstruction works; modifications are not good enough; new sound generation is hit or miss; vocal reconstruction fails the user's acceptance criterion. No dependable musical-quality improvement is claimed.

## OpenRouter inference provider selection

Settings now loads the selected model's available endpoints from OpenRouter's model-endpoints API. Automatic preserves OpenRouter routing; an explicit endpoint is remembered per model and sent as `provider.only` with `allow_fallbacks:false`. Endpoint availability is checked on save. Unavailable/failed lookups are shown rather than silently replacing saved selections.

For pinned requests, a local authenticated fixed-destination Responses relay adds provider routing while preserving streaming/tool-call responses. Automatic and default Codex requests keep their existing direct paths. Settings changes refresh thread configuration on the next turn. Keys remain session-only. Restart Studio to load the update.

References: https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model and https://openrouter.ai/docs/guides/routing/provider-selection .
