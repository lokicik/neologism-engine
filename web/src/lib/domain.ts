export type DomainStatus = 'idle' | 'checking' | 'available' | 'taken' | 'unknown'

export const TLDS = ['.com', '.io', '.ai', '.app', '.co'] as const

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

const domainCache = new Map<string, 'available' | 'taken' | 'unknown'>()

export async function checkDomains(
  name: string,
  onUpdate: (tld: string, status: 'available' | 'taken' | 'unknown') => void,
) {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const tld of TLDS) {
    const host = lower + tld
    if (domainCache.has(host)) {
      onUpdate(tld, domainCache.get(host)!)
      continue
    }
    const status = await checkDomain(host)
    domainCache.set(host, status)
    onUpdate(tld, status)
  }
}

// GitHub handle check — CORS-friendly, no key, 60 req/hr unauth.
// 404 → available, 200 → taken, 403/error → unknown.
const githubCache = new Map<string, 'available' | 'taken' | 'unknown'>()

export async function checkGithub(name: string): Promise<'available' | 'taken' | 'unknown'> {
  const handle = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (githubCache.has(handle)) return githubCache.get(handle)!
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(handle)}`)
    const status = res.status === 404 ? 'available' : res.status === 200 ? 'taken' : 'unknown'
    githubCache.set(handle, status)
    return status
  } catch {
    return 'unknown'
  }
}
