import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const VERSION = process.env.SINGBOX_VERSION || '1.14.3';

function assetName() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  if (process.platform === 'win32') return `sing-box-${VERSION}-windows-${arch}.zip`;
  return `sing-box-${VERSION}-linux-${arch}.tar.gz`;
}

export async function ensureSingbox(binPath) {
  if (fs.existsSync(binPath)) return { ok: true, cached: true };
  const name = assetName();
  const url = `https://github.com/SagerNet/sing-box/releases/download/v${VERSION}/${name}`;
  const dir = path.dirname(binPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(os.tmpdir(), name);
  console.log(`[bootstrap] downloading ${name}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  if (name.endsWith('.zip')) {
    await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${dir}/extract' -Force`]);
    const src = path.join(dir, 'extract', `sing-box-${VERSION}-windows-amd64`, 'sing-box.exe');
    fs.copyFileSync(src, binPath);
  } else {
    await run('tar', ['xzf', tmp, '-C', dir]);
    fs.copyFileSync(path.join(dir, `sing-box-${VERSION}-linux-${process.arch === 'arm64' ? 'arm64' : 'amd64'}`, 'sing-box'), binPath);
  }
  fs.chmodSync(binPath, 0o755);
  fs.rmSync(tmp, { force: true });
  fs.rmSync(path.join(dir, 'extract'), { recursive: true, force: true });
  fs.rmSync(path.join(dir, `sing-box-${VERSION}-linux-amd64`), { recursive: true, force: true });
  fs.rmSync(path.join(dir, `sing-box-${VERSION}-linux-arm64`), { recursive: true, force: true });
  console.log('[bootstrap] sing-box ready');
  return { ok: true, cached: true };
}
