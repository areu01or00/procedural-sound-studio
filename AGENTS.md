# Studio change history

Every commit must include a checkpoint in `checkpoints/` explaining why the commit exists, what actually changed, validation performed and remaining limitations. Record user acceptance separately from automated checks. Never invent missing historical validation.

Respect explicit commit boundaries: when asked to commit the current state and leave subsequent work uncommitted, create only the initial commit. Keep a draft checkpoint with the uncommitted work for its eventual commit.

## Project goal (2026-09-23)

Release Studio as a public tool for generating sounds with LLMs: describe a sound, the model writes an SVG score plus the Python synth that plays it, you get a WAV. No benchmark or research framing is planned for the release. Before release: Claude provider must use the user's own `ANTHROPIC_API_KEY` (subscription login is personal-use only), replace the hardcoded `/home/x/Downloads/venv` Python default with a portable fallback plus `requirements.txt`, and add a user-facing README quickstart.
