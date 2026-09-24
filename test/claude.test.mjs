import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClaudeAgent } from '../server/claude.mjs';
import { createStudio } from '../server/index.mjs';
import { RENDERER } from './fixtures.mjs';

// Scripted Agent SDK: records query() options and replays SDK messages.
function scripted(script) {
  const runs = [];
  const run = ({prompt, options}) => { runs.push({prompt, options}); return (async function* () { yield* await script(options, runs.length); })(); };
  return {runs, run};
}
const init = {type:'system', subtype:'init', session_id:'s'};
const done = {type:'result', subtype:'success', is_error:false, num_turns:3, total_cost_usd:0.5, result:'ok'};
const collect = agent => { const events = []; agent.on('notification', m => events.push(m)); return events; };
const finished = events => new Promise(resolve => { const t = setInterval(() => { const e = events.find(m => m.method === 'turn/completed'); if (e) { clearInterval(t); resolve(e); } }, 5); });

test('Claude adapter maps SDK stream to Studio notifications and resumes the same session', async () => {
  const saved = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'must-not-leak';
  try {
    const sdk = scripted(async () => [init,
      {type:'assistant', parent_tool_use_id:null, uuid:'a1', message:{content:[{type:'text', text:'Composing.'}, {type:'tool_use', id:'t1', name:'WebSearch', input:{query:'motif development'}}, {type:'tool_use', id:'t2', name:'Bash', input:{command:'python render.py'}}]}},
      {type:'user', parent_tool_use_id:null, message:{content:[{type:'tool_result', tool_use_id:'t1', content:'Search results: sequence and fragmentation'}, {type:'tool_result', tool_use_id:'t2', content:'rendered 60.0 s'}]}},
      {type:'assistant', parent_tool_use_id:'sub', uuid:'x', message:{content:[{type:'text', text:'subagent chatter'}]}},
      done]);
    const agent = new ClaudeAgent({run:sdk.run}), events = collect(agent);
    const {thread} = await agent.call('thread/start', {cwd:'/data', developerInstructions:'You are the composer.', model:'claude-sonnet-5'});
    const {turn} = await agent.call('turn/start', {threadId:thread.id, input:[{type:'text', text:'<user_request>x</user_request>'}]});
    const end = await finished(events);
    assert.deepEqual(end.params.turn, {id:turn.id, status:'completed'});
    const o = sdk.runs[0].options;
    assert.equal(o.sessionId, thread.id); assert.equal(o.resume, undefined);
    assert.equal(o.cwd, '/data'); assert.equal(o.model, 'claude-sonnet-5');
    assert.equal(o.systemPrompt.append, 'You are the composer.');
    assert.deepEqual(o.settingSources, []); assert.equal(o.sandbox.enabled, true);
    assert.ok(!('ANTHROPIC_API_KEY' in o.env));
    assert.equal(sdk.runs[0].prompt, '<user_request>x</user_request>');
    assert.ok(events.every(m => m.params.threadId === thread.id));
    const text = events.filter(m => /delta$/i.test(m.method)).map(m => m.params.delta).join('');
    assert.match(text, /Composing\./); assert.match(text, /rendered 60\.0 s/); assert.doesNotMatch(text, /subagent chatter/);
    assert.ok(events.some(m => m.method === 'item/completed' && m.params.item.type === 'agentMessage' && m.params.item.text === 'Composing.'));
    const web = events.find(m => m.method === 'item/completed' && m.params.item.type === 'webSearch');
    assert.equal(web.params.item.result, 'Search results: sequence and fragmentation');
    await agent.call('turn/start', {threadId:thread.id, input:[{type:'text', text:'again'}]});
    await new Promise(r => setTimeout(r, 30));
    assert.equal(sdk.runs[1].options.resume, thread.id); assert.equal(sdk.runs[1].options.sessionId, undefined);
  } finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
});

