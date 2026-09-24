// Studio lifecycle hook: supply working knowledge before EVERY turn, including
// turns in already-loaded Codex threads. This does not install global CLI hooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PYTHON } from './python.mjs';
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

export async function beforeTurn({ root, dataDir, prompt, history = [], mode = 'sound', sourceImage = null, analysisPath = null, provider = 'default', web = true }) {
  const read = name => fs.readFile(path.join(root, 'resources', name), 'utf8');
  if (mode === 'painting') {
    const context = [await read('painting-context.md')];
    if (sourceImage) context.push(`Source image: ${sourceImage}\nDeterministic measurements: ${analysisPath}\nInspect analysis.json and its generated palette.svg and edges.png before designing the painting. Preserve source identity only to the degree requested; do not claim visual inspection you did not perform.`);
    context.push(await read('painting-output-context.md'));
    return {text:`<studio_painting_context>\n${context.join('\n\n')}\n</studio_painting_context>`,audit:{hook:'beforeTurn',version:1,mode:'painting',workflow:sourceImage?'reference':'generation',sourceImage:Boolean(sourceImage)}};
  }
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
  // Hook v10: fixed rules (composer, workbench, output) live in the system prompt;
  // this hook carries only the per-turn facts below.
  const context = [];
  // A keyword classifier cannot recognize arbitrary song/artist names. Always
  // expose the source workflow; routing only controls eager expansion.
  context.push(`If the request uses an existing recording, including a song named without a URL, read ${path.join(root, 'resources/reference-context.md')} before acting. Resolve and acquire the actual source through your tools. The routing hint is not a determination that the request is original composition. Existing local inputs may be found under ${path.join(dataDir, 'references')}.`);
  if (referenceTask) {
    context.push(await read('reference-context.md'));
    context.push(`Available reconstruction helper: ${path.join(root, 'resources/reference/analyse.py')}\nExisting local reference excerpts (check whether the source matches this task):\n${JSON.stringify(refs, null, 2)}`);
  } else context.push(await read('svg-composition-context.md'));
  // Web research is a per-turn Studio setting; the tools are removed too (settings.mjs, claude.mjs).
  if (web) {
    context.push(await read('research-context.md'));
    // The web-wrapper example is Codex tooling; Claude brings WebSearch/WebFetch.
    if (provider !== 'claude') context.push(await read('research-codex.md'));
  } else context.push(await read('research-off.md'));
  return {
    text: `<studio_working_context>\n${context.join('\n\n')}\n</studio_working_context>`,
    audit: { hook: 'beforeTurn', version: 10, workflow, provider, web, referenceWorkflow: referenceTask, localReferenceCount: refs.length }
  };
}

export async function afterTurn({ root, dir, artifacts, workflow = 'generation', mode = 'sound' }) {
  if (mode === 'painting') {
    const {stdout}=await run(PYTHON,[
      path.join(root,'resources/painting/check_output.py'),
      ...['svg','code','image','process'].map(k=>path.join(dir,artifacts[k]))
    ],{timeout:30000,maxBuffer:1024*1024});
    const report=JSON.parse(stdout); await fs.writeFile(path.join(dir,'output-check.json'),JSON.stringify(report,null,2)); return report;
  }
  const python = PYTHON;
  const { stdout } = await run(python,
    [path.join(root, 'resources/check_output.py'), ...['svg','code','audio'].map(k => path.join(dir, artifacts[k])), workflow],
    { timeout: 30000, maxBuffer: 1024 * 1024 });
  const report = JSON.parse(stdout);
  // Executable silence test, sound generation only: strip every data-audible mark
  // in a temp copy, rerun render.py sandboxed, require finite silence. Duplicate
  // findings (both scripts can report a missing data-audible contract) keep the
  // check_output.py wording, which runs first.
  if (mode === 'sound' && workflow === 'generation') {
    try {
      const { stdout: silenceOut } = await run(python,
        [path.join(root, 'resources/silence_check.py'), dir, artifacts.svg, artifacts.code, artifacts.audio],
        { timeout: 200000, maxBuffer: 4 * 1024 * 1024 });
      const silence = JSON.parse(silenceOut);
      for (const issue of silence.issues || []) if (!report.issues.includes(issue)) report.issues.push(issue);
      for (const warning of silence.warnings || []) if (!report.warnings.includes(warning)) report.warnings.push(warning);
      report.silence = silence.silence || {};
    } catch (e) {
      report.warnings.push('Silence test could not be completed: ' + String(e.message || e).slice(0, 300));
      report.silence = { ran: false, error: String(e.message || e).slice(0, 300) };
    }
  }
  await fs.writeFile(path.join(dir, 'output-check.json'), JSON.stringify(report, null, 2));
  return report;
}
