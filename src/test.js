import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';

const CHECK_HOST = 'www.gstatic.com';
const CHECK_PATH = '/generate_204';
const SPEED_HOST = 'speed.cloudflare.com';

function socks5Connect(proxyPort, host, port, timeout) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ port: proxyPort, host: '127.0.0.1' });
    let buf = Buffer.alloc(0);
    let stage = 1;
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('socks timeout'));
    }, timeout);
    const fail = (err) => {
      clearTimeout(timer);
      sock.destroy();
      reject(err);
    };
    sock.once('error', fail);
    sock.once('connect', () => sock.write(Buffer.from([5, 1, 0])));
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 1) {
        if (buf.length < 2) return;
        if (buf[1] !== 0) return fail(new Error('socks auth failed'));
        buf = buf.subarray(2);
        stage = 2;
        const h = Buffer.from(host, 'utf8');
        const req = Buffer.alloc(7 + h.length);
        req[0] = 5;
        req[1] = 1;
        req[2] = 0;
        req[3] = 3;
        req[4] = h.length;
        h.copy(req, 5);
        req.writeUInt16BE(port, 5 + h.length);
        sock.write(req);
      }
      if (stage === 2) {
        if (buf.length < 4) return;
        const atyp = buf[3];
        let need = 0;
        if (atyp === 1) need = 10;
        else if (atyp === 4) need = 22;
        else if (atyp === 3) {
          if (buf.length < 5) return;
          need = 7 + buf[4];
        } else return fail(new Error('socks bad atyp'));
        if (buf.length < need) return;
        if (buf[1] !== 0) return fail(new Error(`socks rep ${buf[1]}`));
        clearTimeout(timer);
        sock.removeListener('data', fail);
        sock.removeAllListeners('data');
        sock.removeAllListeners('error');
        resolve(sock);
      }
    });
  });
}

function tlsHandshake(sock, host, timeout) {
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      t.destroy();
      reject(new Error('tls timeout'));
    }, timeout);
    t.once('secureConnect', () => {
      clearTimeout(timer);
      t.removeAllListeners('error');
      resolve(t);
    });
    t.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function readHeaders(sock, timeout) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('read timeout'));
    }, timeout);
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      const idx = buf.indexOf('\r\n\r\n');
      if (idx >= 0) {
        clearTimeout(timer);
        const line = buf.slice(0, buf.indexOf('\r\n'));
        const m = line.match(/^HTTP\/1\.[01] (\d{3})/);
        sock.removeAllListeners('data');
        resolve(m ? Number(m[1]) : 0);
      }
    });
    sock.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    sock.once('close', () => {
      clearTimeout(timer);
      reject(new Error('closed'));
    });
  });
}

export async function probeViaSocks(proxyPort, timeout) {
  const started = process.hrtime.bigint();
  const sock = await socks5Connect(proxyPort, CHECK_HOST, 443, timeout);
  const t = await tlsHandshake(sock, CHECK_HOST, timeout);
  const rtt = Number(process.hrtime.bigint() - started) / 1e6;
  t.write(
    `GET ${CHECK_PATH} HTTP/1.1\r\nHost: ${CHECK_HOST}\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`
  );
  const status = await readHeaders(t, timeout);
  t.destroy();
  if (status !== 204) throw new Error(`http ${status}`);
  return Math.round(rtt);
}

export async function speedViaSocks(proxyPort, timeout) {
  const sock = await socks5Connect(proxyPort, SPEED_HOST, 443, timeout);
  const t = await tlsHandshake(sock, SPEED_HOST, timeout);
  const started = process.hrtime.bigint();
  t.write(
    `GET /__down?bytes=2000000 HTTP/1.1\r\nHost: ${SPEED_HOST}\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`
  );
  let bytes = 0;
  await new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const timer = setTimeout(finish, timeout);
    function finish() {
      clearTimeout(timer);
      t.destroy();
      resolve();
    }
    t.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes >= 1500000 || Date.now() > deadline) finish();
    });
    t.once('error', finish);
    t.once('close', finish);
  });
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  if (bytes < 20000) throw new Error('too little data');
  return Math.round((bytes * 8) / secs / 1000);
}

function readAll(sock, timeout) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(Buffer.concat(chunks).toString('utf8'));
    }, timeout);
    sock.on('data', (c) => chunks.push(c));
    sock.once('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    sock.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export async function exitProbe(proxyPort, timeout) {
  const sock = await socks5Connect(proxyPort, 'www.cloudflare.com', 443, timeout);
  const t = await tlsHandshake(sock, 'www.cloudflare.com', timeout);
  t.write(
    'GET /cdn-cgi/trace HTTP/1.1\r\nHost: www.cloudflare.com\r\nUser-Agent: Mozilla/5.0\r\nAccept: */*\r\nConnection: close\r\n\r\n'
  );
  const raw = await readAll(t, timeout);
  const idx = raw.indexOf('\r\n\r\n');
  const body = idx >= 0 ? raw.slice(idx + 4) : raw;
  const ip = (body.match(/^ip=(\S+)/m) || [])[1];
  const loc = (body.match(/^loc=(\S+)/m) || [])[1] || '';
  if (!ip) throw new Error('no exit ip');
  return { ip, loc };
}

