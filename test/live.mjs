// Opt-in: uses the configured Codex account to generate a real asset.
import { createStudio } from '../server/index.mjs';
const app = await createStudio(); const url = await app.listen();
console.log(url);
const before = await fetch(url+'/api/state').then(r=>r.json());
const projectId = process.argv.includes('--revise') ? before.projects.at(-1)?.id : undefined;
const r = await fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId, prompt: projectId ? 'Revise the previous glass machine into a darker five-second response: lower the bells by an octave, give the last gesture a gentle metallic rattle, preserve the three-gesture structure. Create a complete independent SVG-driven new version; keep the earlier version unchanged. No downloads.' : 'Studio integration test: create a 5-second original sound of a tiny glass machine waking, three irregular bell gestures and a soft falling shimmer. Use a compact SVG-driven direct synthesizer, stereo WAV, no downloads. Keep implementation quick but complete. Produce and validate every required file.'})});
const version = await r.json(); console.log('version',version.id);
let last = '';
const deadline = Date.now()+600000;
try {
  while (Date.now()<deadline) {
    const state = await fetch(url+'/api/state').then(r=>r.json());
    const v = state.versions.find(v=>v.id===version.id);
    if (state.approvals.length) { console.log('APPROVAL REQUIRED',JSON.stringify(state.approvals)); throw new Error('Live test needs interactive approval; no automatic acceptance.'); }
    if (v.log !== last) { console.log(v.log.slice(last.length)); last=v.log; }
    if (!['starting','running'].includes(v.status)) { console.log(JSON.stringify(v,null,2)); if(v.status!=='completed')throw new Error(v.error||v.status); break; }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(Date.now()>=deadline)throw new Error('Live test timeout');
} finally { await app.close(); }
