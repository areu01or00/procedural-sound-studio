import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createStudio, validateResult, safeFile } from '../server/index.mjs';
import { RENDERER } from './fixtures.mjs';

class FakeCodex extends EventEmitter {
  calls = []; replies = [];
  async start() {}
  async call(method, params) { this.calls.push({method,params}); return method.startsWith('thread/') ? {thread:{id:'thread-test'}} : {turn:{id:'turn-test'}}; }
  respond(id,result) { this.replies.push({id,result}); }
  close() {}
}
async function deliver(dir) {
  const wav = Buffer.alloc(1644); wav.write('RIFF'); wav.writeUInt32LE(1636,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(1600,40);
  for (let i=0;i<800;i++) wav.writeInt16LE(Math.round(5000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
  await Promise.all(Object.entries({'audio.wav':wav,'score.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0d1117"/><polyline points="10,60 50,45 90,52" data-audible="true" fill="none" stroke="blue"/><path d="M10 70L90 70" data-audible="true" stroke="green"/></svg>','render.py':RENDERER,'notes.md':'Design notes','result.json':JSON.stringify({title:'Test',audio:'audio.wav',svg:'score.svg',code:'render.py',notes:'notes.md'})}).map(([name, data]) => fs.writeFile(path.join(dir,name),data)));
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));
async function waitFor(url, status) {
  for(let i=0;i<200;i++) { const s=await (await fetch(url+'/api/state')).json(); if(s.versions.at(-1)?.status===status)return s; await tick(); }
  throw new Error('Timed out waiting for '+status);
}
test('version lifecycle, approvals, revisions, restart and file boundaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'studio-test-')), codex = new FakeCodex();
  const app = await createStudio({dataDir:dir,codex}); const url = await app.listen();
  const post = (route, body) => fetch(url+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    const home=await fetch(url); assert.equal(home.status,200); assert.ok((await home.text()).includes('painting-mode'));
    assert.equal((await fetch(url+'/editor/')).status,200);
    assert.equal((await fetch(url+'/api/state',{headers:{Origin:'https://attacker.example'}})).status,403);
    const version = await (await post('generate',{prompt:'Twelve seconds of glass rain'})).json(); await tick();
    assert.equal((await post('generate',{prompt:'overlap'})).status,400);
    assert.ok(codex.calls.find(c=>c.method==='turn/start').params.input[0].text.includes('<studio_working_context>'));
    assert.equal(await fs.readFile(path.join(dir, version.id, 'context.md'), 'utf8'), codex.calls.find(c=>c.method==='turn/start').params.input[0].text.split('\n\n<user_request>')[0]);
    const fresh = (await (await fetch(url+'/api/state')).json()).versions[0];
    assert.match(fresh.contextHook.systemPromptHash, /^[a-f0-9]{64}$/);
    assert.equal(fresh.contextHook.contextHash, createHash('sha256').update(await fs.readFile(path.join(dir, version.id, 'context.md'), 'utf8')).digest('hex'));
    assert.ok((await fs.readFile(path.join(dir, version.id, 'system-prompt.md'), 'utf8')).startsWith('You are the composer'));
    assert.ok(codex.calls.find(c=>c.method==='turn/start').params.input[0].text.includes('resources/glass_tide_example.py'));
    codex.emit('notification',{method:'item/completed',params:{threadId:'thread-test',item:{type:'webSearch',id:'search-observed',status:'completed',action:{type:'search',query:'glass resonance'}}}});
    codex.emit('request',{id:7,method:'item/commandExecution/requestApproval',params:{command:'echo test'}});
    assert.equal((await (await fetch(url+'/api/state')).json()).approvals.length,1);
    await post('respond',{id:7,decision:'accept'}); assert.deepEqual(codex.replies[0],{id:7,result:{decision:'accept'}});
    await deliver(path.join(dir,version.id));
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{status:'completed'}}}); await waitFor(url,'completed');
    let state = await (await fetch(url+'/api/state')).json(); assert.equal(state.versions[0].status,'completed');
    const evidence=JSON.parse((await fs.readFile(path.join(dir,version.id,'research-events.jsonl'),'utf8')).trim());
    assert.equal(evidence.itemId,'search-observed');assert.equal(evidence.result,null);
    assert.equal((await fetch(url+`/asset/${version.id}/audio`)).headers.get('content-type'),'audio/wav');
    assert.equal((await fetch(url+`/asset/${version.id}/svg`)).headers.get('content-security-policy').includes('sandbox'),true);
    const next = await (await post('generate',{projectId:version.projectId,prompt:'Give it a thunderous ending'})).json(); await tick();
    assert.equal(codex.calls.filter(c=>c.method==='thread/start').length,1);
    assert.ok(codex.calls.filter(c=>c.method==='turn/start').at(-1).params.input[0].text.includes(version.id));
    await post('cancel',{}); assert.equal(codex.calls.at(-1).method,'turn/interrupt');
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{status:'interrupted'}}}); await tick();
    await fs.symlink('/etc/passwd',path.join(dir,version.id,'escape.py'));
    await assert.rejects(safeFile(path.join(dir,version.id),'escape.py'),/outside/);
    await assert.rejects(safeFile(path.join(dir,version.id),'../state.json'),/outside/);
    await fs.writeFile(path.join(dir,next.id,'result.json'),'{}'); await assert.rejects(validateResult(path.join(dir,next.id)),/Invalid/);
    await app.close();
    const restarted = await createStudio({dataDir:dir,codex:new FakeCodex()}); const again = await restarted.listen();
    state = await (await fetch(again+'/api/state')).json(); assert.equal(state.versions.length,2); assert.equal(state.versions[0].artifacts.title,'Test'); await restarted.close();
  } finally { if (app.server.listening) await app.close(); await fs.rm(dir,{recursive:true,force:true}); }
});

