function q(v) {
  const s = String(v ?? '');
  if (/^[A-Za-z0-9_.:/-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function clean(name) {
  return String(name || 'node').replace(/[",\n\r]/g, ' ').slice(0, 60).trim() || 'node';
}

function kindTag(node) {
  if (node.residential === true) return '🏠';
  if (node.hosting === true) return '☁';
  return '';
}

export function label(node) {
  const parts = [];
  if (node.speed > 0) parts.push(`${node.speed}kbps`);
  if (node.latency > 0) parts.push(`${node.latency}ms`);
  const tag = parts.length ? `[${parts.join(' ')}] ` : '';
  const kind = kindTag(node);
  return clean(`${tag}${kind ? `${kind} ` : ''}${node.name || node.server}`);
}

export function toClash(node) {
  const o = node.outbound || {};
  const base = { name: label(node), type: o.type, server: o.server, port: o.server_port };
  const tls = o.tls || {};
  const tr = o.transport || {};
  const ws = (extra = {}) => {
    const opts = { path: tr.path || '/' };
    if (tr.headers && tr.headers.Host) opts.headers = { Host: tr.headers.Host };
    return { network: 'ws', 'ws-opts': opts, ...extra };
  };
  if (o.type === 'vmess') {
    const p = { ...base, uuid: o.uuid, alterId: o.alter_id || 0, cipher: o.security || 'auto', udp: true };
    if (tls.enabled) Object.assign(p, { tls: true, servername: tls.server_name, 'skip-cert-verify': !!tls.insecure });
    if (tr.type === 'ws') Object.assign(p, ws());
    if (tr.type === 'grpc') Object.assign(p, { network: 'grpc', 'grpc-opts': { 'grpc-service-name': tr.service_name || '' } });
    return p;
  }
  if (o.type === 'vless') {
    const p = { ...base, uuid: o.uuid, udp: true, 'skip-cert-verify': !!tls.insecure };
    if (tls.enabled) Object.assign(p, { tls: true, servername: tls.server_name });
    if (tls.utls && tls.utls.fingerprint) p['client-fingerprint'] = tls.utls.fingerprint;
    if (tls.reality) Object.assign(p, { 'reality-opts': { 'public-key': tls.reality.public_key, 'short-id': tls.reality.short_id || '' } });
    if (o.flow) p.flow = o.flow;
    if (tr.type === 'ws') Object.assign(p, ws());
    if (tr.type === 'grpc') Object.assign(p, { network: 'grpc', 'grpc-opts': { 'grpc-service-name': tr.service_name || '' } });
    return p;
  }
  if (o.type === 'trojan') {
    const p = { ...base, password: o.password, udp: true, sni: tls.server_name || o.server, 'skip-cert-verify': !!tls.insecure };
    if (tr.type === 'ws') Object.assign(p, ws());
    if (tr.type === 'grpc') Object.assign(p, { network: 'grpc', 'grpc-opts': { 'grpc-service-name': tr.service_name || '' } });
    return p;
  }
  if (o.type === 'shadowsocks') {
    const p = { ...base, cipher: o.method, password: o.password, udp: true };
    if (o.plugin) p.plugin = o.plugin;
    if (o.plugin_opts) {
      const opts = {};
      for (const kv of String(o.plugin_opts).split(';')) {
        const [k, v] = kv.split('=');
        if (k) opts[k.trim()] = (v || '').trim();
      }
      p['plugin-opts'] = opts;
    }
    return p;
  }
  if (o.type === 'hysteria2') {
    return {
      ...base,
      password: o.password,
      sni: tls.server_name || o.server,
      'skip-cert-verify': !!tls.insecure,
      ...(o.obfs ? { obfs: o.obfs.type, 'obfs-password': o.obfs.password } : {}),
    };
  }
  if (o.type === 'tuic') {
    return {
      ...base,
      uuid: o.uuid,
      password: o.password,
      sni: tls.server_name || o.server,
      alpn: tls.alpn || ['h3'],
      'skip-cert-verify': !!tls.insecure,
      'congestion-controller': o.congestion_control || 'bbr',
      'udp-relay-mode': o.udp_relay_mode || 'native',
    };
  }
  return null;
}

export function toClashYaml(nodes) {
  const proxies = nodes.map(toClash).filter(Boolean);
  const names = proxies.map((p) => p.name);
  const lines = ['mixed-port: 7890', 'allow-lan: false', 'mode: rule', 'log-level: info', 'proxies:'];
  for (const p of proxies) {
    lines.push(`  - name: ${q(p.name)}`);
    for (const [k, v] of Object.entries(p)) {
      if (k === 'name') continue;
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        lines.push(`    ${k}:`);
        for (const [k2, v2] of Object.entries(v)) lines.push(`      ${k2}: ${q(v2)}`);
      } else if (Array.isArray(v)) {
        lines.push(`    ${k}: [${v.map(q).join(', ')}]`);
      } else if (typeof v === 'boolean' || typeof v === 'number') {
        lines.push(`    ${k}: ${v}`);
      } else {
        lines.push(`    ${k}: ${q(v)}`);
      }
    }
  }
  lines.push('proxy-groups:');
  lines.push('  - name: PROXY');
  lines.push('    type: select');
  lines.push('    proxies:');
  for (const n of names) lines.push(`      - ${q(n)}`);
  lines.push('rules:');
  lines.push('  - MATCH,PROXY');
  return `${lines.join('\n')}\n`;
}

export function namedLink(node) {
  const name = label(node);
  const link = node.link;
  if (/^vmess:\/\//i.test(link)) {
    try {
      const raw = Buffer.from(link.slice(8).trim(), 'base64').toString('utf8');
      const j = JSON.parse(raw);
      j.ps = name;
      return `vmess://${Buffer.from(JSON.stringify(j), 'utf8').toString('base64')}`;
    } catch {
      return link;
    }
  }
  if (/^ss:\/\//i.test(link)) {
    const base = link.split('#')[0];
    return `${base}#${encodeURIComponent(name)}`;
  }
  const base = link.split('#')[0];
  return `${base}#${encodeURIComponent(name)}`;
}

export function toSubscription(nodes) {
  return Buffer.from(nodes.map(namedLink).join('\n'), 'utf8').toString('base64');
}

