import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function tryCommand(cmd, args) {
  try {
    return execFileSync(cmd, args, { timeout: 5000 }).toString().trim();
  } catch {
    return null;
  }
}

export function reportCapabilities() {
  const out = {
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    gid: typeof process.getgid === 'function' ? process.getgid() : null,
    platform: process.platform,
    tunDevice: fs.existsSync('/dev/net/tun'),
    tunOpen: false,
    tunError: null,
    capEff: null,
    openvpn: tryCommand('sh', ['-c', 'command -v openvpn']),
    systemctl: tryCommand('sh', ['-c', 'command -v systemctl']),
  };
  if (out.tunDevice) {
    try {
      const fd = fs.openSync('/dev/net/tun', 'r+');
      fs.closeSync(fd);
      out.tunOpen = true;
    } catch (e) {
      out.tunError = e.code || e.message;
    }
  }
  try {
    out.capEff = (fs.readFileSync('/proc/self/status', 'utf8').match(/^CapEff:\s*(\S+)/m) || [])[1] || null;
  } catch {
    out.capEff = null;
  }
  console.log('[caps]', JSON.stringify(out));
  return out;
}
