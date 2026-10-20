const PRINTABLE = /^[\x20-\x7e\r\n\t]{16,}$/;

export function b64decode(s) {
  const t = String(s || '').trim().replace(/\s+/g, '');
  if (!t || !/^[A-Za-z0-9+/=_-]+$/.test(t)) return null;
  try {
    const out = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return PRINTABLE.test(out) ? out : null;
  } catch {
    return null;
  }
}

export function b64encode(s) {
  return Buffer.from(String(s), 'utf8').toString('base64');
}

function safeDecode(v) {
  try {
    return decodeURIComponent(v || '');
  } catch {
    return v || '';
  }
}

function splitHostPort(hostport) {
  let host = hostport;
  let port = 0;
  if (hostport.startsWith('[')) {
    const end = hostport.indexOf(']');
    host = hostport.slice(1, end);
    const tail = hostport.slice(end + 1);
    if (tail.startsWith(':')) port = Number(tail.slice(1));
  } else {
    const idx = hostport.lastIndexOf(':');
    if (idx > 0) {
      host = hostport.slice(0, idx);
      port = Number(hostport.slice(idx + 1));
    }
  }
  return { host: host.trim(), port: Number.isFinite(port) ? port : 0 };
}

function parseUri(link) {
  const schemeEnd = link.indexOf('://');
  if (schemeEnd < 0) return null;
  const scheme = link.slice(0, schemeEnd).toLowerCase();
  let rest = link.slice(schemeEnd + 3);
  let name = '';
  const hash = rest.indexOf('#');
  if (hash >= 0) {
    name = safeDecode(rest.slice(hash + 1));
    rest = rest.slice(0, hash);
  }
  let query = '';
  const q = rest.indexOf('?');
  if (q >= 0) {
    query = rest.slice(q + 1);
    rest = rest.slice(0, q);
  }
  const at = rest.lastIndexOf('@');
  let userinfo = '';
  let hostpart = rest;
  if (at >= 0) {
    userinfo = rest.slice(0, at);
    hostpart = rest.slice(at + 1);
  }
  const { host, port } = splitHostPort(hostpart);
  return { scheme, userinfo, host, port, params: new URLSearchParams(query), name };
}

function tlsFromParams(p, security) {
  if (!security || security === 'none' || security === '') return undefined;
  const tls = { enabled: true };
  const sni = p.get('sni') || p.get('peer') || p.get('host');
  if (sni) tls.server_name = sni;
  if (p.get('allowInsecure') === '1' || p.get('insecure') === '1') tls.insecure = true;
  const alpn = p.get('alpn');
  if (alpn) tls.alpn = alpn.split(',').map((x) => x.trim()).filter(Boolean);
  const fp = p.get('fp');
  if (fp && fp !== 'none') tls.utls = { enabled: true, fingerprint: fp };
  if (security === 'reality') {
    const pk = p.get('pbk') || '';
    if (!/^[A-Za-z0-9_-]{40,60}=*$/.test(pk)) return null; // invalid reality: caller drops node
    if (!tls.utls) tls.utls = { enabled: true, fingerprint: 'chrome' };
    tls.reality = { enabled: true, public_key: pk, short_id: p.get('sid') || '' };
  }
  return tls;
}

function transportFromParams(p, net) {
  const type = (net || p.get('type') || 'tcp').toLowerCase();
  if (type === 'ws' || type === 'httpupgrade') {
    let path = p.get('path') || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    try {
      path = encodeURI(path);
    } catch {
      path = '/';
    }
    const t = { type: 'ws', path, headers: {} };
    const host = p.get('host');
    if (host) t.headers.Host = host;
    if (type === 'httpupgrade') t.type = 'httpupgrade';
    return t;
  }
  if (type === 'grpc') return { type: 'grpc', service_name: p.get('serviceName') || p.get('path') || '' };
  if (type === 'h2' || type === 'http') {
    const t = { type: 'http', path: p.get('path') || '/', host: [] };
    const host = p.get('host');
    if (host) t.host = host.split(',').map((x) => x.trim());
    return t;
  }
  return undefined;
}

