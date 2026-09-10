import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSettings} from '../server/settings.mjs';

test('provider selection uses live catalog; credentials never enter persisted settings or thread config',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-settings-'));
  const environments=[],calls=[];
  const codex={async start(){},async call(method,p){calls.push({method,p});return {data:[{model:'catalog-model',displayName:'Available model',isDefault:true}]};},async configureEnvironment(e){environments.push(e);}};
  try {
    const settings=await createSettings(dir,codex);
    assert.equal((await settings.selection()).model,'catalog-model');
    assert.equal(calls[0].method,'model/list'); assert.equal(calls[0].p.includeHidden,true);
    await assert.rejects(settings.save({provider:'openrouter',model:'vendor/name',clearKey:true}),/key/);
    const result=await settings.save({provider:'openrouter',model:'vendor/name',apiKey:'test-session-token'});
    assert.equal(result.hasOpenRouterKey,true); assert.equal(result.apiKey,undefined);
    assert.equal(environments.at(-1).OPENROUTER_API_KEY,'test-session-token');
    const choice=await settings.selection(); assert.equal(choice.threadConfig.modelProvider,'studio_openrouter');
    assert.equal(choice.threadConfig.config['model_providers.studio_openrouter'].env_key,'OPENROUTER_API_KEY');
    assert.ok(!JSON.stringify(choice).includes('test-session-token'));
    assert.ok(!(await fs.readFile(path.join(dir,'settings.json'),'utf8')).includes('test-session-token'));
    await settings.save({provider:'default',model:'chosen-model'});
    assert.equal((await settings.selection()).model,'chosen-model');
    assert.equal((await settings.selection()).threadConfig.modelProvider,'openai');
    const reloaded=await createSettings(dir,codex);assert.equal(reloaded.publicValue().openaiModel,'chosen-model');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