async function waitListening(port, deadline) {
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ port, host: '127.0.0.1' });
      s.once('connect', () => {
        s.destroy();
        resolve(true);
      });
      s.once('error', () => resolve(false));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 60));
  }
  return false;
}

export function buildConfig(nodes, basePort) {
  const inbounds = [];
  const outbounds = [];
  const rules = [];
  nodes.forEach((node, i) => {
    const tag = `n${i}`;
    inbounds.push({ type: 'socks', tag: `in-${tag}`, listen: '127.0.0.1', listen_port: basePort + i });
    outbounds.push({ ...node.outbound, tag: `out-${tag}` });
    rules.push({ inbound: [`in-${tag}`], outbound: `out-${tag}` });
  });
  return {
    log: { level: 'fatal', timestamp: false },
    dns: { servers: [{ tag: 'local', type: 'udp', server: '1.1.1.1' }], strategy: 'ipv4_only' },
    inbounds,
    outbounds,
    route: { rules, final: outbounds.length ? outbounds[0].tag : 'direct' },
    experimental: { cache_file: { enabled: false } },
  };
}

export class Tester {
  constructor(binPath, workDir) {
    this.bin = binPath;
    this.workDir = workDir;
    this.seq = 0;
  }

  async runBatch(nodes, opts) {
    if (!nodes.length) return [];
    try {
      return await this.runBatchInner(nodes, opts);
    } catch (e) {
      if (nodes.length === 1) return [{ ok: false, error: String(e.message || e).slice(0, 120) }];
      const mid = Math.ceil(nodes.length / 2);
      const left = await this.runBatch(nodes.slice(0, mid), opts);
      const right = await this.runBatch(nodes.slice(mid), opts);
      return [...left, ...right];
    }
  }

  async runBatchInner(nodes, opts) {
    const { concurrency = 40, timeout = 8000, speed = false, speedLimit = 0 } = opts;
    const basePort = 20000 + ((this.seq++ * 200) % 20000);
    const ports = nodes.map((_, i) => basePort + i);
    const cfg = buildConfig(nodes, basePort);
    const cfgPath = path.join(this.workDir, `sb-${Date.now()}-${this.seq}.json`);
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    let child;
    try {
      const check = spawn(this.bin, ['check', '-c', cfgPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      check.stderr.on('data', (d) => (err += d.toString()));
      const [code] = await once(check, 'exit');
      if (code !== 0) throw new Error(`sing-box check failed: ${err.slice(0, 300)}`);
      child = spawn(this.bin, ['run', '-c', cfgPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let runErr = '';
      child.stderr.on('data', (d) => (runErr += d.toString()));
      child.once('exit', () => {});
      const ready = await waitListening(basePort, Date.now() + 8000);
      if (!ready) throw new Error(`sing-box did not start: ${runErr.slice(0, 300)}`);
      const results = new Array(nodes.length).fill(null);
      let cursor = 0;
      const worker = async () => {
        while (cursor < nodes.length) {
          const i = cursor++;
          try {
            const latency = await probeViaSocks(ports[i], timeout);
            results[i] = { ok: true, latency, speed: 0 };
          } catch (e) {
            results[i] = { ok: false, error: e.message };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
      const aliveIdx = results.map((r, i) => (r && r.ok ? i : -1)).filter((i) => i >= 0);
      let exitCursor = 0;
      const exitWorker = async () => {
        while (exitCursor < aliveIdx.length) {
          const i = aliveIdx[exitCursor++];
          try {
            const info = await exitProbe(ports[i], timeout);
            results[i].exitIp = info.ip;
            results[i].loc = info.loc;
          } catch {
            results[i].ok = false;
            results[i].error = 'exit probe failed';
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, aliveIdx.length)) }, exitWorker));
      if (speed) {
        const alive = results
          .map((r, i) => ({ r, i }))
          .filter((x) => x.r && x.r.ok)
          .sort((a, b) => a.r.latency - b.r.latency)
          .slice(0, speedLimit || 60);
        for (const { r, i } of alive) {
          try {
            r.speed = await speedViaSocks(ports[i], Math.max(timeout, 8000));
          } catch {
            r.speed = 0;
          }
        }
      }
      return results;
    } finally {
      if (child && !child.killed) {
        child.kill('SIGKILL');
        child.removeAllListeners();
      }
      fs.rm(cfgPath, { force: true }, () => {});
    }
  }
}



