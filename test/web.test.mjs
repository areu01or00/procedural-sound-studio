import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeTurn } from '../server/hooks.mjs';
import { createSettings } from '../server/settings.mjs';
import { claudeOptions } from '../server/claude.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));

test('web research toggle swaps the research context and never sends Codex wrapper advice when off', async () => {
  const on = await beforeTurn({root, dataDir:os.tmpdir(), prompt:'Compose a short piece', provider:'default'});
  assert.match(on.text, /research online/); assert.match(on.text, /functions\.exec/); assert.equal(on.audit.web, true);
  const off = await beforeTurn({root, dataDir:os.tmpdir(), prompt:'Compose a short piece', provider:'default', web:false});
  assert.match(off.text, /Web access is off/); assert.doesNotMatch(off.text, /research online|functions\.exec/); assert.equal(off.audit.web, false);
});

test('web off removes the tools: Codex web_search disabled, Claude drops WebSearch/WebFetch and unsandboxed shell', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-web-'));
  const codex = {async start(){}, async call(){ return {data:[{model:'m', isDefault:true}]}; }, async configureEnvironment(){}};
  try {
    const settings = await createSettings(dir, codex);
    assert.equal(settings.publicValue().webResearch, true);
    assert.equal((await settings.selection()).threadConfig.config?.web_search, undefined);
    await settings.save({provider:'default', model:'m', webResearch:false});
    let c = await settings.selection(); assert.equal(c.webResearch, false); assert.equal(c.threadConfig.config.web_search, 'disabled'); assert.equal(c.threadConfig.modelProvider, 'openai');
    await settings.save({provider:'openrouter', model:'vendor/m', apiKey:'k'});
    c = await settings.selection(); assert.equal(c.threadConfig.config.web_search, 'disabled'); assert.ok(c.threadConfig.config['model_providers.studio_openrouter']);
    await settings.save({provider:'claude', model:''});
    c = await settings.selection(); assert.equal(c.threadConfig.webResearch, false);
    const o = claudeOptions(c.threadConfig, {threadId:'t'});
    assert.ok(o.disallowedTools.includes('WebSearch') && o.disallowedTools.includes('WebFetch'));
    assert.ok(!o.allowedTools.includes('WebSearch')); assert.equal(o.sandbox.allowUnsandboxedCommands, false);
    assert.equal((await createSettings(dir, codex)).publicValue().webResearch, false);
    await settings.save({provider:'claude', model:'', webResearch:true});
    const on = claudeOptions((await settings.selection()).threadConfig, {threadId:'t'});
    assert.ok(on.allowedTools.includes('WebSearch')); assert.equal(on.sandbox.allowUnsandboxedCommands, true);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});

test('reasoning effort: Codex default resolves to the catalog default; explicit levels validate and persist', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-effort-'));
  const codex = {async start(){}, async configureEnvironment(){}, async call(){ return {data:[
    {model:'astra', isDefault:true, defaultReasoningEffort:'low', supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]},
    {model:'sol', defaultReasoningEffort:'medium', supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]}; }};
  try {
    const settings = await createSettings(dir, codex);
    assert.deepEqual((await settings.models())[0].efforts, ['low','high']);
    assert.equal((await settings.selection()).effort, 'low');
    await settings.save({provider:'default', model:'sol'}); assert.equal((await settings.selection()).effort, 'medium');
    await settings.save({provider:'default', model:'sol', effort:'high'}); assert.equal((await settings.selection()).effort, 'high');
    await assert.rejects(settings.save({provider:'default', model:'sol', effort:'HIGH; rm'}), /effort/);
    await settings.save({provider:'claude', model:'', effort:'max'}); assert.equal((await settings.selection()).effort, 'max');
    assert.equal((await createSettings(dir, codex)).publicValue().effort, 'max');
    assert.equal(claudeOptions({}, {threadId:'t', effort:'low'}).effort, 'low');
    assert.equal('effort' in claudeOptions({}, {threadId:'t'}), false);
  } finally { await fs.rm(dir, {recursive:true, force:true}); }
});
