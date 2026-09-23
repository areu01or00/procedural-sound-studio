import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Claude Agent SDK backend speaking the subset of the Codex app-server protocol
// Studio uses: thread/start|resume, turn/start|interrupt, approval requests and
// turn notifications. It runs the local Claude Code login, so turns draw on the
// user's Claude subscription rather than an API key.
const WEB_TOOLS = new Set(['WebSearch', 'WebFetch']);

// Subscription auth: an inherited API key would silently switch billing.
function subscriptionEnv() { const env = {...process.env}; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; return env; }
const executable = () => process.env.CLAUDE_BIN ? {pathToClaudeCodeExecutable:process.env.CLAUDE_BIN} : {};

export function claudeOptions(config, {model, effort, resume, threadId, abort, canUseTool, stderr}) {
  const web = config.webResearch !== false;
  return {
    cwd: config.cwd, ...(model ? {model} : {}), ...(effort ? {effort} : {}),
    systemPrompt: {type:'preset', preset:'claude_code', append:config.developerInstructions || ''},
    ...(resume ? {resume:threadId} : {sessionId:threadId}),
    // Isolation: no user/project settings, hooks or plugins leak into experiments.
    settingSources: [],
    // Parity with Codex workspace-write + on-request: edits inside the data
    // directory and sandboxed shell run freely; anything else asks the user.
    permissionMode: 'acceptEdits',
    allowedTools: ['Read', 'Glob', 'Grep', ...(web ? ['WebSearch', 'WebFetch'] : [])],
    disallowedTools: ['AskUserQuestion', ...(web ? [] : ['WebSearch', 'WebFetch'])],
    // Web off: shell stays inside the network-blocked sandbox, even when approvals are automatic.
    sandbox: {enabled:true, autoAllowBashIfSandboxed:true, allowUnsandboxedCommands:web},
    canUseTool, abortController:abort, env:subscriptionEnv(), stderr, ...executable()
  };
}

function describe(block) {
  const i = block.input || {};
  return `${block.name}: ${i.command || i.file_path || i.query || i.url || i.pattern || i.description || ''}`.slice(0, 300);
}

