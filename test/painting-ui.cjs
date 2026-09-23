// Read-only Painting-mode UI smoke using the bundled example; no model call.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
app.whenReady().then(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-painting-ui-')),id='painting-demo',projectId='painting-project';
 await fs.mkdir(path.join(dir,id));
 const source=path.join(__dirname,'../resources/painting/example');
 for(const name of ['painting.svg','render.py','painting.png','process.mp4','notes.md','result.json'])await fs.copyFile(path.join(source,name),path.join(dir,id,name));
 await fs.writeFile(path.join(dir,'state.json'),JSON.stringify({projects:[{id:projectId,title:'Aurora Study',mode:'painting'}],versions:[{id,projectId,mode:'painting',prompt:'Paint an aurora study',created:new Date().toISOString(),status:'completed',log:'',artifacts:{title:'Aurora Study',type:'painting',image:'painting.png',svg:'painting.svg',code:'render.py',process:'process.mp4',notes:'notes.md',width:960,height:600,duration:12}}]}));
 const studio=await (await import('../server/index.mjs')).createStudio({dataDir:dir}),url=await studio.listen();
 const win=new BrowserWindow({show:true,width:1440,height:960,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}}),errors=[];
 win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 try{
  await win.loadURL(url); await new Promise(r=>setTimeout(r,1200));
  const result=await win.webContents.executeJavaScript(`({mode:document.getElementById('painting-mode').classList.contains('active'),painting:!document.getElementById('painting').hidden&&document.getElementById('painting').naturalWidth,editor:document.getElementById('editor').hidden,tabs:document.querySelectorAll('.painting-tabs button').length,code:document.getElementById('code').textContent.length,nodeExposed:typeof require!=='undefined'})`);
  await fs.writeFile('/tmp/studio-painting-ui.png',(await win.webContents.capturePage()).toPNG()); console.log(JSON.stringify({...result,errors},null,2));
  if(!result.mode||!result.painting||!result.editor||result.tabs!==4||!result.code||result.nodeExposed||errors.length)throw new Error('Painting UI acceptance failed');
 } finally {await studio.close();win.destroy();await fs.rm(dir,{recursive:true,force:true});app.quit();}
}).catch(e=>{console.error(e);app.exit(1)});
