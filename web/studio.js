const $ = id => document.getElementById(id);
let state = { projects: [], versions: [] }, projectId = '', selected = '', busy = false, selectionSerial = 0;
async function api(route, body) {
  const r = await fetch('/api/' + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
function error(e) { $('activity').textContent = e.message; }
function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.onclick = () => Promise.resolve().then(action).catch(error); return b; }
function render() {
  busy = state.versions.some(v => ['running','starting','validating','repairing'].includes(v.status));
  $('send').disabled = busy; $('cancel').hidden = !busy;
  $('send').textContent = projectId ? 'Make next version ↗' : 'Create sound ↗';
  $('projects').replaceChildren(new Option('New sound', ''), ...state.projects.map(p => new Option(p.title, p.id)));
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
  $('title').textContent = v.artifacts?.title || 'Rendering your sound…';
  $('downloads').replaceChildren(); $('score').hidden = true; $('code').textContent = '';
  if (!v.artifacts) return;
  for (const [key, label] of Object.entries({ audio: 'Download WAV', svg: 'SVG', code: 'Python', notes: 'Notes' })) {
    const a = document.createElement('a'); a.href = `/asset/${v.id}/${key}?download`; a.textContent = label; a.download = ''; $('downloads').append(a);
  }
  $('score').src = `/asset/${v.id}/svg`; $('score').hidden = false;
  const code = await fetch(`/asset/${v.id}/code`).then(r => r.text());
  if (selected !== v.id || ticket !== selectionSerial) return; $('code').textContent = code;
  const engine = $('editor').contentWindow.PKAudioEditor?.engine;
  if (engine) engine.LoadURL(`/asset/${v.id}/audio`);
  else $('activity').textContent = 'Editor is still loading. Select this version again in a moment.';
}
$('projects').onchange = () => { projectId = $('projects').value; selected = ''; render(); const v = state.versions.filter(v => v.projectId === projectId).at(-1); if (v) select(v).catch(error); };
$('new').onclick = () => { projectId = ''; selected = ''; $('title').textContent = 'What does your idea sound like?'; $('log').textContent = ''; $('downloads').replaceChildren(); $('score').hidden = true; $('code').textContent = ''; $('activity').textContent = 'Ready'; render(); $('prompt').focus(); };
$('compose').onsubmit = async e => {
  e.preventDefault(); if (busy) return; $('send').disabled = true;
  try { const v = await api('generate', { prompt: $('prompt').value, projectId }); projectId = v.projectId; selected = v.id; $('prompt').value = ''; state = await api('state'); await select(state.versions.find(x => x.id === v.id)); }
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
state = await api('state'); projectId = state.projects.at(-1)?.id || ''; render();
function loadLatest() { const v = state.versions.filter(v => v.projectId === projectId).at(-1); if (v) select(v).catch(error); }
$('editor').addEventListener('load', loadLatest);
if ($('editor').contentWindow.PKAudioEditor?.engine) loadLatest();

// Provider settings are independent of sound versions. Never put keys in storage.
function showProviderFields() {
  const router = $('provider').value === 'openrouter';
  $('openai-fields').hidden = router; $('openrouter-fields').hidden = !router;
}
$('provider').onchange = showProviderFields;
$('settings-close').onclick = () => $('settings-dialog').close();
$('settings-dialog').addEventListener('close', () => { $('openrouter-key').value = ''; });
$('settings').onclick = async () => {
  $('settings-error').textContent = ''; $('settings-dialog').showModal();
  $('settings-save').disabled = true;
  try {
    const current = await api('settings');
    $('provider').value = current.provider; $('openrouter-model').value = current.openrouterModel || '';
    $('openrouter-key').value = ''; $('openrouter-key').placeholder = current.hasOpenRouterKey ? 'Key set for this session — leave blank to keep' : 'Paste API key';
    showProviderFields();
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
    } catch(e) { $('settings-error').textContent = 'Model list unavailable: '+e.message; }
  } catch(e) { $('settings-error').textContent = e.message; }
};
$('settings-form').onsubmit = async e => {
  e.preventDefault(); $('settings-save').disabled = true; $('settings-error').textContent = '';
  try {
    const router = $('provider').value === 'openrouter';
    const saved = await api('settings', {provider:$('provider').value,model:router?$('openrouter-model').value:$('openai-model').value,apiKey:router?$('openrouter-key').value:undefined});
    $('settings-dialog').close();
    $('activity').textContent = 'Next turn: '+(saved.provider==='default'?'Codex · '+(saved.openaiModel||'configured default'):'OpenRouter · '+saved.openrouterModel);
  } catch(e) { $('settings-error').textContent = e.message; }
  finally { $('settings-save').disabled = false; }
};
