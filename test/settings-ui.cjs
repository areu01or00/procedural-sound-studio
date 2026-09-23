// Read-only model-catalog/UI smoke. No generation or paid API calls.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
app.whenReady().then(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-settings-ui-'));
  const studio=await (await import('../server/index.mjs')).createStudio({dataDir:dir});
  const url=await studio.listen();
  const win=new BrowserWindow({show:true,width:1150,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s);
  try {
    await win.loadURL(url);
    await js(`document.getElementById('settings').click()`);
    for(let i=0;i<120;i++) {
      if(await js(`document.querySelectorAll('#openai-model option').length>1`))break;
      await new Promise(r=>setTimeout(r,250));
    }
    const result=await js(`({dialog:document.getElementById('settings-dialog').open,models:[...document.querySelectorAll('#openai-model option')].map(o=>o.textContent),error:document.getElementById('settings-error').textContent})`);
    if(!result.dialog || result.models.length<2 || result.error)throw new Error(JSON.stringify(result));
    await new Promise(r=>setTimeout(r,500));
    await fs.writeFile('/tmp/studio-settings-openai.png',(await win.webContents.capturePage()).toPNG());
    await js(`document.getElementById('provider').value='openrouter';document.getElementById('provider').dispatchEvent(new Event('change'));`);
    const router=await js(`({manualModel:!document.getElementById('openrouter-fields').hidden,openaiHidden:document.getElementById('openai-fields').hidden,password:document.getElementById('openrouter-key').type})`);
    if(!router.manualModel||!router.openaiHidden||router.password!=='password')throw new Error('OpenRouter fields failed');
    await new Promise(r=>setTimeout(r,300));
    await fs.writeFile('/tmp/studio-settings-openrouter.png',(await win.webContents.capturePage()).toPNG());
    await js(`document.getElementById('provider').value='claude';document.getElementById('provider').dispatchEvent(new Event('change'));`);
    for(let i=0;i<120;i++) { if(await js(`document.querySelectorAll('#claude-model option').length>1`))break; await new Promise(r=>setTimeout(r,250)); }
    const claude=await js(`({visible:!document.getElementById('claude-fields').hidden,routerHidden:document.getElementById('openrouter-fields').hidden,models:[...document.querySelectorAll('#claude-model option')].map(o=>o.value+' | '+o.textContent),efforts:[...document.querySelectorAll('#effort option')].map(o=>o.value||'(default)'),status:document.getElementById('claude-status').textContent})`);
    if(!claude.visible||!claude.routerHidden||claude.models.length<2)throw new Error('Claude fields failed '+JSON.stringify(claude));
    await js(`document.getElementById('claude-model').click()`);
    await new Promise(r=>setTimeout(r,300));
    await fs.writeFile('/tmp/studio-settings-claude.png',(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({catalog:result.models,router,claude},null,2));
  } finally {await studio.close();win.destroy();await fs.rm(dir,{recursive:true,force:true});app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