function vmessNode(link) {
  const body = b64decode(link.slice(8));
  if (!body) return null;
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    return null;
  }
  const host = String(j.add || '').trim();
  const port = Number(j.port || 0);
  if (!host || !port || !j.id) return null;
  const net = String(j.net || 'tcp').toLowerCase();
  const security = String(j.tls || '').toLowerCase() === 'tls' ? 'tls' : 'none';
  const p = new URLSearchParams();
  if (j.sni) p.set('sni', j.sni);
  if (j.host) p.set('host', j.host);
  if (j.path) p.set('path', j.path);
  if (j.alpn) p.set('alpn', j.alpn);
  if (j.fp) p.set('fp', j.fp);
  if (j.serviceName) p.set('serviceName', j.serviceName);
  if (j.type && net !== 'tcp') p.set('headerType', j.type);
  const outbound = {
    type: 'vmess',
    server: host,
    server_port: port,
    uuid: String(j.id),
    security: String(j.scy || 'auto'),
    alter_id: Number(j.aid || 0),
  };
  const tls = tlsFromParams(p, security);
  if (tls) outbound.tls = tls;
  const transport = transportFromParams(p, net);
  if (transport) outbound.transport = transport;
  const name = String(j.ps || '').trim() || `${host}:${port}`;
  return { proto: 'vmess', name, server: host, port, link, outbound };
}

function vlessNode(link) {
  const u = parseUri(link);
  if (!u || !u.host || !u.port || !u.userinfo) return null;
  const p = u.params;
  const outbound = {
    type: 'vless',
    server: u.host,
    server_port: u.port,
    uuid: safeDecode(u.userinfo),
  };
  const flow = p.get('flow');
  if (flow) outbound.flow = flow;
  const tls = tlsFromParams(p, (p.get('security') || 'none').toLowerCase());
  if (tls === null) return null;
  if (tls) outbound.tls = tls;
  const transport = transportFromParams(p, p.get('type'));
  if (transport) outbound.transport = transport;
  return {
    proto: 'vless',
    name: u.name || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    link,
    outbound,
  };
}

function trojanNode(link) {
  const u = parseUri(link);
  if (!u || !u.host || !u.port || !u.userinfo) return null;
  const p = u.params;
  const outbound = {
    type: 'trojan',
    server: u.host,
    server_port: u.port,
    password: safeDecode(u.userinfo),
  };
  const tls = tlsFromParams(p, (p.get('security') || 'tls').toLowerCase());
  outbound.tls = tls || { enabled: true, server_name: u.host };
  const transport = transportFromParams(p, p.get('type'));
  if (transport) outbound.transport = transport;
  return {
    proto: 'trojan',
    name: u.name || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    link,
    outbound,
  };
}

function ssNode(link) {
  let rest = link.slice(5);
  let name = '';
  const hash = rest.indexOf('#');
  if (hash >= 0) {
    name = safeDecode(rest.slice(hash + 1));
    rest = rest.slice(0, hash);
  }
  let query = '';
  const q = rest.indexOf('?');
  if (q >= 0) {
    query = rest.slice(q + 1);
    rest = rest.slice(0, q);
  }
  let userinfo = '';
  let hostpart = rest;
  const at = rest.lastIndexOf('@');
  if (at >= 0) {
    userinfo = rest.slice(0, at);
    hostpart = rest.slice(at + 1);
  } else {
    const decoded = b64decode(rest);
    if (!decoded) return null;
    const at2 = decoded.lastIndexOf('@');
    if (at2 < 0) return null;
    userinfo = decoded.slice(0, at2);
    hostpart = decoded.slice(at2 + 1);
  }
  if (userinfo.includes(':')) {
    const dec = b64decode(userinfo);
    if (dec && dec.includes(':')) userinfo = dec;
  } else {
    const dec = b64decode(userinfo);
    if (dec && dec.includes(':')) userinfo = dec;
  }
  const sep = userinfo.indexOf(':');
  if (sep < 0) return null;
  const method = userinfo.slice(0, sep).trim();
  const password = userinfo.slice(sep + 1);
  const { host, port } = splitHostPort(hostpart);
  if (!host || !port || !method) return null;
  const p = new URLSearchParams(query);
  const outbound = { type: 'shadowsocks', server: host, server_port: port, method, password };
  const plugin = p.get('plugin');
  if (plugin) {
    const [pluginName, ...opts] = plugin.split(';');
    if (pluginName === 'obfs-local' || pluginName === 'simple-obfs') {
      const o = new URLSearchParams(opts.join(';').replace(/;/g, '&'));
      outbound.plugin = 'obfs-local';
      outbound.plugin_opts = `obfs=${o.get('obfs') || 'http'};obfs-host=${o.get('obfs-host') || ''}`;
    } else if (pluginName === 'v2ray-plugin') {
      outbound.plugin = 'v2ray-plugin';
      outbound.plugin_opts = opts.join(';');
    }
  }
  return {
    proto: 'ss',
    name: name || `${host}:${port}`,
    server: host,
    port,
    link,
    outbound,
  };
}