test('Claude permission prompts become Studio approvals; decline and interrupt are honoured', async () => {
  let decision;
  const sdk = scripted(async (options, n) => {
    if (n === 1) { decision = await options.canUseTool('Bash', {command:'curl https://example.org', description:'Fetch source'}, {signal:options.abortController.signal}); return [init, done]; }
    await new Promise(resolve => options.abortController.signal.addEventListener('abort', resolve));
    throw new Error('aborted');
  });
  const agent = new ClaudeAgent({run:sdk.run}), events = collect(agent), requests = [];
  agent.on('request', m => requests.push(m));
  const {thread} = await agent.call('thread/start', {cwd:'/data'});
  await agent.call('turn/start', {threadId:thread.id, input:[{type:'text', text:'go'}]});
  while (!requests.length) await new Promise(r => setTimeout(r, 5));
  assert.equal(requests[0].method, 'item/commandExecution/requestApproval');
  assert.equal(requests[0].params.command, 'curl https://example.org'); assert.match(requests[0].params.reason, /Fetch source/);
  agent.respond(requests[0].id, {decision:'decline'});
  await finished(events);
  assert.equal(decision.behavior, 'deny');
  events.length = 0;
  const {turn} = await agent.call('turn/start', {threadId:thread.id, input:[{type:'text', text:'long'}]});
  await new Promise(r => setTimeout(r, 20));
  await agent.call('turn/interrupt', {threadId:thread.id, turnId:turn.id});
  assert.equal((await finished(events)).params.turn.status, 'interrupted');
});

