const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
app.whenReady().then(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-inference-ui-'));
 class Fake extends EventEmitter {async start(){} async configureEnvironment(){} close(){} async call(){return {data:[{model:'test',displayName:'Test',isDefault:true}]};}}
 const fetcher=async url=>Response.json({data:{endpoints:url.includes('/second/')?[{tag:'novita/fp8',provider_name:'Novita',status:0}]:[{tag:'fireworks',provider_name:'Fireworks',status:0}]}});
 const studio=await (await import('../server/index.mjs')).createStudio({dataDir:dir,codex:new Fake(),fetcher});
 const url=await studio.listen(),win=new BrowserWindow({show:true,width:1100,height:850,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 const js=s=>win.webContents.executeJavaScript(s);
 const wait=async expr=>{for(let i=0;i<100;i++){if(await js(expr))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI timeout '+expr);};
 try {
  await win.loadURL(url);await js(`document.getElementById('settings').click()`);
  await wait(`!document.getElementById('settings-save').disabled`);
  await js(`document.getElementById('provider').value='openrouter';document.getElementById('provider').dispatchEvent(new Event('change'));document.getElementById('openrouter-model').value='vendor/first';document.getElementById('openrouter-model').dispatchEvent(new Event('input'));`);
  await wait(`document.querySelector('#inference-provider option[value="fireworks"]')!==null`);
  await js(`document.getElementById('inference-provider').value='fireworks';document.getElementById('inference-provider').dispatchEvent(new Event('change'));document.getElementById('openrouter-key').value='fake-test-key';document.getElementById('settings-form').requestSubmit();`);
  await wait(`!document.getElementById('settings-dialog').open`);
  const saved=await fetch(url+'/api/settings').then(r=>r.json());
  if(saved.openrouterInferenceProviders['vendor/first']!=='fireworks')throw Error('Selection not persisted');
  await js(`document.getElementById('settings').click()`);
  await wait(`!document.getElementById('settings-save').disabled && !document.getElementById('inference-provider').disabled && document.getElementById('inference-provider').value==='fireworks'`);
  await js(`document.getElementById('openrouter-model').value='second/model';document.getElementById('openrouter-model').dispatchEvent(new Event('input'));`);
  await wait(`document.querySelector('#inference-provider option[value="novita/fp8"]')!==null`);
  if(await js(`document.querySelector('#inference-provider option[value="fireworks"]')!==null`))throw Error('Stale provider');
  await fs.writeFile('/tmp/studio-inference-provider.png',(await win.webContents.capturePage()).toPNG());
  console.log('Provider dropdown loads, saves, restores and refreshes per model; no inference calls.');
 } catch(e) { console.error(e);process.exitCode=1; } finally {win.destroy();await studio.close();await fs.rm(dir,{recursive:true,force:true});app.exit(process.exitCode || 0);}
}).catch(e=>{console.error(e);app.exit(1);});
