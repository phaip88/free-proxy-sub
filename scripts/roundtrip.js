import { parseLink } from '../src/parse.js';
import { Tester } from '../src/test.js';
import { DATA_DIR, SINGBOX_BIN } from '../src/config.js';

const base = process.argv[2] || 'http://127.0.0.1:8080';
const sub = await (await fetch(`${base}/sub`)).text();
const text = Buffer.from(sub, 'base64').toString('utf8');
const links = text.split('\n').map((s) => s.trim()).filter(Boolean);
const nodes = links.map(parseLink).filter(Boolean);
console.log('sub links', links.length, 'parsed', nodes.length);
const tester = new Tester(SINGBOX_BIN, DATA_DIR);
const res = await tester.runBatch(nodes, { concurrency: 20, timeout: 8000, speed: true, speedLimit: 10 });
const ok = res.filter((r) => r && r.ok).length;
console.log('re-test alive', ok, '/', nodes.length);
res.filter((r) => r && r.ok).slice(0, 5).forEach((r, i) => console.log('ok', r.latency + 'ms', (r.speed || 0) + 'kbps'));
res.filter((r) => !r || !r.ok).slice(0, 5).forEach((r) => console.log('fail', r && r.error));
