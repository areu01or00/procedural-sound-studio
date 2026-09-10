import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class Codex extends EventEmitter {
  constructor() { super(); this.pending = new Map(); this.serial = 0; this.environment = {...process.env}; }
  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.child = spawn(process.env.CODEX_BIN || 'codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], env: this.environment });
      const fail = error => {
        for (const {reject, timer} of this.pending.values()) { clearTimeout(timer); reject(error); }
        this.pending.clear(); this.ready = null; this.emit('disconnect', error.message);
      };
      this.child.on('error', fail);
      this.child.on('exit', (code) => fail(new Error(`Codex app-server exited (${code}).`)));
      this.child.stdin.on('error', () => {});
      this.child.stderr.on('data', d => this.emit('diagnostic', String(d)));
      createInterface({ input: this.child.stdout }).on('line', line => {
        let m; try { m = JSON.parse(line); } catch { return; }
        if (m.method) { this.emit(m.id === undefined ? 'notification' : 'request', m); return; }
        const p = this.pending.get(m.id); if (!p) return;
        this.pending.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      });
      await this.call('initialize', { clientInfo: { name: 'sound_studio', title: 'Sound Studio', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      this.send({ method: 'initialized' });
    })();
    return this.ready;
  }
  send(message) { this.child.stdin.write(JSON.stringify(message) + '\n'); }
  call(method, params) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  async configureEnvironment(overrides) {
    const child = this.child;
    if (child && child.exitCode === null && !child.killed) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    this.ready = null; this.environment = {...this.environment,...overrides};
  }
  close() { this.child?.kill(); }
}
