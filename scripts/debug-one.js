import { SOURCES } from '../src/config.js';
import { extractLinks, parseLink } from '../src/parse.js';
import { buildConfig, probeViaSocks } from '../src/test.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const want = process.argv[2] || 'vless';
const res = await fetch(SOURCES[1], { headers: { 'User-Agent': 'x' }, signal: AbortSignal.timeout(30000) });
const links = extractLinks(await res.text());
const node = links.map(parseLink).find((n) => n && n.proto === want);
console.log(JSON.stringify(node.outbound, null, 1));
console.log('LINK', node.link.slice(0, 200));
const cfg = buildConfig([node], 25000);
cfg.log = { level: 'debug' };
fs.writeFileSync('debug.json', JSON.stringify(cfg, null, 1));
const child = spawn('./bin/sing-box.exe', ['run', '-c', 'debug.json'], { stdio: ['ignore', 'inherit', 'inherit'] });
await new Promise((r) => setTimeout(r, 1200));
try { console.log('RESULT', await probeViaSocks(25000, 6000)); } catch (e) { console.log('FAILED', e.message); }
child.kill();
