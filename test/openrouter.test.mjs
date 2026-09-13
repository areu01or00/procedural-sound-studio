import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {modelProviders} from '../server/openrouter.mjs';
import {createStudio} from '../server/index.mjs';

const endpointResponse = () => Response.json({data:{endpoints:[
  {tag:'fireworks',provider_name:'Fireworks',status:0},
  {tag:'nova/fast',provider_name:'Nova',status:0},
  {tag:'offline',provider_name:'Offline',status:1},
  {tag:'fireworks',provider_name:'Fireworks',status:0}
]}});

test('endpoint discovery validates model IDs and uses live endpoint tags',async()=>{
  let called;
  assert.deepEqual(await modelProviders('vendor/model',async url=>{called=url;return endpointResponse();}),[{id:'fireworks',name:'Fireworks'},{id:'nova/fast',name:'Nova'}]);
  assert.equal(called,'https://openrouter.ai/api/v1/models/vendor/model/endpoints');
  await assert.rejects(modelProviders('../private'),/model ID/);
  await assert.rejects(modelProviders('vendor/model',async()=>new Response('',{status:404})),/404/);
});

test('provider selection is per-model, resumes config, pins streamed requests and requires auth',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-routing-'));
  class Fake extends EventEmitter {
    calls=[]; async start(){} async configureEnvironment(){}
    async call(method,params){this.calls.push({method,params});return method.startsWith('thread/')?{thread:{id:'t'}}:{turn:{id:'u'}};}
    close(){}
  }
  const codex=new Fake(),sent=[];
  const fetcher=async(url,options)=>{
    if(url.endsWith('/endpoints'))return endpointResponse();
    sent.push({url,options,body:JSON.parse(options.body)});
    return new Response('data: {"type":"response.completed"}\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  const app=await createStudio({dataDir:dir,codex,fetcher}),url=await app.listen();
  const post=(route,body)=>fetch(url+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const ready=async()=>{for(let i=0;i<100;i++){const s=await fetch(url+'/api/state').then(r=>r.json());if(s.versions.at(-1)?.turnId)return s.versions.at(-1);await new Promise(r=>setTimeout(r,20));}throw Error('turn timeout');};
  try {
    const options=await fetch(url+'/api/openrouter/providers?model=vendor/model').then(r=>r.json());assert.equal(options.providers.length,2);
    assert.equal((await post('settings',{provider:'openrouter',model:'vendor/model',inferenceProvider:'missing',apiKey:'test-key'})).status,400);
    assert.equal((await post('settings',{provider:'openrouter',model:'vendor/model',inferenceProvider:'nova/fast',apiKey:'test-key'})).status,200);
    const v=await post('generate',{prompt:'Create a sound'}).then(r=>r.json());await ready();
    const config=codex.calls.find(c=>c.method==='thread/start').params.config['model_providers.studio_openrouter'];
    assert.equal(config.base_url,url+'/openrouter/nova%2Ffast');
    const request={model:'vendor/model',input:[{role:'user',content:'hello'}],stream:true,tools:[{type:'function',name:'test'}]};
    assert.equal((await fetch(config.base_url+'/responses',{method:'POST',body:JSON.stringify(request)})).status,401);
    const response=await fetch(config.base_url+'/responses',{method:'POST',headers:{Authorization:'Bearer test-key','Content-Type':'application/json'},body:JSON.stringify(request)});
    assert.equal(response.headers.get('content-type'),'text/event-stream');assert.ok((await response.text()).includes('response.completed'));
    assert.deepEqual(sent[0].body,{...request,provider:{only:['nova/fast'],allow_fallbacks:false}});
    assert.equal(sent[0].url,'https://openrouter.ai/api/v1/responses');
    await post('cancel',{});codex.emit('notification',{method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'interrupted'}}});
    await new Promise(r=>setTimeout(r,50));
    await post('settings',{provider:'openrouter',model:'vendor/other'});
    const saved=await fetch(url+'/api/settings').then(r=>r.json());assert.equal(saved.openrouterInferenceProviders['vendor/model'],'nova/fast');
    await post('generate',{projectId:v.projectId,prompt:'Again'});await ready();
    const resumed=codex.calls.find(c=>c.method==='thread/resume');assert.equal(resumed.params.config['model_providers.studio_openrouter'].base_url,'https://openrouter.ai/api/v1');
    assert.ok(!(await fs.readFile(path.join(dir,'settings.json'),'utf8')).includes('test-key'));
  } finally {await app.close();await fs.rm(dir,{recursive:true,force:true});}
});
