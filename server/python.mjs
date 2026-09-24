// Python used for renderers and checks: STUDIO_PYTHON, else the repo's .venv, else python3 on PATH.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const local = fileURLToPath(new URL('../.venv/bin/python', import.meta.url));
export const PYTHON = process.env.STUDIO_PYTHON || (existsSync(local) ? local : 'python3');
