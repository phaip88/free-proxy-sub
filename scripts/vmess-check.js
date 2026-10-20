import { parseLink } from '../src/parse.js';
import { namedLink } from '../src/output.js';
const raw = Buffer.from(JSON.stringify({ v: '2', ps: 'old', add: '1.2.3.4', port: '443', id: '11111111-1111-1111-1111-111111111111', aid: '0', net: 'ws', path: '/x', tls: 'tls', sni: 'a.com' })).toString('base64');
const n = parseLink('vmess://' + raw);
const n2 = parseLink(namedLink({ ...n, latency: 88, speed: 1200 }));
console.log('name2=', n2.name, '| server=', n2.outbound.server, '| ws=', n2.outbound.transport.path, '| tls=', n2.outbound.tls.server_name);
