import {
  TLDS,
  createDomainEvidenceClient,
  manualLookupLinks,
  normalizeDomainLabel,
} from '../src/lib/domain.ts'

let failures = 0
let assertions = 0
const check = (ok: boolean, label: string) => {
  assertions++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

function response(
  status: number,
  body: unknown = {},
  options: { redirected?: boolean; type?: string; url?: string; retryAfter?: string } = {},
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: options.redirected ?? false,
    type: options.type ?? 'cors',
    url: options.url ?? '',
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'retry-after' ? options.retryAfter ?? null : null
      },
    },
    async json() { return body },
  }
}

function queriedHost(url: string): string {
  const parsed = new URL(url)
  if (parsed.hostname === 'cloudflare-dns.com') return parsed.searchParams.get('name') ?? ''
  return decodeURIComponent(parsed.pathname.split('/').at(-1) ?? '')
}

function dns(host: string, status: number, answers?: unknown[]) {
  return {
    Status: status,
    Question: [{ name: `${host}.`, type: 1 }],
    ...(answers === undefined ? {} : { Answer: answers }),
  }
}

function normalResponse(url: string) {
  const host = queriedHost(url)
  return url.includes('dns-query')
    ? response(200, dns(host, 3))
    : response(404)
}

function fakeClock(start = 10_000) {
  let value = start
  return {
    now: () => value,
    delay: async (milliseconds: number) => { value += milliseconds },
    set: (next: number) => { value = next },
  }
}

check(normalizeDomainLabel('  Forge-7  ') === 'forge-7', 'normalization only trims and lowercases a valid ASCII label')
check(normalizeDomainLabel('Forge 7') === null, 'spaces are rejected instead of silently stripped')
check(normalizeDomainLabel('Forge!') === null, 'punctuation is rejected instead of silently stripped')
check(normalizeDomainLabel('Førge') === null, 'Unicode is unsupported instead of silently transliterated')
check(normalizeDomainLabel('-forge') === null && normalizeDomainLabel('forge-') === null, 'leading and trailing hyphens are rejected')
check(normalizeDomainLabel('a'.repeat(63)) !== null && normalizeDomainLabel('a'.repeat(64)) === null, 'DNS label length boundary is 63 characters')

{
  let calls = 0
  const client = createDomainEvidenceClient({
    transport: async (url) => { calls++; return normalResponse(url) },
  })
  const run = await client.run('Bad Name')
  check(!run.supported && run.label === null && calls === 0, 'unsupported spelling makes zero transport requests')
}

{
  const clock = fakeClock()
  const calls: Array<{ url: string; init: RequestInit; at: number }> = []
  let active = 0
  let maxActive = 0
  const activeOrigins = new Set<string>()
  let perOriginOverlap = false
  const starts = new Map<string, number[]>()
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url, init) => {
      const origin = new URL(url).origin
      calls.push({ url, init, at: clock.now() })
      active++
      maxActive = Math.max(maxActive, active)
      if (activeOrigins.has(origin)) perOriginOverlap = true
      activeOrigins.add(origin)
      const originStarts = starts.get(origin) ?? []
      originStarts.push(clock.now())
      starts.set(origin, originStarts)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      activeOrigins.delete(origin)

      const host = queriedHost(url)
      if (host.endsWith('.com')) return response(200)
      if (host.endsWith('.io')) return response(200, dns(host, 0, [{ name: host, type: 1 }]))
      if (host.endsWith('.ai')) return response(404)
      if (host.endsWith('.app')) return response(403)
      if (host.endsWith('.dev')) return response(500)
      return response(200, dns(host, 3))
    },
  })
  const run = await client.run('Forge')
  check(
    run.observations.map((item) => item.status).join(',')
      === 'record_found,dns_record,no_record,inconclusive,inconclusive,nxdomain',
    'RDAP and DNS status semantics stay source-specific and ordered',
  )
  check(run.observations.map((item) => item.tld).join(',') === TLDS.join(','), 'response completion order cannot reorder the six-domain model')
  check(calls.length === 6 && maxActive <= 4 && !perOriginOverlap, 'one run makes six requests with global <=4 and per-origin <=1 concurrency')
  check(
    [...starts.values()].every((times) => times.every((time, index) => index === 0 || time - times[index - 1] >= 1_000)),
    'requests to the same origin start at least one second apart',
  )
  check(calls.every(({ url }) => ['rdap.verisign.com', 'cloudflare-dns.com', 'rdap.identitydigital.services', 'pubapi.registry.google'].includes(new URL(url).hostname)), 'every request stays on the frozen origin allowlist')
  check(calls.every(({ init }) => init.credentials === 'omit' && init.referrerPolicy === 'no-referrer' && init.cache === 'no-store' && init.redirect === 'manual'), 'transport omits credentials/referrer/cache and rejects redirects')
  check(calls.every(({ url }) => /forge\.(com|io|ai|app|dev|co)/.test(decodeURIComponent(url)) && !/brief|taste|history|api.?key/i.test(url)), 'only the canonical queried host enters request URLs')
}

{
  const clock = fakeClock()
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      const host = queriedHost(url)
      if (host.endsWith('.io')) return response(200, dns(host, 0, []))
      if (host.endsWith('.co')) return response(200, dns(host, 2))
      return normalResponse(url)
    },
  })
  const run = await client.run('emptydns')
  check(run.observations.find((item) => item.tld === '.io')?.status === 'no_a_answer', 'DNS NOERROR with no answer stays distinct from NXDOMAIN')
  check(run.observations.find((item) => item.tld === '.co')?.status === 'inconclusive', 'DNS SERVFAIL/REFUSED-style codes never become found or absent')
}

