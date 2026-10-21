import http from 'node:http';
import { PORT, DATA_DIR, SINGBOX_BIN, REFRESH_MINUTES, MAX_OUTPUT, SUB_TOKEN, SUB_TITLE, SPEED_TEST, MIN_SPEED_KBPS, MAX_LATENCY_MS, MIN_STREAK, MIN_SPEED_HOME, MAX_LATENCY_HOME, MIN_STREAK_HOME, RESIDENTIAL_ONLY } from './config.js';
import { Store } from './store.js';
import { Tester } from './test.js';
import { Refresher } from './refresh.js';
import { toSubscription, toClashYaml, label } from './output.js';
import { renderPage } from './ui.js';
import { ensureSingbox } from './bootstrap.js';
import { reportCapabilities } from './capabilities.js';

const store = new Store(DATA_DIR);
store.load();
const tester = new Tester(SINGBOX_BIN, DATA_DIR);
const refresher = new Refresher(store, tester);

function isHome(n) {
  return n.residential === true || n.mobile === true;
}

function eligible(n) {
  const home = isHome(n);
  const minSpeed = home ? MIN_SPEED_HOME : MIN_SPEED_KBPS;
  const maxLatency = home ? MAX_LATENCY_HOME : MAX_LATENCY_MS;
  const minStreak = home ? MIN_STREAK_HOME : MIN_STREAK;
  if ((n.latency || 9999) > maxLatency) return false;
  if (SPEED_TEST && (n.speed || 0) < minSpeed) return false;
  if ((n.streak || 0) < minStreak) return false;
  return true;
}

function ranked() {
  return store
    .alive()
    .filter(eligible)
    .sort(
      (a, b) =>
        Number(isHome(b)) - Number(isHome(a)) ||
        (b.speed || 0) - (a.speed || 0) ||
        (a.latency || 9999) - (b.latency || 9999)
    );
}

function residential() {
  return ranked().filter(isHome);
}

function selectNodes() {
  const home = residential();
  if (RESIDENTIAL_ONLY && home.length) return home;
  return ranked();
}

function authorized(req, url) {
  if (!SUB_TOKEN) return true;
  const token = url.searchParams.get('token') || req.headers['x-sub-token'];
  return token === SUB_TOKEN;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function subHeaders() {
  return {
    'Profile-Update-Interval': String(REFRESH_MINUTES),
    'Subscription-Userinfo': 'upload=0; download=0; total=0; expire=0',
    'Profile-Title': SUB_TITLE,
    'Cache-Control': 'no-store',
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (p === '/healthz') {
    return send(res, 200, JSON.stringify({ ok: true, alive: store.alive().length }), {
      'Content-Type': 'application/json',
    });
  }

  if (!authorized(req, url)) return send(res, 401, 'unauthorized');

  if (p === '/admin/refresh') {
    if (req.method !== 'POST') return send(res, 405, 'POST only');
    const result = await refresher.refresh().catch((e) => ({ error: e.message }));
    return send(res, 200, JSON.stringify(result), { 'Content-Type': 'application/json' });
  }

  const limit = Math.min(MAX_OUTPUT, Math.max(1, Number(url.searchParams.get('limit')) || MAX_OUTPUT));
  const nodes = selectNodes().slice(0, limit);
  const allNodes = ranked().slice(0, limit);

  if (p === '/sub' || p === '/sub/base64' || p === '/base64') {
    if ((url.searchParams.get('target') || '').toLowerCase() === 'clash') {
      return send(res, 200, toClashYaml(nodes), { ...subHeaders(), 'Content-Type': 'text/yaml; charset=utf-8' });
    }
    return send(res, 200, toSubscription(nodes), subHeaders());
  }
  if (p === '/sub/all') {
    return send(res, 200, toSubscription(allNodes), subHeaders());
  }
  if (p === '/sub/all/plain') {
    return send(res, 200, `${allNodes.map((n) => n.link).join('\n')}\n`, subHeaders());
  }
  if (p === '/sub/plain' || p === '/nodes.txt' || p === '/sub.txt') {
    return send(res, 200, nodes.map((n) => n.link).join('\n') + '\n', subHeaders());
  }
  if (p === '/clash' || p === '/clash.yaml') {
    return send(res, 200, toClashYaml(nodes), { ...subHeaders(), 'Content-Type': 'text/yaml; charset=utf-8' });
  }
  if (p === '/api/stats') {
    return send(
      res,
      200,
      JSON.stringify({
        alive: nodes.length,
        total: Object.keys(store.state.nodes).length,
        updatedAt: store.state.updatedAt,
        lastError: store.state.lastError,
        lastRun: refresher.lastResult,
        running: refresher.running,
        nodes: nodes.map((n) => ({
          name: label(n),
          proto: n.proto,
          server: n.server,
          port: n.port,
          latency: n.latency,
          speed: n.speed,
        })),
      }),
      { 'Content-Type': 'application/json' }
    );
  }
  if (p === '/' || p === '/index.html') {
    return send(res, 200, renderPage({ nodes, total: Object.keys(store.state.nodes).length, state: store.state, running: refresher.running, lastRun: refresher.lastResult }), {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }
  return send(res, 404, 'not found');
});

reportCapabilities();
await ensureSingbox(SINGBOX_BIN).catch((e) => console.error('[bootstrap]', e.message));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[free-proxy-sub] listening on :${PORT}`);
  const age = Date.now() - (store.state.updatedAt || 0);
  if (age > REFRESH_MINUTES * 60000) {
    setTimeout(() => {
      refresher
        .refresh()
        .then((s) => {
          console.log('[refresh]', JSON.stringify(s));
          setTimeout(
            () => refresher.refresh().then((x) => console.log('[refresh]', JSON.stringify(x))).catch((e) => console.error('[refresh]', e.message)),
            150000
          );
        })
        .catch((e) => console.error('[refresh]', e.message));
    }, 2000);
  }
  setInterval(() => refresher.refresh().then((s) => console.log('[refresh]', JSON.stringify(s))).catch((e) => console.error('[refresh]', e.message)), REFRESH_MINUTES * 60000);
});






