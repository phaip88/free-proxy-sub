import { SOURCES, SINGBOX_BIN } from '../src/config.js';
import { extractLinks, parseLink } from '../src/parse.js';
import { Tester } from '../src/test.js';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || SOURCES[0];
const limit = Number(process.argv[3] || 24);
const res = await fetch(url, { headers: { 'User-Agent': 'free-proxy-sub/1.0' }, signal: AbortSignal.timeout(30000) });
const text = await res.text();
const links = extractLinks(text);
const seen = new Set();
const nodes = [];
for (const l of links) {
  const n = parseLink(l);
  if (!n || seen.has(n.fp)) continue;
  seen.add(n.fp);
  nodes.push(n);
}
const counts = {};
for (const n of nodes) counts[n.proto] = (counts[n.proto] || 0) + 1;
console.log('links', links.length, 'unique', nodes.length, counts);
const pool = nodes.filter((n) => process.argv[4] ? n.proto === process.argv[4] : true);
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const picked = pool.slice(0, limit);
const tester = new Tester(SINGBOX_BIN, os.tmpdir());
const t0 = Date.now();
const out = await tester.runBatch(picked, { concurrency: 12, timeout: 7000, speed: false });
let ok = 0;
out.forEach((r, i) => {
  if (r && r.ok) ok += 1;
  console.log(ok && r ? '' : '', picked[i].proto, picked[i].server + ':' + picked[i].port, r && r.ok ? `${r.latency}ms` : `FAIL ${r && r.error}`);
});
console.log('alive', ok, '/', picked.length, 'in', Date.now() - t0, 'ms');


