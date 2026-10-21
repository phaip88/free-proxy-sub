const HOSTING_HINTS = /cloudflare|fastly|akamai|amazon|aws|google|microsoft|azure|oracle|digitalocean|ovh|hetzner|contabo|vultr|linode|leaseweb|m247|choopa|colocrossing|hostinger|itefix|gsl networks|constant company|serverius|psychz|quadranet|clouvider|datacamp|hostwinds|kamatera|scaleway|light node|timeweb|greenhost|hosting|vps|dedicated|datacenter|data center|colocation/i;

const BATCH_URL = 'http://ip-api.com/batch?fields=query,status,isp,org,as,hosting,proxy,mobile';

export function classifyIps(ips) {
  const unique = [...new Set(ips.filter(Boolean))];
  if (!unique.length) return Promise.resolve(new Map());
  const chunks = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  return (async () => {
    const out = new Map();
    for (const chunk of chunks) {
      try {
        const res = await fetch(BATCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        for (const r of rows) {
          if (!r || r.status !== 'success') continue;
          const hosted = !!r.hosting || !!r.proxy || HOSTING_HINTS.test(`${r.isp} ${r.org} ${r.as}`);
          out.set(r.query, {
            isp: r.isp || '',
            org: r.org || '',
            asn: r.as || '',
            hosting: hosted,
            proxy: !!r.proxy,
            mobile: !!r.mobile,
            residential: !hosted,
          });
        }
      } catch {
        /* classification is best-effort */
      }
    }
    return out;
  })();
}
