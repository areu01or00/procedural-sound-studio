// Live score stage check: ./node_modules/.bin/electron test/stage-ui.cjs
// Seeds a throwaway data dir with the Sky example (plus a hostile SVG), plays it, captures frames.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), EX = path.join(ROOT, 'resources/examples/sky-stays-open');

app.whenReady().then(async () => {
  const { PYTHON: PY } = await import('../server/python.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-stage-'));
  const version = (id, title, created) => ({ id, projectId: 'p-' + id, mode: 'sound', prompt: title, created, status: 'completed', log: '', artifacts: { title, type: 'sound', audio: 'audio.wav', svg: 'score.svg', code: 'render.py', notes: 'NOTES.md', duration: 64, sampleRate: 44100, channels: 2 } });
  const sky = path.join(dir, 'sky'); await fs.cp(EX, sky, { recursive: true });
  execFileSync(PY, [path.join(sky, 'render.py')]);
  const hostile = path.join(dir, 'hostile'); await fs.cp(sky, hostile, { recursive: true });
  const svg = await fs.readFile(path.join(hostile, 'score.svg'), 'utf8');
  await fs.writeFile(path.join(hostile, 'score.svg'), svg.replace('<rect ', '<script>window.pwned=1</script><foreignObject><iframe src="https://example.org"></iframe></foreignObject><rect onload="window.pwned=2" '));
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ projects: [{ id: 'p-hostile', title: 'Hostile', mode: 'sound' }, { id: 'p-sky', title: 'Sky', mode: 'sound' }],
    versions: [version('hostile', 'Hostile', '2026-01-01T00:00:00Z'), version('sky', 'The Sky Stays Open', '2026-01-02T00:00:00Z')] }));
  const studio = await (await import('../server/index.mjs')).createStudio({ dataDir: dir }), url = await studio.listen();
  const win = new BrowserWindow({ show: true, width: 1440, height: 1100, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const js = s => win.webContents.executeJavaScript(s), wait = ms => new Promise(r => setTimeout(r, ms));
  const errors = []; win.webContents.on('console-message', e => { if (e.level === 'error') errors.push(e.message); });
  const ready = async () => { for (let i = 0; i < 150; i++) { if (await js(`(() => { const e=document.getElementById('editor').contentWindow.PKAudioEditor; return !!e?.engine?.wavesurfer?.getDuration?.() && !e.ui.loaderEl.classList.contains('pk_act'); })()`)) return; await wait(200); } throw new Error('editor never loaded audio'); };
  const pick = async title => { await js(`(() => { const s=document.getElementById('projects'); s.value=[...s.options].find(o=>o.textContent.includes(${JSON.stringify(title)})).value; s.dispatchEvent(new Event('change')); })()`); };
  const shot = async name => fs.writeFile(`/tmp/studio-stage-${name}.png`, (await win.webContents.capturePage()).toPNG());
  try {
    await win.loadURL(url); await wait(800);
    await pick('Hostile'); await ready(); await wait(600);
    const hostileResult = await js(`(() => { const r=document.getElementById('stage-view').shadowRoot; return { pwned: window.pwned || null, scripts: r.querySelectorAll('script,foreignObject,iframe').length, handlers: [...r.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>a.name.startsWith('on'))).length }; })()`);
    await pick('Sky'); await ready(); await wait(600);
    await js(`document.getElementById('stage').scrollIntoView()`); await js(`document.querySelector('.work').scrollTop=0`);
    await js(`document.getElementById('stage-play').click()`); await wait(9500); await shot('playing');
    const playing = await js(`(() => { const r=document.getElementById('stage-view').shadowRoot; return { time: document.getElementById('stage-time').textContent, hint: document.getElementById('stage-hint').textContent, marks: r.querySelectorAll('.stage-mark').length, on: r.querySelectorAll('.stage-mark.on').length, done: r.querySelectorAll('.stage-mark.done').length, ripples: r.querySelectorAll('g[pointer-events] > g circle').length, playing: r.querySelector('svg').classList.contains('playing') }; })()`);
    await js(`document.getElementById('stage-full').click()`); await wait(1500); await shot('full'); await js(`document.exitFullscreen()`); await wait(500);
    await js(`document.getElementById('stage-zoom').click()`); await wait(4000); await shot('zoom');
    await js(`document.getElementById('stage-play').click()`); await wait(300);
    const paused = await js(`document.getElementById('editor').contentWindow.PKAudioEditor.engine.wavesurfer.isPlaying()`);
    console.log(JSON.stringify({ hostileResult, playing, pausedStillPlaying: paused, errors }, null, 2));
    if (hostileResult.pwned || hostileResult.scripts || hostileResult.handlers || !playing.marks || !playing.on || !playing.playing || paused || errors.length) throw new Error('stage acceptance failed');
  } finally { await studio.close(); win.destroy(); await fs.rm(dir, { recursive: true, force: true }); app.quit(); }
}).catch(e => { console.error(e); app.exit(1); });
