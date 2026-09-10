// Protocol preflight only: starts a thread with a placeholder key, never a turn.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Codex} from '../server/codex.mjs';
import {createSettings} from '../server/settings.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-provider-config-')),codex=new Codex();
try {
  const settings=await createSettings(dir,codex);
  await settings.save({provider:'openrouter',model:'test-provider/test-model',apiKey:'configuration-test-not-a-real-key'});
  const choice=await settings.selection(); await codex.start();
  const result=await codex.call('thread/start',{cwd:dir,sandbox:'workspace-write',approvalPolicy:'on-request',ephemeral:true,...choice.threadConfig});
  assert.equal(result.modelProvider,'studio_openrouter');assert.equal(result.model,'test-provider/test-model');
  console.log('Installed app-server accepted OpenRouter provider configuration. No inference requested.');
} finally {codex.close();await fs.rm(dir,{recursive:true,force:true});}
