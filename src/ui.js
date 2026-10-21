import { label } from './output.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function kind(n) {
  if (n.mobile === true) return `移动 ${n.isp || ''}`.trim();
  if (n.residential === true) return `家宽 ${n.isp || ''}`.trim();
  if (n.hosting === true) return `机房 ${n.isp || ''}`.trim();
  return n.isp || '未知';
}

export function renderPage({ nodes, total, state, running, lastRun }) {
  const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '-';
  const home = nodes.filter((n) => n.residential === true || n.mobile === true).length;
  const rows = nodes
    .slice(0, 100)
    .map(
      (n, i) =>
        `<tr><td>${i + 1}</td><td>${esc(n.proto)}</td><td>${esc(n.server)}:${n.port}</td><td>${n.latency || '-'}</td><td>${n.speed || '-'}</td><td>${esc(kind(n))}</td><td>${esc(n.name)}</td></tr>`
    )
    .join('');
  const run = lastRun ? `<pre>${esc(JSON.stringify(lastRun, null, 2))}</pre>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>free-proxy-sub</title>
<style>
body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;margin:0;padding:24px;background:#0f1115;color:#e6e6e6}
h1{font-size:18px;margin:0 0 12px}
.card{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:14px 16px;margin-bottom:14px}
code{background:#0b0d11;padding:2px 6px;border-radius:4px;color:#7ee787;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #232833}
th{color:#8b949e;font-weight:500}
pre{background:#0b0d11;padding:10px;border-radius:6px;overflow:auto;font-size:12px;max-height:260px}
.k{color:#8b949e}
</style></head><body>
<h1>free-proxy-sub</h1>
<div class="card">
<div><span class="k">可用节点</span> <b>${nodes.length}</b>（家宽 <b>${home}</b>）/ 池 <b>${total}</b> · <span class="k">更新</span> ${esc(updated)} · <span class="k">测速中</span> ${running ? '是' : '否'}</div>
<div style="margin-top:10px"><span class="k">订阅(通用 base64)</span><br><code>/sub</code></div>
<div style="margin-top:6px"><span class="k">Clash / Mihomo</span><br><code>/clash</code></div>
<div style="margin-top:6px"><span class="k">明文链接</span><br><code>/sub/plain</code></div>
</div>
<div class="card">
<table><thead><tr><th>#</th><th>协议</th><th>地址</th><th>延迟 ms</th><th>速率 kbps</th><th>网络类型</th><th>名称</th></tr></thead><tbody>${rows || '<tr><td colspan="7">暂无数据，首次测速进行中</td></tr>'}</tbody></table>
</div>
${run}
</body></html>`;
}