test('output hook gives one repair pass for missing/malformed SVG and never publishes invalid output', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-repair-')),codex=new FakeCodex();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  try {
    const v=await (await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Create a bell'})})).json();
    await waitFor(url,'running'); await tick();
    await deliver(path.join(dir,v.id)); await fs.unlink(path.join(dir,v.id,'score.svg'));
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    await waitFor(url,'repairing'); await tick();
    assert.equal(codex.calls.filter(c=>c.method==='turn/start').length,2);
    assert.ok(codex.calls.at(-1).params.input[0].text.includes('Preserve the existing composition'));
    await fs.writeFile(path.join(dir,v.id,'score.svg'),'<svg broken');
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    const s=await waitFor(url,'failed');
    assert.ok(s.versions[0].error.includes('SVG parse')); assert.equal(s.versions[0].artifacts,undefined);
    assert.equal(codex.calls.filter(c=>c.method==='turn/start').length,2);
  } finally { await app.close(); await fs.rm(dir,{recursive:true,force:true}); }
});

test('output hook publishes a repaired visible SVG after successful revalidation', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-repaired-')),codex=new FakeCodex();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  try {
    const v=await (await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Create a bell'})})).json();
    await waitFor(url,'running'); await tick(); await deliver(path.join(dir,v.id));
    await fs.writeFile(path.join(dir,v.id,'score.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/><event t="0" p="60"/></svg>');
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    const broken=await waitFor(url,'repairing'); await tick(); assert.ok(broken.versions[0].outputCheck.issues.some(x=>x.includes('non-rendering')));
    await deliver(path.join(dir,v.id));
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    const s=await waitFor(url,'completed'); assert.equal(s.versions[0].repairAttempts,1); assert.deepEqual(s.versions[0].outputCheck.issues,[]);
    assert.equal((await fetch(url+`/asset/${v.id}/svg`)).status,200);
  } finally { await app.close(); await fs.rm(dir,{recursive:true,force:true}); }
});

