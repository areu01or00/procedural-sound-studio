import {once} from 'node:events';

export async function modelProviders(model, fetcher = fetch) {
  if (!/^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.:+-]*$/.test(model)) throw new Error('Enter an OpenRouter author/model ID');
  const response = await fetcher(`https://openrouter.ai/api/v1/models/${model.split('/').map(encodeURIComponent).join('/')}/endpoints`, {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`OpenRouter endpoint lookup failed (${response.status})`);
  const data = await response.json();
  const providers = new Map();
  for (const e of data.data?.endpoints || []) {
    if (typeof e.tag !== 'string' || !e.tag || e.status !== 0) continue;
    providers.set(e.tag, {id:e.tag,name:e.provider_name || e.tag});
  }
  return [...providers.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

// Codex cannot set arbitrary Responses body fields. This fixed-destination relay
// adds OpenRouter routing while preserving the streamed response and tool calls.
export async function relay(req, res, {key, provider, fetcher = fetch}) {
  if (!key || req.headers.authorization !== `Bearer ${key}`) {
    res.writeHead(401); res.end(); return;
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32*1024*1024) { res.writeHead(413); res.end(); return; }
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  body.provider = {only:[provider],allow_fallbacks:false};
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once('close',cancel);
  try {
    const upstream = await fetcher('https://openrouter.ai/api/v1/responses', {
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:controller.signal
    });
    res.writeHead(upstream.status, {'Content-Type':upstream.headers.get('content-type') || 'application/json','Cache-Control':'no-store'});
    if (upstream.body) for await (const chunk of upstream.body) {
      if (!res.write(chunk)) await once(res,'drain',{signal:controller.signal});
    }
    res.end();
  } finally { res.off('close',cancel); }
}
