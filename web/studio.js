const $ = id => document.getElementById(id);
let state = { projects: [], versions: [] }, projectId = '', selected = '', busy = false, selectionSerial = 0, mode = 'sound', processView = 'process';
async function api(route, body) {
  const r = await fetch('/api/' + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
function error(e) { $('activity').textContent = e.message; }
function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.onclick = () => Promise.resolve().then(action).catch(error); return b; }
function setMode(next, reset=true) {
  mode=next; if(reset){projectId=''; selected='';}
  const painting=mode==='painting';
  $('sound-mode').classList.toggle('active',!painting); $('painting-mode').classList.toggle('active',painting);
  $('workshop').textContent=painting?'/ PAINTING WORKSHOP':'/ SOUND WORKSHOP';
  $('new').textContent=painting?'New painting':'New sound'; $('image-field').hidden=!painting || Boolean(projectId);
  $('editor').hidden=painting; $('painting-view').hidden=!painting;
  $('title').textContent=painting?'What should the canvas become?':'What does your idea sound like?';
  $('compose-hint').textContent=painting?'Describe an image, attach a source, then develop it through conversation.':'Describe a sound. Develop it through conversation.';
  $('collection-hint').textContent=painting?'Each version keeps its final image, executable SVG, renderer and process film.':'Each version keeps its audio, visual score and renderer.';
  $('source-summary').textContent=painting?'Executable SVG & renderer':'Visual score & synthesis code';
  $('prompt').placeholder=painting?'Describe the painting, reconstruction or transformation…':'Describe the sound, or change the current piece…';
  $('log').textContent=painting?'Try “Paint a storm-lit observatory above a black sea, from broad underpainting to electric final accents.”':'Try “A glass creature wakes, takes three curious steps, then dissolves into rain. 12 seconds.”';
  render();
}
function render() {
  busy = state.versions.some(v => ['running','starting','validating','repairing'].includes(v.status));
  $('send').disabled = busy; $('cancel').hidden = !busy;
  $('send').textContent = projectId ? 'Make next version ↗' : (mode==='painting'?'Create painting ↗':'Create sound ↗');
  const projects=state.projects.filter(p=>(p.mode||'sound')===mode);
  $('projects').replaceChildren(new Option(mode==='painting'?'New painting':'New sound', ''), ...projects.map(p => new Option(p.title, p.id)));
  $('projects').value = projectId;
  $('versions').replaceChildren();
  const versions = state.versions.filter(v => v.projectId === projectId);
  versions.forEach((v, i) => {
    const b = button(v.artifacts?.title || v.prompt.slice(0, 40), () => select(v));
    b.classList.toggle('selected', v.id === selected);
    const sub = document.createElement('small'); sub.textContent = `v${i+1} · ${v.status}`; b.append(sub); $('versions').append(b);
  });
  $('requests').replaceChildren();
  for (const a of state.approvals || []) {
    const box = document.createElement('div'); box.className = 'request';
    const text = document.createElement('pre'); text.textContent = a.params.reason || a.params.command || a.method; box.append(text);
    if (a.kind === 'question') {
      const fields = {};
      for (const q of a.params.questions) {
        const label = document.createElement('label'); label.textContent = q.question;
        const input = document.createElement('input'); fields[q.id] = input; label.append(input); box.append(label);
        if (q.options) { const options = document.createElement('small'); options.textContent = q.options.map(o => o.label).join(' / '); box.append(options); }
      }
      box.append(button('Send answer', () => api('respond', { id: a.id, answers: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,v.value])) })));
    } else {
      const detail = document.createElement('pre'); detail.textContent = JSON.stringify(a.params, null, 2); box.append(detail);
      for (const decision of ['accept','decline']) box.append(button(decision === 'accept' ? 'Approve once' : 'Decline', () => api('respond', { id: a.id, decision })));
    }
    $('requests').append(box);
  }
  const newest = versions.at(-1);
  if (newest) $('activity').textContent = newest.error || newest.status;
}
async function select(v) {
  const ticket = ++selectionSerial;
  selected = v.id; $('log').textContent = `› ${v.prompt}\n\n${v.log || ''}`; render();
  if ((v.mode||'sound')!==mode) setMode(v.mode||'sound',false);
  $('title').textContent = v.artifacts?.title || (mode==='painting'?'Painting in progress…':'Rendering your sound…');
  $('downloads').replaceChildren(); $('score').hidden = true; $('code').textContent = '';
  if (!v.artifacts) return;
  const links=mode==='painting'?{image:'PNG',process:'Process',svg:'SVG',code:'Python',notes:'Notes'}:{audio:'Download WAV',svg:'SVG',code:'Python',notes:'Notes'};
  for (const [key, label] of Object.entries(links)) {
    const a = document.createElement('a'); a.href = `/asset/${v.id}/${key}?download`; a.textContent = label; a.download = ''; $('downloads').append(a);
  }
  if(mode==='painting'&&v.sourceImage) for(const [key,label] of Object.entries({source:'Source',analysis:'Measurements',edges:'Edges',palette:'Palette'})){const a=document.createElement('a');a.href=`/asset/${v.id}/${key}?download`;a.textContent=label;a.download='';$('downloads').append(a);}
  if(mode==='painting'){
    $('painting').src=`/asset/${v.id}/image`; processView=v.artifacts.process.endsWith('.gif')?'process-image':'process'; $(processView).src=`/asset/${v.id}/process`; $('painting-score').src=`/asset/${v.id}/svg`; $('compare-result').src=`/asset/${v.id}/image`;
    $('compare-source').src=v.sourceImage?`/asset/${v.id}/source`:'';
    document.querySelector('[data-view="compare"]').disabled=!v.sourceImage; showPaintingView('final');
  } else { $('score').src = `/asset/${v.id}/svg`; $('score').hidden = false; }
  const code = await fetch(`/asset/${v.id}/code`).then(r => r.text());
  if (selected !== v.id || ticket !== selectionSerial) return; $('code').textContent = code;
  if(mode==='sound'){const engine = $('editor').contentWindow.PKAudioEditor?.engine;
  if (engine) engine.LoadURL(`/asset/${v.id}/audio`);
  else $('activity').textContent = 'Editor is still loading. Select this version again in a moment.';}
}
$('projects').onchange = () => { projectId = $('projects').value; selected = ''; $('image-field').hidden=mode!=='painting'||Boolean(projectId); render(); const v = state.versions.filter(v => v.projectId === projectId).at(-1); if (v) select(v).catch(error); };
$('new').onclick = () => { setMode(mode); $('downloads').replaceChildren(); $('score').hidden = true; $('code').textContent = ''; $('activity').textContent = 'Ready'; $('prompt').focus(); };
$('sound-mode').onclick=()=>setMode('sound'); $('painting-mode').onclick=()=>setMode('painting');
$('image-input').onchange=()=>{$('image-name').textContent=$('image-input').files[0]?.name||'PNG, JPEG or WebP · 12 MB max';};
function readImage(file){return new Promise((resolve,reject)=>{if(!file)return resolve(null);const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read image'));r.readAsDataURL(file);});}
$('compose').onsubmit = async e => {
  e.preventDefault(); if (busy) return; $('send').disabled = true;
  try { const image=mode==='painting'&&!projectId?await readImage($('image-input').files[0]):null; const v = await api('generate', { prompt: $('prompt').value, projectId, mode, ...(image?{image}:{}) }); projectId = v.projectId; selected = v.id; $('prompt').value = ''; $('image-input').value=''; $('image-field').hidden=true; state = await api('state'); await select(state.versions.find(x => x.id === v.id)); }
  catch (e) { error(e); $('send').disabled = busy; }
};
$('cancel').onclick = () => api('cancel', {}).catch(error);
const events = new EventSource('/api/events');
events.onopen = () => { $('connection').textContent = 'Local studio connected'; api('state').then(s => { state = s; render(); }).catch(error); };
events.onerror = () => { $('connection').textContent = 'Reconnecting…'; };
events.addEventListener('state', e => {
  const next = JSON.parse(e.data), old = state.versions.find(v => v.id === selected);
  state = next; render(); const v = state.versions.find(v => v.id === selected);
  if (v?.artifacts && !old?.artifacts) select(v).catch(error);
});
events.addEventListener('log', e => { const v = state.versions.find(v => v.id === selected); if (!v || !['running','starting','validating','repairing'].includes(v.status)) return; $('log').textContent += JSON.parse(e.data).text; $('log').scrollTop = $('log').scrollHeight; });
events.addEventListener('activity', e => { $('activity').textContent = JSON.parse(e.data).text; });
function showPaintingView(view){for(const id of ['painting','process','process-image','painting-score','compare'])$(id).hidden=true; const map={final:'painting',process:processView,score:'painting-score',compare:'compare'};$(map[view]).hidden=false;document.querySelectorAll('.painting-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
document.querySelectorAll('.painting-tabs button').forEach(b=>b.onclick=()=>showPaintingView(b.dataset.view));
$('compare-range').oninput=()=>{$('compare-result').style.clipPath=`inset(0 0 0 ${$('compare-range').value}%)`;};
state = await api('state'); const latest=state.projects.at(-1); mode=latest?.mode||'sound'; projectId=latest?.id||''; setMode(mode,false);
function loadLatest() { const v = state.versions.filter(v => v.projectId === projectId).at(-1); if (v) select(v).catch(error); }
$('editor').addEventListener('load', loadLatest);
if ($('editor').contentWindow.PKAudioEditor?.engine) loadLatest();

// Provider settings are independent of sound versions. Never put keys in storage.
let providerRequest = 0, providerTimer, savedInferenceProviders = {};
async function loadInferenceProviders() {
  const request = ++providerRequest, model = $('openrouter-model').value.trim();
  const select = $('inference-provider');
  select.replaceChildren(new Option('Automatic — OpenRouter routing',''));
  select.disabled = true;
  $('inference-status').textContent = model ? 'Loading available providers…' : 'Enter a model ID to load providers.';
  if (!model) return;
  try {
    const {providers} = await api('openrouter/providers?model='+encodeURIComponent(model));
    if (request !== providerRequest) return;
    select.replaceChildren(new Option('Automatic — OpenRouter routing',''), ...providers.map(p=>new Option(p.name+' · '+p.id,p.id)));
    const saved = savedInferenceProviders[model] || '';
    if (saved && !providers.some(p=>p.id===saved)) select.add(new Option(saved+' (unavailable)',saved));
    select.value = saved;
    $('inference-status').textContent = 'A selected provider is pinned; unavailable providers will not silently fall back.';
  } catch(e) {
    if (request !== providerRequest) return;
    const saved = savedInferenceProviders[model];
    if (saved) { select.add(new Option(saved+' (not verified)',saved)); select.value=saved; }
    $('inference-status').textContent = e.message+' — retry by editing the model ID.';
  } finally { if (request === providerRequest) select.disabled = false; }
}
$('openrouter-model').oninput = () => {
  ++providerRequest; clearTimeout(providerTimer);
  $('inference-provider').replaceChildren(new Option('Automatic — OpenRouter routing',''));
  $('inference-provider').disabled = true;
  providerTimer = setTimeout(loadInferenceProviders,400);
};
$('inference-provider').onchange = () => { savedInferenceProviders[$('openrouter-model').value.trim()] = $('inference-provider').value; };
// Claude models come from the local Claude Code login via the Agent SDK.
let claudeRequest = 0;
async function loadClaudeModels(saved) {
  const request = ++claudeRequest, select = $('claude-model');
  if (saved !== undefined) { select.replaceChildren(new Option('Claude Code default','')); if (saved) select.add(new Option(saved,saved)); select.value = saved; }
  $('claude-status').textContent = 'Loading models from your Claude Code login…';
  try {
    const {models} = await api('claude/models');
    if (request !== claudeRequest) return;
    claudeCatalog = models;
    const keep = select.value, fallback = models.find(m=>m.id==='default');
    select.replaceChildren(new Option('Claude Code default'+(fallback?' — '+fallback.description.split(' · ')[0]:''),''), ...models.filter(m=>m.id!=='default').map(m=>new Option(m.name+' — '+m.description.split(' · ')[0],m.id)));
    if (keep && !models.some(m=>m.id===keep)) select.add(new Option(keep+' (not listed)',keep));
    select.value = keep;
    $('claude-status').textContent = 'From your Claude Code login; usage counts against your subscription.';
    refreshEffort();
  } catch(e) { if (request === claudeRequest) $('claude-status').textContent = 'Model list unavailable: '+e.message; }
}
// Effort levels depend on provider and model; keep an unsupported saved value visible rather than dropping it.
let codexCatalog = [], claudeCatalog = [], savedEffort = '';
function refreshEffort() {
  const provider = $('provider').value, select = $('effort'), keep = select.value || savedEffort;
  let levels = [], fallback = '';
  if (provider === 'claude') { const m = claudeCatalog.find(x=>x.id===($('claude-model').value || 'default')); levels = m?.efforts || []; }
  else if (provider === 'openrouter') levels = ['low','medium','high'];
  else { const m = codexCatalog.find(x=>x.id===$('openai-model').value) || codexCatalog.find(x=>x.isDefault); levels = m?.efforts || []; fallback = m?.defaultEffort || ''; }
  select.replaceChildren(new Option('Model default'+(fallback?' ('+fallback+')':''),''), ...levels.map(l=>new Option(l,l)));
  if (keep && !levels.includes(keep)) select.add(new Option(keep+' (not listed for this model)',keep));
  select.value = keep;
}
$('effort').onchange = () => { savedEffort = $('effort').value; };
$('openai-model').onchange = refreshEffort; $('claude-model').onchange = refreshEffort;
function showProviderFields() {
  const provider = $('provider').value;
  $('openai-fields').hidden = provider !== 'default'; $('openrouter-fields').hidden = provider !== 'openrouter'; $('claude-fields').hidden = provider !== 'claude';
}
$('provider').onchange = () => { showProviderFields(); refreshEffort(); if ($('provider').value==='openrouter') void loadInferenceProviders(); if ($('provider').value==='claude') void loadClaudeModels(); };
$('settings-close').onclick = () => $('settings-dialog').close();
$('settings-dialog').addEventListener('close', () => { $('openrouter-key').value = ''; });
$('settings').onclick = async () => {
  $('settings-error').textContent = ''; $('settings-dialog').showModal();
  $('settings-save').disabled = true;
  try {
    const current = await api('settings');
    $('provider').value = current.provider; $('openrouter-model').value = current.openrouterModel || '';
    void loadClaudeModels(current.claudeModel || '');
    savedEffort = current.effort || ''; $('effort').value = ''; refreshEffort();
    $('auto-approve').checked = !!current.autoApprove; $('web-research').checked = current.webResearch !== false;
    $('openrouter-key').value = ''; $('openrouter-key').placeholder = current.hasOpenRouterKey ? 'Key set for this session — leave blank to keep' : 'Paste API key';
    savedInferenceProviders = {...current.openrouterInferenceProviders};
    showProviderFields();
    void loadInferenceProviders();
    $('openai-model').replaceChildren(new Option('Configured default',''));
    if(current.openaiModel) $('openai-model').add(new Option(current.openaiModel,current.openaiModel));
    $('openai-model').value = current.openaiModel || '';
    $('settings-save').disabled = false;
    try {
      const {models} = await api('models');
      const selectedModel = $('openai-model').value;
      $('openai-model').replaceChildren(new Option('Configured default',''), ...models.map(m=>new Option(m.name+(m.isDefault?' (default)':''),m.id)));
      if(selectedModel && !models.some(m=>m.id===selectedModel)) $('openai-model').add(new Option(selectedModel,selectedModel));
      $('openai-model').value = selectedModel;
      codexCatalog = models; refreshEffort();
    } catch(e) { $('settings-error').textContent = 'Model list unavailable: '+e.message; }
  } catch(e) { $('settings-error').textContent = e.message; }
};
$('settings-form').onsubmit = async e => {
  e.preventDefault(); $('settings-save').disabled = true; $('settings-error').textContent = '';
  try {
    const router = $('provider').value === 'openrouter';
    const saved = await api('settings', {provider:$('provider').value,model:router?$('openrouter-model').value:$('provider').value==='claude'?$('claude-model').value:$('openai-model').value,apiKey:router?$('openrouter-key').value:undefined,inferenceProvider:router?(savedInferenceProviders[$('openrouter-model').value.trim()] || ''):undefined,autoApprove:$('auto-approve').checked,webResearch:$('web-research').checked,effort:$('effort').value});
    $('settings-dialog').close();
    $('activity').textContent = 'Next turn: '+(saved.provider==='default'?'Codex · '+(saved.openaiModel||'configured default'):saved.provider==='claude'?'Claude · '+(saved.claudeModel||'Claude Code default'):'OpenRouter · '+saved.openrouterModel)+' · effort '+(saved.effort||'default')+' · web '+(saved.webResearch!==false?'on':'off')+(saved.autoApprove?' · auto-approve':'');
  } catch(e) { $('settings-error').textContent = e.message; }
  finally { $('settings-save').disabled = false; }
};