function hysteria2Node(link) {
  const u = parseUri(link);
  if (!u || !u.host || !u.port) return null;
  const p = u.params;
  const password = safeDecode(u.userinfo) || p.get('password') || '';
  const outbound = {
    type: 'hysteria2',
    server: u.host,
    server_port: u.port,
    password,
    tls: { enabled: true, server_name: p.get('sni') || u.host },
  };
  if (p.get('insecure') === '1' || p.get('allowInsecure') === '1') outbound.tls.insecure = true;
  const obfs = p.get('obfs');
  if (obfs) outbound.obfs = { type: obfs, password: p.get('obfs-password') || '' };
  return {
    proto: 'hysteria2',
    name: u.name || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    link,
    outbound,
  };
}

function tuicNode(link) {
  const u = parseUri(link);
  if (!u || !u.host || !u.port) return null;
  const p = u.params;
  const [uuid, password] = safeDecode(u.userinfo).split(':');
  if (!uuid) return null;
  const outbound = {
    type: 'tuic',
    server: u.host,
    server_port: u.port,
    uuid,
    password: password || '',
    congestion_control: p.get('congestion_control') || 'bbr',
    udp_relay_mode: p.get('udp_relay_mode') || 'native',
    tls: { enabled: true, server_name: p.get('sni') || u.host },
  };
  if (p.get('allow_insecure') === '1' || p.get('insecure') === '1') outbound.tls.insecure = true;
  const alpn = p.get('alpn');
  if (alpn) outbound.tls.alpn = alpn.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    proto: 'tuic',
    name: u.name || `${u.host}:${u.port}`,
    server: u.host,
    port: u.port,
    link,
    outbound,
  };
}

export function fingerprint(node) {
  const o = node.outbound || {};
  return [
    o.type,
    o.server,
    o.server_port,
    o.uuid || o.password || '',
    o.transport ? o.transport.type + (o.transport.path || o.transport.service_name || '') : '',
  ].join('|');
}

export function parseLink(link) {
  const s = String(link || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  let node = null;
  try {
    if (lower.startsWith('vmess://')) node = vmessNode(s);
    else if (lower.startsWith('vless://')) node = vlessNode(s);
    else if (lower.startsWith('trojan://')) node = trojanNode(s);
    else if (lower.startsWith('ss://')) node = ssNode(s);
    else if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) node = hysteria2Node(s);
    else if (lower.startsWith('tuic://')) node = tuicNode(s);
  } catch {
    node = null;
  }
  if (!node || !node.server || !node.port) return null;
  node.fp = fingerprint(node);
  node.name = (node.name || '').replace(/[\r\n\t]/g, ' ').slice(0, 80).trim();
  return node;
}

export function extractLinks(text) {
  const body = String(text || '');
  const decoded = /(vmess|vless|trojan|ss|hysteria2|hy2|tuic):\/\//i.test(body) ? body : b64decode(body);
  const src = decoded || body;
  const found = src.match(/(?:vmess|vless|trojan|ss|hysteria2|hy2|tuic):\/\/[^\s"'<>\\]+/gi) || [];
  return found.map((x) => x.replace(/[),;]+$/, ''));
}