export class ClaudeAgent extends EventEmitter {
  constructor({run = query} = {}) { super(); this.run = run; this.threads = new Map(); this.pending = new Map(); this.serial = 0; }
  async start() {}
  // The same catalog Claude Code's /model shows for this login; no prompt is sent.
  async models() {
    if (this.catalog) return this.catalog;
    const abort = new AbortController();
    const idle = (async function* () { await new Promise(resolve => abort.signal.addEventListener('abort', resolve)); })();
    const q = this.run({prompt:idle, options:{settingSources:[], abortController:abort, env:subscriptionEnv(), ...executable()}});
    try {
      this.catalog = (await q.supportedModels()).map(m => ({id:m.value, name:m.displayName, description:m.description || '', resolvedModel:m.resolvedModel || null, efforts:m.supportedEffortLevels || []}));
    } finally { q.close?.(); abort.abort(); }
    return this.catalog;
  }
  async call(method, params) {
    if (method === 'thread/start') { const id = randomUUID(); this.threads.set(id, {config:params, started:false}); return {thread:{id}}; }
    if (method === 'thread/resume') { this.threads.set(params.threadId, {config:params, started:true}); return {thread:{id:params.threadId}}; }
    if (method === 'turn/start') return {turn:{id:this.turn(params)}};
    if (method === 'turn/interrupt') { if (this.active?.turnId === params.turnId) this.active.abort.abort(); return {}; }
    throw new Error(`Claude backend does not support ${method}`);
  }
  turn({threadId, model, effort, input}) {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error('Unknown Claude thread');
    if (this.active) throw new Error('A Claude turn is already running');
    const turn = {turnId:randomUUID(), threadId, abort:new AbortController()};
    const prompt = input.filter(i => i.type === 'text').map(i => i.text).join('\n\n');
    const options = claudeOptions(thread.config, {model:model || thread.config.model, effort, resume:thread.started, threadId, abort:turn.abort,
      canUseTool:(tool, toolInput, {signal, blockedPath}) => this.approve(threadId, tool, toolInput, signal, blockedPath),
      stderr:d => this.emit('diagnostic', String(d))});
    this.active = turn;
    setImmediate(() => void this.stream(thread, turn, this.run({prompt, options})));
    return turn.turnId;
  }
  async stream(thread, turn, messages) {
    const note = (method, params) => this.emit('notification', {method, params:{threadId:turn.threadId, ...params}});
    const tools = new Map(); let status = 'completed', error;
    note('turn/started', {turn:{id:turn.turnId}});
    try {
      for await (const m of messages) {
        if (m.type === 'system' && m.subtype === 'init') thread.started = true;
        if (m.type === 'assistant' && !m.parent_tool_use_id) {
          for (const b of m.message?.content || []) {
            if (b.type === 'text' && b.text) {
              note('item/agentMessage/delta', {delta:b.text + '\n'});
              note('item/completed', {item:{type:'agentMessage', id:m.uuid, text:b.text}});
            }
            if (b.type === 'tool_use') { tools.set(b.id, b.name); note('item/started', {item:{type:'toolCall', id:b.id, command:describe(b)}}); }
          }
          if (m.error) { status = 'failed'; error = `Claude error: ${m.error}`; }
        }
        if (m.type === 'user' && Array.isArray(m.message?.content)) {
          for (const b of m.message.content) {
            if (b.type !== 'tool_result') continue;
            const name = tools.get(b.tool_use_id);
            if (WEB_TOOLS.has(name)) note('item/completed', {item:{type:'webSearch', id:b.tool_use_id, status:b.is_error ? 'failed' : 'completed', action:{tool:name}, result:m.tool_use_result ?? b.content ?? null}});
            else if (name === 'Bash') {
              const text = typeof b.content === 'string' ? b.content : (b.content || []).map(c => c.text || '').join('');
              if (text) note('item/commandExecution/outputDelta', {delta:text.slice(-2000) + '\n'});
            }
          }
        }
        if (m.type === 'result') {
          if (m.subtype !== 'success' || m.is_error) { status = 'failed'; error = m.errors?.join(' ') || m.result || m.subtype; }
          note('item/agentMessage/delta', {delta:`\n[Claude] ${m.num_turns} steps, ~$${Number(m.total_cost_usd || 0).toFixed(2)} API-equivalent (subscription usage)\n`});
        }
      }
    } catch (e) { status = 'failed'; error = e.message; }
    if (turn.abort.signal.aborted) { status = 'interrupted'; error = undefined; }
    if (this.active === turn) this.active = null;
    note('turn/completed', {turn:{id:turn.turnId, status, ...(error ? {error:{message:error}} : {})}});
  }
  approve(threadId, tool, input, signal, blockedPath) {
    const id = `claude-${++this.serial}`;
    return new Promise(resolve => {
      const settle = result => { if (!this.pending.delete(id)) return; resolve(result); };
      this.pending.set(id, decision => settle(decision === 'accept'
        ? {behavior:'allow', updatedInput:input}
        : {behavior:'deny', message:'The Studio user declined this request.'}));
      signal?.addEventListener('abort', () => settle({behavior:'deny', message:'Turn cancelled'}), {once:true});
      const reason = `Claude requests ${tool}${blockedPath ? ` (outside the workspace: ${blockedPath})` : ''}${input.description ? ` — ${input.description}` : ''}`;
      this.emit('request', {id, method:tool === 'Bash' ? 'item/commandExecution/requestApproval' : 'item/fileChange/requestApproval',
        params:{threadId, tool, reason, ...(tool === 'Bash' ? {command:input.command} : {}), input}});
    });
  }
  respond(id, result) { this.pending.get(String(id))?.(result?.decision); }
  close() { this.active?.abort.abort(); }
}
