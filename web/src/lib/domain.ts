export type DomainStatus = 'idle' | 'checking' | 'available' | 'taken' | 'unknown'

// TLDs shown on every card. Entries with an RDAP endpoint below are
// authoritative registry lookups; the rest fall back to a DNS indicator.
export const TLDS = ['.com', '.io', '.ai', '.app', '.dev', '.co'] as const

// Registry RDAP endpoints from the IANA bootstrap (data.iana.org/rdap/dns.json),
// each verified: 200 = registered, 404 = not registered, CORS `*` (RFC 7480
// requires CORS on RDAP). .io and .co have no RDAP service → DoH fallback.
const RDAP: Record<string, string> = {
  '.com': 'https://rdap.verisign.com/com/v1/domain/',
  '.ai': 'https://rdap.identitydigital.services/rdap/domain/',
  '.app': 'https://pubapi.registry.google/rdap/domain/',
  '.dev': 'https://pubapi.registry.google/rdap/domain/',
}

/// True when the TLD's status comes from the registry itself (RDAP), not the
/// DNS indicator — the UI marks these so users know which results are solid.
export function isAuthoritative(tld: string): boolean {
  return tld in RDAP
}

type CheckResult = 'available' | 'taken' | 'unknown'

// Authoritative registry lookup: 404 = available, 200 = registered.
async function checkRdap(base: string, domain: string): Promise<CheckResult> {
  try {
    const res = await fetch(base + encodeURIComponent(domain))
    if (res.status === 404) return 'available'
    if (res.ok) return 'taken'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// Cloudflare DoH JSON API — CORS enabled, no API key needed.
// NXDOMAIN (status 3) → likely available. Any answer → taken.
// This is an INDICATOR only (a registered but unresolving domain reads as
// available) — used only for TLDs without a CORS RDAP service.
async function checkDoh(domain: string): Promise<CheckResult> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
    })
    if (!res.ok) return 'unknown'
    const data = (await res.json()) as { Status: number }
    return data.Status === 3 ? 'available' : 'taken'
  } catch {
    return 'unknown'
  }
}

const domainCache = new Map<string, CheckResult>()

export async function checkDomains(
  name: string,
  onUpdate: (tld: string, status: CheckResult) => void,
) {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  await Promise.all(
    TLDS.map(async (tld) => {
      const host = lower + tld
      if (domainCache.has(host)) {
        onUpdate(tld, domainCache.get(host)!)
        return
      }
      const rdap = RDAP[tld]
      const status = rdap ? await checkRdap(rdap, host) : await checkDoh(host)
      domainCache.set(host, status)
      onUpdate(tld, status)
    }),
  )
}

// Dev-handle checks: GitHub username + package registries. All are
// CORS-friendly public APIs with clean 404 = available semantics — the checks
// that matter for a *project* name (no competitor does these).
export const HANDLES = ['gh', 'npm', 'pypi', 'crates'] as const

const HANDLE_URL: Record<(typeof HANDLES)[number], (n: string) => string> = {
  gh: (n) => `https://api.github.com/users/${n}`, // 60 req/hr unauth
  npm: (n) => `https://registry.npmjs.org/${n}`,
  pypi: (n) => `https://pypi.org/pypi/${n}/json`,
  crates: (n) => `https://crates.io/api/v1/crates/${n}`,
}

const handleCache = new Map<string, CheckResult>()

export async function checkHandles(
  name: string,
  onUpdate: (handle: string, status: CheckResult) => void,
) {
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '')
  await Promise.all(
    HANDLES.map(async (h) => {
      const key = `${h}:${clean}`
      if (handleCache.has(key)) {
        onUpdate(h, handleCache.get(key)!)
        return
      }
      let status: CheckResult = 'unknown'
      try {
        const res = await fetch(HANDLE_URL[h](encodeURIComponent(clean)))
        status = res.status === 404 ? 'available' : res.ok ? 'taken' : 'unknown'
      } catch {
        status = 'unknown'
      }
      handleCache.set(key, status)
      onUpdate(h, status)
    }),
  )
}

// Trademark search link-outs (no API — a real trademark check is a human +
// lawyer job; we put the founder one click away with the name prefilled).
export function trademarkLinks(name: string): { label: string; url: string }[] {
  const q = encodeURIComponent(name)
  return [
    { label: 'USPTO', url: `https://tmsearch.uspto.gov/search/search-information?query=${q}` },
    { label: 'EUIPO', url: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${q}` },
  ]
}