test('settings route new turns to the selected provider/model and retain provider conversations',async()=>{
  class Providers extends FakeCodex {
    serial=0;
    async configureEnvironment() { this.emit('disconnect','settings changed'); }
    async call(method,params) {
      this.calls.push({method,params});
      if(method==='model/list')return {data:[{model:'openai-default',displayName:'Default',isDefault:true}]};
      if(method==='thread/start')return {thread:{id:'provider-thread-'+(++this.serial)}};
      return method==='thread/resume'?{thread:{id:params.threadId}}:{turn:{id:'turn-test'}};
    }
  }
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-providers-')),codex=new Providers();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  const post=(route,body)=>fetch(url+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const stop=async()=>{ const s=await waitFor(url,'running');await tick();codex.emit('notification',{method:'turn/completed',params:{threadId:s.versions.at(-1).threadId,turn:{id:'turn-test',status:'interrupted'}}});await waitFor(url,'interrupted');return s.versions.at(-1); };
  try {
    const initial=await (await post('generate',{prompt:'First'})).json();
    await waitFor(url,'running'); await tick();
    assert.equal((await post('settings',{provider:'default',model:'other'})).status,409);
    const first=await stop();assert.equal(first.model,'openai-default');
    assert.equal((await post('settings',{provider:'openrouter',model:'vendor/model',apiKey:'not-a-real-key'})).status,200);
    await post('generate',{projectId:initial.projectId,prompt:'Next'});const second=await stop();
    assert.notEqual(second.threadId,first.threadId);assert.equal(second.provider,'openrouter');assert.equal(second.model,'vendor/model');
    const routerStart=codex.calls.filter(c=>c.method==='thread/start').at(-1);
    assert.equal(routerStart.params.modelProvider,'studio_openrouter');assert.ok(!JSON.stringify(routerStart.params).includes('not-a-real-key'));
    await post('settings',{provider:'default',model:'chosen-openai'});
    await post('generate',{projectId:initial.projectId,prompt:'Back'});const third=await stop();
    assert.equal(third.threadId,first.threadId);assert.equal(third.model,'chosen-openai');
    assert.equal(codex.calls.filter(c=>c.method==='turn/start').at(-1).params.model,'chosen-openai');
  } finally {await app.close();await fs.rm(dir,{recursive:true,force:true});}
});


test('advisory score warnings publish without spending a repair turn', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-warning-')),codex=new FakeCodex();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  try {
    const v=await (await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Create a patterned texture'})})).json();
    await waitFor(url,'running'); await tick(); await deliver(path.join(dir,v.id));
    await fs.writeFile(path.join(dir,v.id,'score.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><section t="0" d="90"/><rect data-audible="true" data-t="0" data-d="2" x="10" y="10" width="40" height="20"/><text x="10" y="50">Motif repeated across section</text></svg>');
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    const s=await waitFor(url,'completed');
    assert.ok(s.versions[0].outputCheck.warnings.length);
    assert.equal(s.versions[0].outputCheck.silence.ran, true);
    assert.ok(s.versions[0].artifacts);
    assert.equal(codex.calls.filter(c=>c.method==='turn/start').length,1);
  } finally { await app.close(); await fs.rm(dir,{recursive:true,force:true}); }
});


test('no-artifact source blocker remains visible instead of a missing manifest error', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-blocker-')),codex=new FakeCodex();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  try {
    await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Use a named recording'})});
    await waitFor(url,'running'); await tick();
    const message='Media fetch failed with HTTP 403; no usable audio acquired.';
    codex.emit('notification',{method:'item/completed',params:{threadId:'thread-test',item:{type:'agentMessage',text:message}}});
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'completed'}}});
    const s=await waitFor(url,'failed');
    assert.equal(s.versions[0].error,message);
    assert.equal(codex.calls.filter(c=>c.method==='turn/start').length,1);
  } finally { await app.close(); await fs.rm(dir,{recursive:true,force:true}); }
});

test('painting generation ingests and measures an image before starting an isolated painter thread', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-painting-http-')),codex=new FakeCodex();
  const app=await createStudio({dataDir:dir,codex}),url=await app.listen();
  try {
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const v=await (await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Repaint this tiny source',mode:'painting',image})})).json();
    await waitFor(url,'running'); await tick();
    const analysis=JSON.parse(await fs.readFile(path.join(dir,v.id,'analysis.json')));
    assert.equal(analysis.width,1); assert.equal(analysis.height,1);
    const start=codex.calls.find(c=>c.method==='thread/start'); assert.ok(start.params.developerInstructions.includes('painter inside Studio'));
    const turn=codex.calls.find(c=>c.method==='turn/start'); assert.ok(turn.params.input[0].text.includes('<studio_painting_context>')); assert.ok(turn.params.input[0].text.includes('painting.png'));
    await fetch(url+'/api/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    codex.emit('notification',{method:'turn/completed',params:{threadId:'thread-test',turn:{id:'turn-test',status:'interrupted'}}}); await waitFor(url,'interrupted');
  } finally {await app.close();await fs.rm(dir,{recursive:true,force:true});}
});
