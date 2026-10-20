import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    this.state = { nodes: {}, updatedAt: 0, lastError: '' };
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.nodes) this.state = parsed;
    } catch {
      /* first run */
    }
    return this.state;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }

  upsert(node) {
    const prev = this.state.nodes[node.fp] || {};
    this.state.nodes[node.fp] = {
      ...prev,
      fp: node.fp,
      proto: node.proto,
      name: node.name,
      link: node.link,
      outbound: node.outbound,
      server: node.server,
      port: node.port,
    };
  }

  mark(fp, result) {
    const n = this.state.nodes[fp];
    if (!n) return;
    n.lastTest = Date.now();
    if (result.ok) {
      n.ok = true;
      n.latency = result.latency;
      n.speed = result.speed || 0;
      n.lastOk = Date.now();
      n.fails = 0;
    } else {
      n.ok = false;
      n.fails = (n.fails || 0) + 1;
      n.error = String(result.error || '').slice(0, 120);
    }
  }

  prune() {
    const now = Date.now();
    for (const [fp, n] of Object.entries(this.state.nodes)) {
      if ((n.fails || 0) >= 3) delete this.state.nodes[fp];
      else if (!n.ok && n.lastTest && now - n.lastTest > 3 * 86400000) delete this.state.nodes[fp];
    }
  }

  alive() {
    return Object.values(this.state.nodes).filter((n) => n.ok);
  }
}
