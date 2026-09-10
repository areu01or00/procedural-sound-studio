import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { Codex } from './codex.mjs';
import { beforeTurn, afterTurn } from './hooks.mjs';
import { createSettings } from './settings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json' };
export async function safeFile(root, relative) {
  const base = await fs.realpath(root), target = await fs.realpath(path.resolve(base, relative));
  if (!target.startsWith(base + path.sep)) throw new Error('Path outside asset directory');
  if (!(await fs.stat(target)).isFile()) throw new Error('Not a file');
  return target;
}
export async function validateResult(dir) {
  const manifest = JSON.parse(await fs.readFile(await safeFile(dir, 'result.json'), 'utf8'));
  const out = { title: String(manifest.title || 'Untitled').slice(0, 120) };
  for (const [key, ext] of Object.entries({ audio:'.wav', svg:'.svg', code:'.py', notes:'.md' })) {
    const name = manifest[key];
    if (typeof name !== 'string' || path.isAbsolute(name) || path.extname(name) !== ext) throw new Error(`Invalid ${key} file`);
    const target = await safeFile(dir, name);
    if (!(await fs.stat(target)).size) throw new Error(`Empty ${key} file`);
    out[key] = name;
  }
  const handle = await fs.open(await safeFile(dir, out.audio));
  try {
    const bytes = Buffer.alloc(12); await handle.read(bytes, 0, 12, 0);
    if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio is not a WAV');
  } finally { await handle.close(); }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels', '-of', 'json', await safeFile(dir, out.audio)], { timeout: 15000 });
  const info = JSON.parse(stdout), stream = info.streams?.find(s => s.codec_type === 'audio');
  if (!stream || !(Number(info.format?.duration) > 0)) throw new Error('WAV has no decodable audio');
  out.duration = Number(info.format.duration); out.sampleRate = Number(stream.sample_rate); out.channels = stream.channels;
  return out;
}
export async function createStudio({ dataDir = path.join(ROOT, '.studio'), codex = new Codex() } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const settings = await createSettings(dataDir, codex);
  let settingsBusy = false;
  const statePath = path.join(dataDir, 'state.json');
  let state;
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; state = { projects: [], versions: [] }; }
  for (const v of state.versions) if (['running', 'starting', 'validating', 'repairing'].includes(v.status)) { v.status = 'interrupted'; v.error = 'Studio stopped during this version. Send another prompt to retry.'; }
  let saving = Promise.resolve(), active = null, finishing = false, closing = false;
  const approvals = new Map(), clients = new Set(), loaded = new Set();
  const save = () => { const snapshot = JSON.stringify(state, null, 2); saving = saving.then(async () => { await fs.writeFile(statePath + '.tmp', snapshot); await fs.rename(statePath + '.tmp', statePath); }); return saving; };
  await save();
  function broadcast(event, data) { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  function update() { broadcast('state', { ...state, approvals: [...approvals.values()] }); }
  async function finish(status, error) {
    const v = active; if (!v || finishing) return; finishing = true;
    const dir = path.join(dataDir, v.id);
    if (status === 'completed' && !closing && !v.cancelRequested) {
      v.status = 'validating'; delete v.turnId; await save(); update();
      let artifacts, report;
      try {
        artifacts = await validateResult(dir);
        report = await afterTurn({ root: ROOT, dir, artifacts });
      } catch (e) { report = { issues: [e.message], warnings: [] }; }
      v.outputCheck = report;
      await fs.writeFile(path.join(dir, 'output-check.json'), JSON.stringify(report, null, 2));
      const findings = [...report.issues, ...report.warnings];
      const hasWork = (await fs.readdir(dir)).some(f => /\.(svg|wav|py)$/.test(f));
      if (report.issues.length && !v.repairAttempts && hasWork && !closing && !v.cancelRequested) {
        v.repairAttempts = 1; v.status = 'repairing';
        const text = `Studio output hook found delivery problems:\n${findings.map(x => '- '+x).join('\n')}\nRepair this same delivery directory: ${dir}. Preserve the existing composition and WAV for display-only fixes. Parse and visually inspect the saved SVG; browser-invisible custom event tags are not visible notation. Show the actual arrangement or an explicitly labeled pattern/repeat representation. Do not simplify or replace the music. Fix missing/invalid files and write result.json last. If a necessary input is unavailable, report the blocker rather than inventing a substitute. This is the single automatic repair pass.`;
        await fs.writeFile(path.join(dir, 'output-repair.md'), text);
        v.log += '\n[Studio output check] '+findings.join(' ')+'\nRepairing delivery…\n';
        await save(); update(); finishing = false;
        try {
          const r = await codex.call('turn/start', { threadId: v.threadId, ...(v.model ? {model:v.model} : {}), input: [{type:'text',text}] });
          if (active === v && !v.cancelRequested) v.turnId = r.turn.id;
          else await codex.call('turn/interrupt', {threadId:v.threadId,turnId:r.turn.id});
        } catch (e) { if (active === v) await finish('failed', e.message); }
        return;
      }
      if (closing || v.cancelRequested) { status = 'interrupted'; error = 'Stopped during output validation'; }
      else if (report.issues.length) { status = 'failed'; error = 'Output validation failed: '+report.issues.join(' '); }
      else {
        v.artifacts = artifacts;
        if (!state.versions.some(x => x !== v && x.projectId === v.projectId && x.artifacts)) state.projects.find(p => p.id === v.projectId).title = artifacts.title;
        if (report.warnings.length) v.log += '\n[Studio output check] Review notes: '+report.warnings.join(' ')+'\n';
      }
    }
    v.status = v.cancelRequested ? 'interrupted' : status; if (error) v.error = error;
    active = null; finishing = false; approvals.clear(); await save(); update();
  }
  codex.on('disconnect', error => { loaded.clear(); void finish('failed', error); });
  codex.on('request', m => {
    // Every server request is visible. Unsupported requests fail explicitly rather than hanging.
    const kind = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(m.method) ? 'approval' : m.method === 'item/tool/requestUserInput' ? 'question' : 'unsupported';
    if (kind === 'unsupported') {
      codex.send({ id: m.id, error: { code: -32601, message: `Studio does not support ${m.method}` } });
      broadcast('log', { text: `Unsupported request: ${m.method}` }); return;
    }
    approvals.set(String(m.id), { id: m.id, method: m.method, kind, params: m.params }); update();
  });
  codex.on('notification', m => {
    const p = m.params || {};
    if (!active || (p.threadId && p.threadId !== active.threadId)) return;
    if (m.method === 'item/agentMessage/delta' || m.method === 'item/commandExecution/outputDelta') {
      active.log = (active.log + (p.delta || '')).slice(-60000);
      broadcast('log', { text: p.delta || '' });
    }
    if (m.method === 'item/started') broadcast('activity', { text: p.item?.command || p.item?.type || 'Working' });
    if (m.method === 'turn/started') active.turnId = p.turn.id;
    if (m.method === 'turn/completed' && (!active.turnId || !p.turn.id || p.turn.id === active.turnId)) void finish(p.turn.status, p.turn.error?.message);
  });
  const instructions = await fs.readFile(path.join(ROOT, 'resources/composer.md'), 'utf8');
  async function generate(body) {
    if (active || settingsBusy) throw new Error('Studio is busy; wait for the current operation');
    if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 20000) throw new Error('Enter a prompt of 1–20,000 characters');
    let project = state.projects.find(p => p.id === body.projectId);
    if (body.projectId && !project) throw new Error('Unknown project');
    if (!project) { project = { id: randomUUID(), title: body.prompt.trim().slice(0, 65) }; state.projects.push(project); }
    const v = { id: randomUUID(), projectId: project.id, prompt: body.prompt, created: new Date().toISOString(), status: 'starting', log: '' };
    active = v; state.versions.push(v);
    const dir = path.join(dataDir, v.id); await fs.mkdir(dir); await save(); update();
    void (async () => {
      try {
        await codex.start();
        const choice = await settings.selection();
        v.provider = choice.provider; v.model = choice.model;
        project.threads ||= {default:project.threadId};
        const threadId = project.threads[choice.provider];
        const config = { cwd: dataDir, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: instructions, ...choice.threadConfig };
        if (!threadId) { const r = await codex.call('thread/start', config); project.threads[choice.provider] = r.thread.id; loaded.add(r.thread.id); }
        else if (!loaded.has(threadId)) { await codex.call('thread/resume', { threadId, ...config }); loaded.add(threadId); }
        project.threadId = project.threads[choice.provider];
        if (active !== v) return;
        v.threadId = project.threadId; v.status = 'running'; await save(); update();
        const previous = state.versions.filter(x => x.projectId === project.id && x.artifacts).map(x => ({ directory: path.join(dataDir, x.id), title: x.artifacts.title }));
        const context = await beforeTurn({ root: ROOT, dataDir, prompt: body.prompt, history: state.versions.filter(x => x.projectId === project.id && x !== v) });
        v.contextHook = context.audit;
        await fs.writeFile(path.join(dir, 'context.md'), context.text);
        const text = `${context.text}\n\n<user_request>\n${body.prompt}\n</user_request>\n\nDelivery directory: ${dir}\nPython interpreter: ${process.env.STUDIO_PYTHON || '/home/x/Downloads/venv/bin/python'}\nPrior completed versions (read as references; do not overwrite): ${JSON.stringify(previous)}\nTechnique resources are linked in the working context. Choose the palette and form for this request; previous artifacts are references, not templates.\nCreate the complete SVG + paired renderer + WAV + notes + result.json in the delivery directory.`;
        const result = await codex.call('turn/start', { threadId: project.threadId, ...(v.model ? {model:v.model} : {}), input: [{ type: 'text', text }] });
        v.turnId = result.turn.id;
      } catch (e) { if (active === v) await finish('failed', e.message); }
    })();
    return v;
  }
  const server = http.createServer(async (req, res) => {
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      // No remote origins, wildcard CORS or arbitrary filesystem routes.
      const expected = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expected) return json(403, { error: 'Invalid host' });
      if (req.headers.origin && req.headers.origin !== `http://${expected}`) return json(403, { error: 'Invalid origin' });
      const url = new URL(req.url, `http://${expected}`);
      if (req.method === 'GET' && url.pathname === '/api/settings') return json(200, settings.publicValue());
      if (req.method === 'GET' && url.pathname === '/api/models') return json(200, {models:await settings.models()});
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...state, approvals: [...approvals.values()] });
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
        res.write(': connected\n\n'); clients.add(res);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
        req.on('close', () => { clearInterval(heartbeat); clients.delete(res); }); return;
      }
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100000) return json(413, { error: 'Request too large' }); }
        const body = JSON.parse(raw);
        if (url.pathname === '/api/settings') {
          if (active || settingsBusy) return json(409, {error:'Wait for the current turn before changing provider settings'});
          settingsBusy = true;
          try { return json(200, await settings.save(body)); } finally { settingsBusy = false; }
        }
        if (url.pathname === '/api/generate') return json(202, await generate(body));
        if (url.pathname === '/api/cancel') {
          if (active) active.cancelRequested = true;
          if (active?.turnId) await codex.call('turn/interrupt', { threadId: active.threadId, turnId: active.turnId });
          else if (active) await finish('interrupted', 'Cancelled before turn started');
          return json(200, { ok: true });
        }
        if (url.pathname === '/api/respond') {
          const a = approvals.get(String(body.id)); if (!a) throw new Error('Request expired');
          if (a.kind === 'question') {
            const answers = {};
            for (const q of a.params.questions) { const answer = body.answers?.[q.id]; if (typeof answer !== 'string') throw new Error('Answer every question'); answers[q.id] = { answers: [answer] }; }
            codex.respond(a.id, { answers });
          } else {
            if (!['accept', 'decline'].includes(body.decision)) throw new Error('Invalid decision');
            codex.respond(a.id, { decision: body.decision });
          }
          approvals.delete(String(body.id)); update(); return json(200, { ok: true });
        }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(404, { error: 'Not found' });
      let file;
      if (url.pathname.startsWith('/asset/')) {
        const [, , id, key] = url.pathname.split('/');
        const v = state.versions.find(x => x.id === id);
        if (!v?.artifacts || !['audio','svg','code','notes'].includes(key)) return json(404, { error: 'Unknown artifact' });
        file = await safeFile(path.join(dataDir, id), v.artifacts[key]);
      } else if (url.pathname.startsWith('/editor/')) file = await safeFile(path.join(ROOT, 'src'), decodeURIComponent(url.pathname.slice(8)) || 'index.html');
      else file = await safeFile(path.join(ROOT, 'web'), url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)));
      const stat = await fs.stat(file);
      const headers = { 'Content-Type': mime[path.extname(file)] || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' };
      if (file.endsWith('.svg')) headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      if (url.searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="${path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '_')}"`;
      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch (e) { if (!res.headersSent) json(e.code === 'ENOENT' ? 404 : 400, { error: e.message }); else res.destroy(); }
  });
  return {
    server,
    async listen(port = 0) { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return `http://127.0.0.1:${server.address().port}`; },
    async close() { closing = true; if (active) await finish('interrupted', 'Studio closed'); codex.close(); for (const c of clients) c.end(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await saving; }
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createStudio(); console.log(`Studio: ${await app.listen(Number(process.env.PORT || 5055))}`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(); });
}
