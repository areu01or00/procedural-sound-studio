// Studio lifecycle hook: supply working knowledge before EVERY turn, including
// turns in already-loaded Codex threads. This does not install global CLI hooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

async function localReferences(dataDir) {
  const root = path.join(dataDir, 'references'), found = [];
  let folders; try { folders = await fs.readdir(root, { withFileTypes: true }); } catch { return found; }
  for (const folder of folders.slice(0, 50)) {
    if (!folder.isDirectory()) continue;
    const dir = path.join(root, folder.name);
    for (const name of (await fs.readdir(dir)).filter(n => n.endsWith('.json')).slice(0, 20)) {
      try {
        const metadata = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
        const audio = path.join(dir, name.replace(/\.json$/, '.wav'));
        const stat = await fs.stat(audio); if (!stat.isFile() || !stat.size) continue;
        found.push({ audio, provenance: path.join(dir, name), source: metadata.source_url,
          sourceStart: metadata.source_start_seconds, sourceEnd: metadata.source_end_seconds,
          focusOffset: metadata.focus_offset_seconds, duration: metadata.duration_seconds });
      } catch { /* Unknown or incomplete sidecars are not advertised as audio. */ }
    }
  }
  return found;
}

export async function beforeTurn({ root, dataDir, prompt, history = [] }) {
  const read = name => fs.readFile(path.join(root, 'resources', name), 'utf8');
  const workbench = await read('workbench-context.md');
  // Current explicit intent wins. Follow-ups inherit the nearest workflow boundary,
  // not every source-related word ever used in the project.
  const classify = text => {
    const fresh = /\b(compose|create|generate)\b|\bmake\b[^.!?\n]*\b(song|track|composition|sound|beat|loop|music|piece|effect)\b/i.test(text) && !/https?:|\b(previous|existing|revision|version|reference|reconstruct|reconstruction|mod|modify|source)\b|\bbased on\b/i.test(text);
    if (fresh) return 'generation';
    if (/https?:\/\/|spectro|reconstruct|reference|source audio|(?:^|\s)[/][^\s]+\.(wav|mp3|flac|m4a|webm)\b/i.test(text)) return 'reference';
    return null;
  };
  const workflow = classify(prompt) || [...history].reverse().map(v => v.contextHook?.workflow || classify(v.prompt || '')).find(Boolean) || 'generation';
  const referenceTask = workflow === 'reference';
  const refs = referenceTask ? await localReferences(dataDir) : [];
  const context = [workbench];
  if (!referenceTask) {
    context.push(await read('generation-context.md'));
    context.push(`Optional synthesis notebook: ${path.join(root, 'resources/synthesis-notebook.md')}. Read for unfamiliar techniques or ambitious sound design; choose methods suited to this request.`);
  }
  if (referenceTask) {
    context.push(await read('reference-context.md'));
    context.push(`Available reconstruction helper: ${path.join(root, 'resources/reference/analyse.py')}\nExisting local reference excerpts (check whether the source matches this task):\n${JSON.stringify(refs, null, 2)}`);
  }
  context.push(await read('output-context.md'));
  return {
    text: `<studio_working_context>\n${context.join('\n\n')}\n</studio_working_context>`,
    audit: { hook: 'beforeTurn', version: 4, workflow, referenceWorkflow: referenceTask, localReferenceCount: refs.length }
  };
}

export async function afterTurn({ root, dir, artifacts }) {
  const { stdout } = await run(process.env.STUDIO_PYTHON || '/home/x/Downloads/venv/bin/python',
    [path.join(root, 'resources/check_output.py'), ...['svg','code','audio'].map(k => path.join(dir, artifacts[k]))],
    { timeout: 30000, maxBuffer: 1024 * 1024 });
  const report = JSON.parse(stdout);
  await fs.writeFile(path.join(dir, 'output-check.json'), JSON.stringify(report, null, 2));
  return report;
}
