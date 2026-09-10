// Run with: ./node_modules/.bin/electron test/ui.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
app.whenReady().then(async () => {
  const studio = await (await import('../server/index.mjs')).createStudio();
  const url = await studio.listen();
  const win = new BrowserWindow({ show: true, width: 1440, height: 960, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  try {
    await win.loadURL(url);
    for (let i = 0; i < 100; i++) {
      const ready = await win.webContents.executeJavaScript(`(() => { const e = document.getElementById('editor').contentWindow.PKAudioEditor; return !!e?.engine?.is_ready && !e.ui.loaderEl.classList.contains('pk_act'); })()`);
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await new Promise(resolve => setTimeout(resolve, 750));
    const result = await win.webContents.executeJavaScript(`({title:document.getElementById('title').textContent, versions:document.querySelectorAll('#versions button').length, loaderVisible:document.getElementById('editor').contentWindow.PKAudioEditor.ui.loaderEl.classList.contains('pk_act'), duration:document.getElementById('editor').contentWindow.PKAudioEditor?.engine?.wavesurfer.getDuration(), channels:document.getElementById('editor').contentWindow.PKAudioEditor?.engine?.wavesurfer.backend.buffer?.numberOfChannels, editorReady:!!document.getElementById('editor').contentWindow.PKAudioEditor?.engine?.is_ready, score:!document.getElementById('score').hidden, code:document.getElementById('code').textContent.length, nodeExposed:typeof require !== 'undefined'})`);
    await fs.writeFile('/tmp/studio-ui.png', (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ ...result, errors },null,2));
    if (result.loaderVisible || Math.abs(result.duration - 5) > 0.001 || result.channels !== 2 || !result.editorReady || !result.score || !result.code || result.nodeExposed || errors.length) throw new Error('UI acceptance failed');
  } finally { await studio.close(); win.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
