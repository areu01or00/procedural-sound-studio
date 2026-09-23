import {modelProviders, relay} from './openrouter.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function createSettings(dataDir, codex, {fetcher = fetch} = {}) {
  const file = path.join(dataDir, 'settings.json');
  let value = {provider:'default',openaiModel:'',openrouterModel:'',claudeModel:'',autoApprove:false,webResearch:true,effort:'',openrouterInferenceProviders:{}};
  try { value = {...value,...JSON.parse(await fs.readFile(file,'utf8'))}; }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  // Credentials are session-only and are never put in state, prompts or config JSON.
  let key = process.env.OPENROUTER_API_KEY || '', catalog;
  const publicValue = () => ({...value, hasOpenRouterKey:!!key});
  async function models() {
    if (catalog) return catalog;
    await codex.start();
    const items = []; let cursor;
    do {
      const r = await codex.call('model/list', {includeHidden:true,limit:100,...(cursor ? {cursor} : {})});
      items.push(...(r.data || [])); cursor = r.nextCursor;
    } while(cursor && items.length < 1000);
    catalog = items.map(m=>({id:m.model || m.id,name:m.displayName || m.model || m.id,isDefault:!!m.isDefault,hidden:!!m.hidden,
      efforts:(m.supportedReasoningEfforts || []).map(e=>e.reasoningEffort),defaultEffort:m.defaultReasoningEffort || null}));
    return catalog;
  }
  return {
    publicValue, models,
    providers: model => modelProviders(model,fetcher),
    relay: (req,res,provider) => relay(req,res,{key,provider,fetcher}),
    async save(body) {
      if (!['default','openrouter','claude'].includes(body.provider)) throw new Error('Unknown provider');
      const model = String(body.model || '').trim();
      if (model.length > 200 || (model && !/^[a-zA-Z0-9][a-zA-Z0-9_./:@+\[\]-]*$/.test(model))) throw new Error('Invalid model ID');
      if (body.provider === 'openrouter' && !model) throw new Error('Paste an OpenRouter model ID');
      const effort = String(body.effort ?? value.effort ?? '').trim();
      if (!/^[a-z]{0,16}$/.test(effort)) throw new Error('Invalid reasoning effort');
      const inferenceProvider = String(body.inferenceProvider || '').trim();
      if (body.provider === 'openrouter' && inferenceProvider && !(await modelProviders(model,fetcher)).some(p=>p.id===inferenceProvider)) throw new Error('This inference provider is unavailable for the selected model');
      let nextKey = key;
      if (body.clearKey) nextKey = '';
      else if (body.apiKey) {
        if (typeof body.apiKey !== 'string' || /\s/.test(body.apiKey.trim()) || body.apiKey.length > 1000) throw new Error('Invalid API key');
        nextKey = body.apiKey.trim();
      }
      if (body.provider === 'openrouter' && !nextKey) throw new Error('Paste an OpenRouter API key');
      const next = {...value,provider:body.provider,[{default:'openaiModel',openrouter:'openrouterModel',claude:'claudeModel'}[body.provider]]:model,autoApprove:body.autoApprove === undefined ? !!value.autoApprove : !!body.autoApprove,webResearch:body.webResearch === undefined ? value.webResearch !== false : !!body.webResearch,effort};
      if (body.provider === 'openrouter') next.openrouterInferenceProviders = {...value.openrouterInferenceProviders,[model]:inferenceProvider};
      // Clearing Studio's loaded set alone does not unload app-server threads.
      // Resume of an already-live thread may retain its original provider URL.
      // Restart our idle child when routing changes, then resume saved history.
      const route = v => v.provider === 'openrouter'
        ? `openrouter:${v.openrouterInferenceProviders?.[v.openrouterModel] || 'automatic'}:web=${v.webResearch !== false}` : `default:web=${v.webResearch !== false}`;
      if (nextKey !== key || route(next) !== route(value)) {
        await codex.configureEnvironment({OPENROUTER_API_KEY:nextKey}); catalog = undefined; key = nextKey;
      }
      await fs.writeFile(file+'.tmp', JSON.stringify(next,null,2), {mode:0o600}); await fs.rename(file+'.tmp',file);
      value = next; return publicValue();
    },
    async selection(origin) {
      const web = value.webResearch !== false;
      // Web off removes the tool itself, not just the instruction: Codex web_search is disabled here;
      // Claude drops WebSearch/WebFetch in claude.mjs.
      const codexWeb = c => web ? c : {...c, config:{...(c.config || {}), web_search:'disabled'}};
      if(value.provider==='openrouter') {
        if(!key) throw new Error('Open settings and paste your OpenRouter key for this session');
        const inferenceProvider = value.openrouterInferenceProviders?.[value.openrouterModel] || '';
        if (inferenceProvider && !origin) throw new Error('Studio must be listening before provider routing');
        return {provider:'openrouter',inferenceProvider,model:value.openrouterModel,webResearch:web,effort:value.effort || null,threadConfig:codexWeb({modelProvider:'studio_openrouter',model:value.openrouterModel,config:{'model_providers.studio_openrouter':{name:'OpenRouter',base_url:inferenceProvider ? `${origin}/openrouter/${encodeURIComponent(inferenceProvider)}` : 'https://openrouter.ai/api/v1',env_key:'OPENROUTER_API_KEY',wire_api:'responses',requires_openai_auth:false,supports_websockets:false}}})};
      }
      // Claude runs through the Agent SDK on the local Claude Code login, not through Codex.
      if(value.provider==='claude') return {provider:'claude',model:value.claudeModel || null,webResearch:web,effort:value.effort || null,threadConfig:{...(value.claudeModel ? {model:value.claudeModel} : {}),webResearch:web}};
      const model = value.openaiModel || (await models()).find(m=>m.isDefault)?.id || null;
      // Codex effort overrides persist on a thread, so "model default" is sent explicitly.
      const effort = value.effort || (await models()).find(m=>m.id===model)?.defaultEffort || null;
      return {provider:'default',model,webResearch:web,effort,threadConfig:codexWeb({modelProvider:'openai',...(model ? {model} : {})})};
    }
  };
}