class FakeCodex extends EventEmitter {
  calls = [];
  async start() {} async configureEnvironment() {}
  async call(method, params) { this.calls.push({method, params}); return method === 'model/list' ? {data:[]} : method.startsWith('thread/') ? {thread:{id:'codex-thread'}} : {turn:{id:'codex-turn'}}; }
  respond() {} close() {}
}
async function deliver(dir) {
  const wav = Buffer.alloc(1644); wav.write('RIFF'); wav.writeUInt32LE(1636,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(1600,40);
  for (let i=0;i<800;i++) wav.writeInt16LE(Math.round(5000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
  await Promise.all(Object.entries({'audio.wav':wav,'score.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0d1117"/><polyline points="10,60 50,45 90,52" data-audible="true" fill="none" stroke="blue"/><path d="M10 70L90 70" data-audible="true" stroke="green"/></svg>','render.py':RENDERER,'notes.md':'Design notes','result.json':JSON.stringify({title:'Claude test',audio:'audio.wav',svg:'score.svg',code:'render.py',notes:'notes.md'})}).map(([name, data]) => fs.writeFile(path.join(dir,name),data)));
}

test('Studio routes a Claude-selected turn through the SDK and validates its delivery', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-claude-')), codex = new FakeCodex();
  const sdk = scripted(async options => {
    const delivery = /Delivery directory: (\S+)/.exec(sdk.runs.at(-1).prompt)[1];
    await deliver(delivery); return [init, done];
  });
  const app = await createStudio({dataDir:dir, codex, claude:new ClaudeAgent({run:sdk.run})}), url = await app.listen();
  const post = (route, body) => fetch(url+'/api/'+route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  try {
    assert.equal((await (await post('settings', {provider:'claude', model:'claude-opus-5-5'})).json()).claudeModel, 'claude-opus-5-5');
    await post('generate', {prompt:'A short bell study'});
    let state;
    for (let i = 0; i < 200; i++) { state = await (await fetch(url+'/api/state')).json(); if (['completed','failed'].includes(state.versions.at(-1)?.status)) break; await new Promise(r => setTimeout(r, 40)); }
    const v = state.versions.at(-1);
    assert.equal(v.status, 'completed', v.error); assert.equal(v.provider, 'claude'); assert.equal(v.model, 'claude-opus-5-5');
    assert.equal(v.artifacts.title, 'Claude test');
    assert.equal(sdk.runs[0].options.cwd, dir); assert.match(sdk.runs[0].prompt, /<user_request>\nA short bell study/); assert.match(sdk.runs[0].prompt, /Recorded instruments: .*resources\/instruments\/gm\.py/);
    assert.ok(sdk.runs[0].options.systemPrompt.append.length > 100);
    assert.ok(!codex.calls.some(c => c.method.startsWith('turn/')));
    assert.ok(state.projects[0].threads.claude);
  } finally { await app.close(); await fs.rm(dir, {recursive:true, force:true}); }
});

test('Claude model catalog comes from the SDK without a prompt and bracketed IDs can be saved', async () => {
  let calls = 0, closed = false;
  const run = ({prompt, options}) => { calls++; assert.equal(typeof prompt[Symbol.asyncIterator], 'function'); assert.deepEqual(options.settingSources, []);
    return {supportedModels: async () => [{value:'default', displayName:'Default (recommended)', description:'Opus 5.5 · Best', resolvedModel:'claude-opus-5-5'}, {value:'claude-fable-5-1[1m]', displayName:'Fable', description:'Fable 5.1 · Most capable'}], close(){ closed = true; }}; };
  const agent = new ClaudeAgent({run});
  const models = await agent.models(); await agent.models();
  assert.equal(calls, 1); assert.ok(closed);
  assert.deepEqual(models.map(m => m.id), ['default', 'claude-fable-5-1[1m]']);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-claude-models-'));
  try {
    const app = await createStudio({dataDir:dir, codex:new FakeCodex(), claude:agent}), url = await app.listen();
    try {
      assert.deepEqual((await (await fetch(url+'/api/claude/models')).json()).models, models);
      const r = await fetch(url+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:'claude', model:'claude-fable-5-1[1m]'})});
      assert.equal((await r.json()).claudeModel, 'claude-fable-5-1[1m]');
    } finally { await app.close(); }
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('auto-approve accepts tool approvals without queueing them and is recorded per version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-auto-approve-'));
  const codex = new FakeCodex(); codex.replies = []; codex.respond = (id, result) => codex.replies.push({id, result});
  const app = await createStudio({dataDir:dir, codex, claude:new ClaudeAgent({run:scripted(async () => []).run})}), url = await app.listen();
  const post = (route, body) => fetch(url+'/api/'+route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(r => r.json());
  const state = () => fetch(url+'/api/state').then(r => r.json());
  const running = async () => { for (let i = 0; i < 100; i++) { if ((await state()).versions.at(-1)?.status === 'running') return; await new Promise(r => setTimeout(r, 20)); } throw new Error('not running'); };
  try {
    assert.equal((await post('settings', {provider:'default', autoApprove:true})).autoApprove, true);
    await post('generate', {prompt:'A short bell study'}); await running();
    codex.emit('request', {id:7, method:'item/commandExecution/requestApproval', params:{threadId:'codex-thread', command:'curl https://example.org'}});
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(codex.replies, [{id:7, result:{decision:'accept'}}]);
    let s = await state(); assert.equal(s.approvals.length, 0); assert.equal(s.versions.at(-1).autoApprove, true);
    assert.match(s.versions.at(-1).log, /\[Studio auto-approved\] curl https:\/\/example\.org/);
    codex.emit('notification', {method:'turn/completed', params:{threadId:'codex-thread', turn:{id:'codex-turn', status:'failed'}}});
    for (let i = 0; i < 100 && (await state()).versions.at(-1).status === 'running'; i++) await new Promise(r => setTimeout(r, 20));
    assert.equal((await post('settings', {provider:'default', autoApprove:false})).autoApprove, false);
    await post('generate', {prompt:'Another bell study'}); await running();
    codex.emit('request', {id:8, method:'item/commandExecution/requestApproval', params:{threadId:'codex-thread', command:'ls'}});
    await new Promise(r => setTimeout(r, 30));
    s = await state(); assert.equal(s.approvals.length, 1); assert.equal(codex.replies.length, 1);
  } finally { await app.close(); await fs.rm(dir, {recursive:true, force:true}); }
});

test('selected effort reaches the Claude SDK options and Codex turn/start', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-effort-http-')), codex = new FakeCodex();
  const sdk = scripted(async () => [init, done]);
  const app = await createStudio({dataDir:dir, codex, claude:new ClaudeAgent({run:sdk.run})}), url = await app.listen();
  const post = (route, body) => fetch(url+'/api/'+route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(r => r.json());
  const settle = async () => { for (let i = 0; i < 150; i++) { const v = (await (await fetch(url+'/api/state')).json()).versions.at(-1); if (v && !['starting','running','validating','repairing'].includes(v.status)) return v; await new Promise(r => setTimeout(r, 20)); } };
  try {
    await post('settings', {provider:'claude', effort:'low'}); await post('generate', {prompt:'A short bell study'}); const v = await settle();
    assert.equal(sdk.runs[0].options.effort, 'low'); assert.equal(v.effort, 'low');
    await post('settings', {provider:'default', effort:'high'}); await post('generate', {prompt:'Another bell study'});
    for (let i = 0; i < 100 && !codex.calls.some(c => c.method === 'turn/start'); i++) await new Promise(r => setTimeout(r, 20));
    assert.equal(codex.calls.find(c => c.method === 'turn/start').params.effort, 'high');
  } finally { await app.close(); await fs.rm(dir, {recursive:true, force:true}); }
});
