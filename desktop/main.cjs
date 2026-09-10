const { app, BrowserWindow } = require('electron');
let studio, quitting = false;
app.whenReady().then(async () => {
  studio = await (await import('../server/index.mjs')).createStudio();
  const url = await studio.listen();
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 650, backgroundColor: '#17191c', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, destination) => { if (new URL(destination).origin !== url) event.preventDefault(); });
  win.webContents.on('will-frame-navigate', (event, destination) => { if (new URL(destination).origin !== url) event.preventDefault(); });
  await win.loadURL(url);
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (studio && !quitting) { event.preventDefault(); quitting = true; studio.close().finally(() => app.quit()); }
});
