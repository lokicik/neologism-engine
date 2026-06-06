export type DomainStatus = 'idle' | 'checking' | 'available' | 'taken' | 'unknown'

// Uses Cloudflare DoH JSON API — CORS enabled, no API key needed.
// NXDOMAIN (status 3) → likely available. Any answer → taken.
// This is an INDICATOR only, not an authoritative registrar check.
async function checkDomain(hostname: string): Promise<'available' | 'taken' | 'unknown'> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
    })
    if (!res.ok) return 'unknown'
    const data = (await res.json()) as { Status: number }
    // Status 3 = NXDOMAIN → name doesn't resolve → likely available
    return data.Status === 3 ? 'available' : 'taken'
  } catch {
    return 'unknown'
  }
}

const cache = new Map<string, 'available' | 'taken' | 'unknown'>()

export async function checkDomains(
  name: string,
  onUpdate: (tld: string, status: 'available' | 'taken' | 'unknown') => void,
) {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const tlds = ['.com', '.io']
  for (const tld of tlds) {
    const host = lower + tld
    if (cache.has(host)) {
      onUpdate(tld, cache.get(host)!)
      continue
    }
    const status = await checkDomain(host)
    cache.set(host, status)
    onUpdate(tld, status)
  }
}
