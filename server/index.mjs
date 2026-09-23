import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { Codex } from './codex.mjs';
import { ClaudeAgent } from './claude.mjs';
import { beforeTurn, afterTurn } from './hooks.mjs';
import { createSettings } from './settings.mjs';
import { researchEvent } from './research.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.mp4':'video/mp4', '.ico':'image/x-icon', '.json':'application/json', '.md':'text/markdown; charset=utf-8', '.py':'text/plain; charset=utf-8' };
export async function safeFile(root, relative) {
  const base = await fs.realpath(root), target = await fs.realpath(path.resolve(base, relative));
  if (!target.startsWith(base + path.sep)) throw new Error('Path outside asset directory');
  if (!(await fs.stat(target)).isFile()) throw new Error('Not a file');
  return target;
}
export async function validateResult(dir, mode = 'sound') {
  const manifest = JSON.parse(await fs.readFile(await safeFile(dir, 'result.json'), 'utf8'));
  const out = { title: String(manifest.title || 'Untitled').slice(0, 120), type: mode };
  const contract = mode === 'painting' ? { image:['.png'], svg:['.svg'], code:['.py'], process:['.mp4','.gif'], notes:['.md'] } : { audio:['.wav'], svg:['.svg'], code:['.py'], notes:['.md'] };
  for (const [key, exts] of Object.entries(contract)) {
    const name = manifest[key];
    if (typeof name !== 'string' || path.isAbsolute(name) || !exts.includes(path.extname(name).toLowerCase())) throw new Error(`Invalid ${key} file`);
    const target = await safeFile(dir, name);
    if (!(await fs.stat(target)).size) throw new Error(`Empty ${key} file`);
    out[key] = name;
  }
  if (mode === 'painting') {
    const image = await safeFile(dir, out.image), processFile = await safeFile(dir, out.process);
    const { stdout } = await run('ffprobe', ['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',image], {timeout:15000});
    const info = JSON.parse(stdout), stream = info.streams?.find(s => s.codec_type === 'video');
    if (!stream || !(Number(stream.width)>0) || !(Number(stream.height)>0)) throw new Error('Painting has no decodable pixels');
    const processInfo = JSON.parse((await run('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',processFile],{timeout:15000})).stdout);
    const processStream = processInfo.streams?.find(s => s.codec_type === 'video');
    if (!processStream || !(Number(processInfo.format?.duration)>0)) throw new Error('Process playback has no decodable frames');
    out.width=Number(stream.width); out.height=Number(stream.height); out.duration=Number(processInfo.format.duration);
    return out;
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
export async function createStudio({ dataDir = path.join(ROOT, '.studio'), codex = new Codex(), claude = new ClaudeAgent(), fetcher = fetch } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const settings = await createSettings(dataDir, codex, {fetcher});
  let settingsBusy = false;
  const statePath = path.join(dataDir, 'state.json');
  let state;
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; state = { projects: [], versions: [] }; }
  for (const v of state.versions) if (['running', 'starting', 'validating', 'repairing'].includes(v.status)) { v.status = 'interrupted'; v.error = 'Studio stopped during this version. Send another prompt to retry.'; }
  let saving = Promise.resolve(), active = null, finishing = false, closing = false;
  const approvals = new Map(), clients = new Set(), loaded = new Set();
  // One active turn at a time; its provider decides which agent backend serves it.
  const agentFor = v => v?.provider === 'claude' ? claude : codex;
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
        artifacts = await validateResult(dir, v.mode || 'sound');
        report = await afterTurn({ root: ROOT, dir, artifacts, workflow: v.contextHook?.workflow || 'generation', mode: v.mode || 'sound' });
      } catch (e) { report = { issues: [e.message], warnings: [] }; }
      v.outputCheck = report;
      await fs.writeFile(path.join(dir, 'output-check.json'), JSON.stringify(report, null, 2));
      const findings = [...report.issues, ...report.warnings];
      const hasWork = (await fs.readdir(dir)).some(f => /\.(svg|wav|png|mp4|gif|py)$/.test(f));
      if (report.issues.length && !v.repairAttempts && hasWork && !closing && !v.cancelRequested) {
        v.repairAttempts = 1; v.status = 'repairing';
        const text = v.mode === 'painting'
          ? `Studio painting output hook found delivery problems:\n${findings.map(x => '- '+x).join('\n')}\nRepair this same delivery directory: ${dir}. Preserve the artistic decisions. Ensure painting.svg visibly contains the complete ordered brushstroke construction, render.py consumes it, painting.png is the final render, and process.mp4 or process.gif reveals at least three progressive stages. Fix invalid files and write result.json last. This is the single automatic repair pass.`
          : `Studio output hook found delivery problems:\n${findings.map(x => '- '+x).join('\n')}\nRepair this same delivery directory: ${dir}. Preserve the existing composition and WAV for display-only fixes. Parse and visually inspect the saved SVG; browser-invisible custom event tags are not visible notation. Show the actual arrangement or an explicitly labeled pattern/repeat representation. Do not simplify or replace the music. Fix missing/invalid files and write result.json last. If a necessary input is unavailable, report the blocker rather than inventing a substitute. If the silence test failed, mark every sound-producing element with data-audible and make render.py produce finite silence when those marks are removed. This is the single automatic repair pass.`;
        await fs.writeFile(path.join(dir, 'output-repair.md'), text);
        v.log += '\n[Studio output check] '+findings.join(' ')+'\nRepairing delivery…\n';
        await save(); update(); finishing = false;
        try {
          const r = await agentFor(v).call('turn/start', { threadId: v.threadId, ...(v.model ? {model:v.model} : {}), ...(v.effort ? {effort:v.effort} : {}), input: [{type:'text',text}] });
          if (active === v && !v.cancelRequested) v.turnId = r.turn.id;
          else await agentFor(v).call('turn/interrupt', {threadId:v.threadId,turnId:r.turn.id});
        } catch (e) { if (active === v) await finish('failed', e.message); }
        return;
      }
      if (closing || v.cancelRequested) { status = 'interrupted'; error = 'Stopped during output validation'; }
      else if (report.issues.length) { status = 'failed'; error = !hasWork ? (v.lastAgentMessage || 'No audio delivery was produced. See the conversation for the source blocker or response.') : 'Output validation failed: '+report.issues.join(' '); }
      else {
        v.artifacts = artifacts;
        if (!state.versions.some(x => x !== v && x.projectId === v.projectId && x.artifacts)) state.projects.find(p => p.id === v.projectId).title = artifacts.title;
        if (report.warnings.length) v.log += '\n[Studio output check] Review notes: '+report.warnings.join(' ')+'\n';
      }
    }
    v.status = v.cancelRequested ? 'interrupted' : status; if (error) v.error = error;
    active = null; finishing = false; approvals.clear(); await save(); update();
  }
  codex.on('disconnect', error => { loaded.clear(); if (agentFor(active) === codex) void finish('failed', error); });
  for (const agent of [codex, claude]) {
  agent.on('request', m => {
    // Every server request is visible. Unsupported requests fail explicitly rather than hanging.
    const kind = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(m.method) ? 'approval' : m.method === 'item/tool/requestUserInput' ? 'question' : 'unsupported';
    if (kind === 'unsupported') {
      agent.send({ id: m.id, error: { code: -32601, message: `Studio does not support ${m.method}` } });
      broadcast('log', { text: `Unsupported request: ${m.method}` }); return;
    }
    // Unattended runs: accept tool approvals automatically; questions still need a person.
    if (kind === 'approval' && settings.publicValue().autoApprove) {
      agent.respond(m.id, { decision: 'accept' });
      const text = `\n[Studio auto-approved] ${m.params?.reason || m.params?.command || m.method}\n`;
      if (active) active.log = (active.log + text).slice(-60000);
      broadcast('log', { text }); return;
    }
    approvals.set(String(m.id), { id: m.id, method: m.method, kind, params: m.params }); update();
  });
  agent.on('notification', m => {
    const p = m.params || {};
    if (!active || (p.threadId && p.threadId !== active.threadId)) return;
    const evidence = researchEvent(m);
    if (evidence) {
      const evidencePath = path.join(dataDir, active.id, 'research-events.jsonl');
      saving = saving.then(() => fs.appendFile(evidencePath, JSON.stringify(evidence) + '\n')).catch(error => {
        broadcast('log', {text: `Research evidence could not be saved: ${error.message}\n`});
      });
    }
    if (m.method === 'item/agentMessage/delta' || m.method === 'item/commandExecution/outputDelta') {
      active.log = (active.log + (p.delta || '')).slice(-60000);
      broadcast('log', { text: p.delta || '' });
    }
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) active.lastAgentMessage = p.item.text;
    if (m.method === 'item/started') broadcast('activity', { text: p.item?.command || p.item?.type || 'Working' });
    if (m.method === 'turn/started') active.turnId = p.turn.id;
    if (m.method === 'turn/completed' && (!active.turnId || !p.turn.id || p.turn.id === active.turnId)) void finish(p.turn.status, p.turn.error?.message);
  });
  }
  const readResource = name => fs.readFile(path.join(ROOT, 'resources', name), 'utf8');
  // Hook v10: fixed rules for every sound turn are the system prompt, built once
  // at startup. Codex thread/resume and the Claude backend both re-send
  // developerInstructions each turn, so existing projects pick this up too.
  const instructions = {
    sound: (await Promise.all(['composer.md', 'workbench-context.md', 'output-context.md'].map(readResource))).join('\n\n'),
    painting: await readResource('painter.md')
  };
  async function generate(body) {
    if (active || settingsBusy) throw new Error('Studio is busy; wait for the current operation');
    if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 20000) throw new Error('Enter a prompt of 1–20,000 characters');
    const requestedMode = body.mode === 'painting' ? 'painting' : 'sound';
    let sourceUpload=null;
    if (requestedMode === 'painting' && body.image) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
      if (!match) throw new Error('Image must be PNG, JPEG or WebP');
      const bytes=Buffer.from(match[2],'base64'); if (!bytes.length || bytes.length>12*1024*1024) throw new Error('Image must be 1 byte–12 MB');
      sourceUpload={bytes,ext:match[1]==='image/jpeg'?'.jpg':'.'+match[1].split('/')[1]};
    }
    let project = state.projects.find(p => p.id === body.projectId);
    if (body.projectId && !project) throw new Error('Unknown project');
    if (!project) { project = { id: randomUUID(), title: body.prompt.trim().slice(0, 65), mode:requestedMode }; state.projects.push(project); }
    project.mode ||= 'sound';
    if (project.mode !== requestedMode) throw new Error(`This is a ${project.mode} project; start a new ${requestedMode} project`);
    const v = { id: randomUUID(), projectId: project.id, mode:project.mode, prompt: body.prompt, created: new Date().toISOString(), status: 'starting', log: '', autoApprove: !!settings.publicValue().autoApprove };
    active = v; state.versions.push(v);
    const dir = path.join(dataDir, v.id); await fs.mkdir(dir);
    if (sourceUpload) {
      v.sourceImage='source'+sourceUpload.ext; await fs.writeFile(path.join(dir,v.sourceImage),sourceUpload.bytes);
      await run(process.env.STUDIO_PYTHON || '/home/x/Downloads/venv/bin/python',[path.join(ROOT,'resources/painting/analyse.py'),path.join(dir,v.sourceImage),dir],{timeout:30000,maxBuffer:1024*1024});
      project.sourceVersion=v.id;
    } else if (v.mode === 'painting' && project.sourceVersion) {
      const prior=state.versions.find(x=>x.id===project.sourceVersion), priorDir=path.join(dataDir,project.sourceVersion);
      if (prior?.sourceImage) {
        v.sourceImage=prior.sourceImage;
        for (const name of [v.sourceImage,'analysis.json','edges.png','palette.svg']) await fs.copyFile(path.join(priorDir,name),path.join(dir,name));
      }
    }
    await save(); update();
    void (async () => {
      try {
        const choice = await settings.selection(`http://127.0.0.1:${server.address().port}`);
        v.provider = choice.provider; v.model = choice.model; v.inferenceProvider = choice.inferenceProvider || null; v.webResearch = choice.webResearch !== false; v.effort = choice.effort || null;
        const agent = agentFor(v); await agent.start();
        project.threads ||= {default:project.threadId};
        const threadKey = v.mode === 'sound' ? choice.provider : `${choice.provider}:painting`;
        const threadId = project.threads[threadKey];
        const config = { cwd: dataDir, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: instructions[v.mode], ...choice.threadConfig };
        if (!threadId) { const r = await agent.call('thread/start', config); project.threads[threadKey] = r.thread.id; loaded.add(r.thread.id); }
        else if (!loaded.has(threadId)) { await agent.call('thread/resume', { threadId, ...config }); loaded.add(threadId); }
        project.threadId = project.threads[threadKey];
        if (active !== v) return;
        v.threadId = project.threadId; v.status = 'running'; await save(); update();
        const previous = state.versions.filter(x => x.projectId === project.id && x.artifacts).map(x => ({ directory: path.join(dataDir, x.id), title: x.artifacts.title }));
        const context = await beforeTurn({ root: ROOT, dataDir, prompt: body.prompt, history: state.versions.filter(x => x.projectId === project.id && x !== v), mode:v.mode, provider:v.provider, web:v.webResearch, sourceImage:v.sourceImage ? path.join(dir,v.sourceImage) : null, analysisPath:v.sourceImage ? path.join(dir,'analysis.json') : null });
        v.contextHook = context.audit;
        // Prompt hashes for future benchmarking: exact system prompt and per-turn context.
        v.contextHook.systemPromptHash = createHash('sha256').update(instructions[v.mode]).digest('hex');
        v.contextHook.contextHash = createHash('sha256').update(context.text).digest('hex');
        await fs.writeFile(path.join(dir, 'context.md'), context.text);
        await fs.writeFile(path.join(dir, 'system-prompt.md'), instructions[v.mode]);
        const example = v.mode === 'painting' ? path.join(ROOT,'resources/painting/example') : path.join(ROOT,'resources/glass_tide_example.py');
        const delivery = v.mode === 'painting' ? 'Create painting.svg + paired render.py + painting.png + process.mp4 (or process.gif) + notes.md + result.json.' : 'Create the complete SVG + paired renderer + WAV + notes + result.json in the delivery directory.';
        const text = `${context.text}\n\n<user_request>\n${body.prompt}\n</user_request>\n\nDelivery directory: ${dir}\nPython interpreter: ${process.env.STUDIO_PYTHON || '/home/x/Downloads/venv/bin/python'}\nPrior completed versions (read as references; do not overwrite): ${JSON.stringify(previous)}\nOptional working example: ${example}. Read it if useful; create for the current request.\n${delivery}`;
        const result = await agent.call('turn/start', { threadId: project.threadId, ...(v.model ? {model:v.model} : {}), ...(v.effort ? {effort:v.effort} : {}), input: [{ type: 'text', text }] });
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
      if (req.method === 'POST' && /^\/openrouter\/[^/]+\/responses$/.test(url.pathname)) {
        const provider = decodeURIComponent(url.pathname.split('/')[2]);
        if (!active || active.provider !== 'openrouter' || active.inferenceProvider !== provider) return json(409,{error:'No matching active provider turn'});
        return await settings.relay(req,res,provider);
      }
      if (req.method === 'GET' && url.pathname === '/api/openrouter/providers') return json(200,{providers:await settings.providers(url.searchParams.get('model') || '')});
      if (req.method === 'GET' && url.pathname === '/api/settings') return json(200, settings.publicValue());
      if (req.method === 'GET' && url.pathname === '/api/models') return json(200, {models:await settings.models()});
      if (req.method === 'GET' && url.pathname === '/api/claude/models') return json(200, {models:await claude.models()});
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...state, approvals: [...approvals.values()] });
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
        res.write(': connected\n\n'); clients.add(res);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
        req.on('close', () => { clearInterval(heartbeat); clients.delete(res); }); return;
      }
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 17*1024*1024) return json(413, { error: 'Request too large' }); }
        const body = JSON.parse(raw);
        if (url.pathname === '/api/settings') {
          if (active || settingsBusy) return json(409, {error:'Wait for the current turn before changing provider settings'});
          settingsBusy = true;
          try { const saved = await settings.save(body); loaded.clear(); return json(200, saved); } finally { settingsBusy = false; }
        }
        if (url.pathname === '/api/generate') return json(202, await generate(body));
        if (url.pathname === '/api/cancel') {
          if (active) active.cancelRequested = true;
          if (active?.turnId) await agentFor(active).call('turn/interrupt', { threadId: active.threadId, turnId: active.turnId });
          else if (active) await finish('interrupted', 'Cancelled before turn started');
          return json(200, { ok: true });
        }
        if (url.pathname === '/api/respond') {
          const a = approvals.get(String(body.id)); if (!a) throw new Error('Request expired');
          if (a.kind === 'question') {
            const answers = {};
            for (const q of a.params.questions) { const answer = body.answers?.[q.id]; if (typeof answer !== 'string') throw new Error('Answer every question'); answers[q.id] = { answers: [answer] }; }
            agentFor(active).respond(a.id, { answers });
          } else {
            if (!['accept', 'decline'].includes(body.decision)) throw new Error('Invalid decision');
            agentFor(active).respond(a.id, { decision: body.decision });
          }
          approvals.delete(String(body.id)); update(); return json(200, { ok: true });
        }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(404, { error: 'Not found' });
      let file;
      if (url.pathname.startsWith('/asset/')) {
        const [, , id, key] = url.pathname.split('/');
        const v = state.versions.find(x => x.id === id);
        if (!v?.artifacts || !['audio','image','svg','code','process','notes','source','analysis','edges','palette'].includes(key)) return json(404, { error: 'Unknown artifact' });
        const inputArtifacts={source:v.sourceImage,analysis:v.sourceImage?'analysis.json':null,edges:v.sourceImage?'edges.png':null,palette:v.sourceImage?'palette.svg':null};
        if (key in inputArtifacts) { if (!inputArtifacts[key]) return json(404,{error:'No source image'}); file=await safeFile(path.join(dataDir,id),inputArtifacts[key]); }
        else
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
    async close() { closing = true; if (active) await finish('interrupted', 'Studio closed'); codex.close(); claude.close(); for (const c of clients) c.end(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await saving; }
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createStudio(); console.log(`Studio: ${await app.listen(Number(process.env.PORT || 5055))}`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(); });
}
