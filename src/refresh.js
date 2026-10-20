import {
  SOURCES,
  TEST_CONCURRENCY,
  TEST_TIMEOUT_MS,
  MAX_TEST_PER_CYCLE,
  SPEED_TEST,
  SPEED_LIMIT,
} from './config.js';
import { extractLinks, parseLink } from './parse.js';

const BATCH = 40;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchSource(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'free-proxy-sub/1.0', Accept: '*/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export class Refresher {
  constructor(store, tester) {
    this.store = store;
    this.tester = tester;
    this.running = false;
    this.lastResult = null;
  }

  async collect() {
    const links = [];
    const errors = [];
    const bodies = await Promise.allSettled(SOURCES.map((u) => fetchSource(u)));
    bodies.forEach((r, i) => {
      if (r.status === 'fulfilled') links.push(...extractLinks(r.value));
      else errors.push(`${SOURCES[i]}: ${r.reason?.message || r.reason}`);
    });
    const nodes = [];
    const seen = new Set();
    for (const link of links) {
      const node = parseLink(link);
      if (!node || seen.has(node.fp)) continue;
      seen.add(node.fp);
      nodes.push(node);
    }
    return { nodes, errors, raw: links.length };
  }

  pick(nodes) {
    const state = this.store.state.nodes;
    const byFp = new Map(nodes.map((n) => [n.fp, n]));
    const alive = Object.values(state)
      .filter((n) => n.ok)
      .sort((a, b) => (a.lastTest || 0) - (b.lastTest || 0))
      .map((n) => byFp.get(n.fp))
      .filter(Boolean);
    const fresh = shuffle(nodes.filter((n) => !state[n.fp] || !(state[n.fp].lastTest > 0)));
    const stale = Object.values(state)
      .filter((n) => !n.ok && n.lastTest)
      .sort((a, b) => (a.lastTest || 0) - (b.lastTest || 0))
      .map((n) => byFp.get(n.fp))
      .filter(Boolean);

    const budget = MAX_TEST_PER_CYCLE;
    const aliveCap = Math.floor(budget * 0.6);
    const picked = alive.slice(0, aliveCap);
    const rest = [...fresh, ...stale];
    const seen = new Set(picked.map((n) => n.fp));
    for (const n of rest) {
      if (picked.length >= budget) break;
      if (seen.has(n.fp)) continue;
      seen.add(n.fp);
      picked.push(n);
    }
    return picked;
  }

  async refresh() {
    if (this.running) return { skipped: true };
    this.running = true;
    const started = Date.now();
    const summary = { tested: 0, alive: 0, failed: 0, sources: SOURCES.length, sourceErrors: [] };
    try {
      const { nodes, errors, raw } = await this.collect();
      summary.links = raw;
      summary.parsed = nodes.length;
      summary.sourceErrors = errors.slice(0, 5);
      for (const node of nodes) this.store.upsert(node);
      this.store.save();

      const picked = this.pick(nodes);
      for (let i = 0; i < picked.length; i += BATCH) {
        const batch = picked.slice(i, i + BATCH);
        let results;
        try {
          results = await this.tester.runBatch(batch, {
            concurrency: TEST_CONCURRENCY,
            timeout: TEST_TIMEOUT_MS,
            speed: SPEED_TEST,
            speedLimit: Math.min(SPEED_LIMIT, batch.length),
          });
        } catch (e) {
          results = batch.map(() => ({ ok: false, error: e.message }));
        }
        results.forEach((r, idx) => {
          this.store.mark(batch[idx].fp, r);
          summary.tested += 1;
          if (r && r.ok) summary.alive += 1;
          else summary.failed += 1;
        });
        this.store.save();
      }
      this.store.prune();
      this.store.state.updatedAt = Date.now();
      this.store.state.lastError = summary.sourceErrors[0] || '';
      this.store.save();
      summary.ms = Date.now() - started;
      summary.total = Object.keys(this.store.state.nodes).length;
      summary.aliveTotal = this.store.alive().length;
      this.lastResult = { at: Date.now(), ...summary };
      return summary;
    } catch (e) {
      this.store.state.lastError = e.message;
      this.store.save();
      this.lastResult = { at: Date.now(), error: e.message };
      throw e;
    } finally {
      this.running = false;
    }
  }
}