{
  const clock = fakeClock()
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      const host = queriedHost(url)
      if (host.endsWith('.io')) return response(200, { Status: 3, Question: [{ name: 'other.io.', type: 1 }] })
      if (host.endsWith('.co')) return response(200, { Status: 0 })
      return normalResponse(url)
    },
  })
  const run = await client.run('malformed')
  check(run.observations.filter((item) => item.method === 'dns').every((item) => item.status === 'inconclusive'), 'malformed or mismatched DoH bodies fail closed')
}

{
  const clock = fakeClock()
  let googleCalls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      if (new URL(url).origin === 'https://pubapi.registry.google') {
        googleCalls++
        return response(429, {}, { retryAfter: '120' })
      }
      return normalResponse(url)
    },
  })
  const run = await client.run('cooldown')
  check(
    googleCalls === 1
      && run.observations.find((item) => item.tld === '.app')?.status === 'rate_limited'
      && run.observations.find((item) => item.tld === '.dev')?.status === 'rate_limited',
    'HTTP 429 stops the same-origin queue and exposes provider cooldown',
  )
}

{
  const clock = fakeClock()
  let calls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      calls++
      if (queriedHost(url).endsWith('.com')) throw new Error('network')
      if (queriedHost(url).endsWith('.ai')) return response(200, {}, { redirected: true })
      return normalResponse(url)
    },
  })
  const first = await client.run('failure')
  await client.run('failure')
  check(first.observations.find((item) => item.tld === '.com')?.status === 'inconclusive', 'network errors are terminal but inconclusive')
  check(first.observations.find((item) => item.tld === '.ai')?.status === 'inconclusive', 'redirected responses are rejected as inconclusive')
  check(calls === 8, 'inconclusive transport and redirect results are retried while four conclusive results use cache')
}

{
  const clock = fakeClock()
  let calls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => { calls++; return normalResponse(url) },
  })
  const first = await client.run('cacheclock')
  const checkedAt = first.observations.find((item) => item.tld === '.com')?.checkedAt ?? 0
  clock.set(checkedAt + 299_999)
  const cached = await client.run('cacheclock')
  check(calls === 6 && cached.observations.every((item) => item.cached), 'conclusive evidence stays cached at TTL minus one millisecond')
  clock.set(checkedAt + 300_000)
  const refreshed = await client.run('cacheclock')
  check(
    calls === 10
      && refreshed.observations.find((item) => item.tld === '.com')?.cached === false
      && refreshed.observations.find((item) => item.tld === '.dev')?.cached === true,
    'each observation refetches at its own exact 300000ms TTL boundary',
  )
}

{
  const clock = fakeClock()
  let calls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 2))
      return normalResponse(url)
    },
  })
  const [left, right] = await Promise.all([client.run('coalesce'), client.run('coalesce')])
  check(calls === 6, 'concurrent identical observations coalesce to one request per domain')
  check(JSON.stringify(left.observations) === JSON.stringify(right.observations), 'coalesced callers receive the same ordered observation model')
}

{
  const clock = fakeClock()
  let calls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    transport: async (url) => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 4))
      return normalResponse(url)
    },
  })
  const ownerController = new AbortController()
  const owner = client.run('sharedabort', { signal: ownerController.signal })
  const survivor = client.run('sharedabort')
  ownerController.abort()
  const [cancelled, completed] = await Promise.all([owner, survivor])
  check(
    cancelled.observations.every((item) => item.source === 'cancelled')
      && completed.observations.every((item) => item.status === 'no_record' || item.status === 'nxdomain'),
    'cancelling one coalesced subscriber cannot cancel the active subscriber',
  )
  check(calls === 6, 'abort-safe coalescing still issues only one request per domain')
}

{
  const clock = fakeClock()
  let calls = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    requestTimeoutMs: 5,
    overallTimeoutMs: 100,
    transport: async (url) => {
      calls++
      if (queriedHost(url).endsWith('.com')) return await new Promise(() => {})
      return normalResponse(url)
    },
  })
  const run = await client.run('timeout')
  check(calls === 6 && run.observations.find((item) => item.tld === '.com')?.status === 'inconclusive', 'a request timeout terminates as inconclusive without blocking the run')
}

{
  const clock = fakeClock()
  const pending: Array<() => void> = []
  let lateUpdates = 0
  const client = createDomainEvidenceClient({
    now: clock.now,
    delay: clock.delay,
    requestTimeoutMs: 100,
    transport: async (url) => await new Promise((resolve) => {
      pending.push(() => resolve(normalResponse(url)))
    }),
  })
  const controller = new AbortController()
  const run = client.run('cancelled', {
    signal: controller.signal,
    onUpdate: (item) => { if (item.status !== 'checking') lateUpdates++ },
  })
  controller.abort()
  const result = await run
  pending.forEach((resolve) => resolve())
  await new Promise((resolve) => setTimeout(resolve, 0))
  check(result.observations.every((item) => item.status === 'inconclusive'), 'cancellation resolves every started or queued cell to a terminal state')
  check(lateUpdates === 0, 'late transport completions cannot update a cancelled card')
}

{
  const links = manualLookupLinks('Forge Name')
  check(links.map((link) => link.service).join(',') === 'github,npm,pypi,crates,uspto,euipo', 'all developer and trademark providers remain explicit manual links')
  check(links.every((link) => /Forge%20Name/.test(link.url)), 'manual links carry only the displayed name when the user opens them')
  check(links.filter((link) => link.group === 'developer').length === 4 && links.filter((link) => link.group === 'trademark').length === 2, 'manual links stay separated into developer and trademark groups')
}

if (failures > 0) {
  console.error(`${failures}/${assertions} domain contract checks failed`)
  process.exitCode = 1
} else {
  console.log(`domain contract: all ${assertions} checks passed`)
}
