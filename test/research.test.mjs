import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {researchEvent} from '../server/research.mjs';

test('research wrapper preserves actual string and structured web results', async () => {
  const guide = await fs.readFile(new URL('../resources/research-context.md', import.meta.url), 'utf8');
  const code = guide.match(/```js\n([\s\S]*?)\n```/)[1];
  const run = new (Object.getPrototypeOf(async function(){}).constructor)('tools','text',code);
  for (const result of ['Actual retrieved source text', {content:[{type:'text',text:'Source text'}]}, '']) {
    const emitted=[];
    await run({web__run:async()=>result},value=>emitted.push(value));
    assert.deepEqual(emitted,[result]);
  }
});

test('research evidence distinguishes actual tool events from prose and missing content', () => {
  const event=item=>({method:'item/completed',params:{item}});
  assert.equal(researchEvent(event({type:'agentMessage',text:'I researched https://example.org'})),null);
  assert.equal(researchEvent(event({type:'commandExecution',command:'echo research'})),null);
  const search=researchEvent(event({type:'webSearch',id:'s',action:{type:'search',query:'harmony'}}));
  assert.equal(search.result,null);
  assert.equal(search.status,'unknown');
  const read=researchEvent(event({type:'mcpToolCall',tool:'web_fetch',arguments:{secret:'not-recorded'},result:{content:[{type:'text',text:'Returned page excerpt'}]}}));
  assert.equal(read.result.content[0].text,'Returned page excerpt');
  assert.ok(!JSON.stringify(read).includes('not-recorded'));
  const failed=researchEvent(event({type:'webSearch',status:'failed',error:'unavailable'}));
  assert.equal(failed.error,'unavailable');
});
