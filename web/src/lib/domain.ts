export const TLDS = ['.com', '.io', '.ai', '.app', '.dev', '.co'] as const

export type DomainTld = (typeof TLDS)[number]
export type DomainMethod = 'rdap' | 'dns'
export type DomainObservationStatus =
  | 'idle'
  | 'checking'
  | 'record_found'
  | 'no_record'
  | 'dns_record'
  | 'nxdomain'
  | 'no_a_answer'
  | 'rate_limited'
  | 'inconclusive'

export interface DomainObservation {
  tld: DomainTld
  host: string
  method: DomainMethod
  provider: string
  status: DomainObservationStatus
  checkedAt: number | null
  cached: boolean
  source: 'not_run' | 'network' | 'cache' | 'cooldown' | 'cancelled'
  cooldownUntil: number | null
}

export interface DomainEvidenceRun {
  label: string | null
  supported: boolean
  observations: DomainObservation[]
}

export interface DomainRunOptions {
  signal?: AbortSignal
  onUpdate?: (observation: DomainObservation) => void
}

interface DomainTarget {
  tld: DomainTld
  method: DomainMethod
  provider: string
  origin: string
  url: (host: string) => string
}

export interface TransportResponse {
  status: number
  ok: boolean
  redirected?: boolean
  type?: string
  url?: string
  headers?: { get(name: string): string | null }
  json(): Promise<unknown>
}

export type DomainTransport = (url: string, init: RequestInit) => Promise<TransportResponse>
export type DomainDelay = (milliseconds: number) => Promise<void>

export interface DomainEvidenceDependencies {
  transport?: DomainTransport
  now?: () => number
  delay?: DomainDelay
  requestTimeoutMs?: number
  overallTimeoutMs?: number
}

const TARGETS: readonly DomainTarget[] = [
  {
    tld: '.com',
    method: 'rdap',
    provider: 'Verisign',
    origin: 'https://rdap.verisign.com',
    url: (host) => `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(host)}`,
  },
  {
    tld: '.io',
    method: 'dns',
    provider: 'Cloudflare',
    origin: 'https://cloudflare-dns.com',
    url: (host) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
  },
  {
    tld: '.ai',
    method: 'rdap',
    provider: 'Identity Digital',
    origin: 'https://rdap.identitydigital.services',
    url: (host) => `https://rdap.identitydigital.services/rdap/domain/${encodeURIComponent(host)}`,
  },
  {
    tld: '.app',
    method: 'rdap',
    provider: 'Google Registry',
    origin: 'https://pubapi.registry.google',
    url: (host) => `https://pubapi.registry.google/rdap/domain/${encodeURIComponent(host)}`,
  },
  {
    tld: '.dev',
    method: 'rdap',
    provider: 'Google Registry',
    origin: 'https://pubapi.registry.google',
    url: (host) => `https://pubapi.registry.google/rdap/domain/${encodeURIComponent(host)}`,
  },
  {
    tld: '.co',
    method: 'dns',
    provider: 'Cloudflare',
    origin: 'https://cloudflare-dns.com',
    url: (host) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
  },
] as const

const ALLOWED_ORIGINS = new Set(TARGETS.map((target) => target.origin))
const CACHE_TTL_MS = 300_000
const CACHE_LIMIT = 256
const REQUEST_TIMEOUT_MS = 10_000
const OVERALL_TIMEOUT_MS = 30_000
const ORIGIN_SPACING_MS = 1_000
const RATE_LIMIT_COOLDOWN_MS = 60_000
const MAX_CONCURRENT = 4

const terminalCacheable = new Set<DomainObservationStatus>([
  'record_found',
  'no_record',
  'dns_record',
  'nxdomain',
  'no_a_answer',
])

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function abortError(): DOMException {
  return new DOMException('Domain observation cancelled', 'AbortError')
}

interface ScheduledJob<T> {
  origin: string
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  signal?: AbortSignal
  onAbort?: () => void
}

class OriginScheduler {
  private queue: ScheduledJob<unknown>[] = []
  private active = 0
  private activeOrigins = new Set<string>()
  private lastStart = new Map<string, number>()
  private waking = false
  private readonly now: () => number
  private readonly delay: DomainDelay

  constructor(now: () => number, delay: DomainDelay) {
    this.now = now
    this.delay = delay
  }

  schedule<T>(origin: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise<T>((resolve, reject) => {
      const job: ScheduledJob<T> = { origin, run, resolve, reject, signal }
      if (signal) {
        job.onAbort = () => {
          const index = this.queue.indexOf(job as ScheduledJob<unknown>)
          if (index >= 0) this.queue.splice(index, 1)
          reject(abortError())
          this.pump()
        }
        signal.addEventListener('abort', job.onAbort, { once: true })
      }
      this.queue.push(job as ScheduledJob<unknown>)
      this.pump()
    })
  }

  private pump(): void {
    while (this.active < MAX_CONCURRENT) {
      const now = this.now()
      const index = this.queue.findIndex((job) => (
        !job.signal?.aborted
        && !this.activeOrigins.has(job.origin)
        && now - (this.lastStart.get(job.origin) ?? -Infinity) >= ORIGIN_SPACING_MS
      ))
      if (index < 0) break

      const [job] = this.queue.splice(index, 1)
      if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort)
      this.active++
      this.activeOrigins.add(job.origin)
      this.lastStart.set(job.origin, now)
      void job.run().then(job.resolve, job.reject).finally(() => {
        this.active--
        this.activeOrigins.delete(job.origin)
        this.pump()
      })
    }

    if (this.active >= MAX_CONCURRENT || this.queue.length === 0 || this.waking) return
    const now = this.now()
    const waits = this.queue
      .filter((job) => !job.signal?.aborted && !this.activeOrigins.has(job.origin))
      .map((job) => Math.max(
        0,
        ORIGIN_SPACING_MS - (now - (this.lastStart.get(job.origin) ?? -Infinity)),
      ))
    if (waits.length === 0) return
    const next = Math.min(...waits)
    if (next <= 0) return
    this.waking = true
    void this.delay(next).finally(() => {
      this.waking = false
      this.pump()
    })
  }
}

export function normalizeDomainLabel(name: string): string | null {
  const label = name.trim().toLowerCase()
  if (label.length < 1 || label.length > 63) return null
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) return null
  return label
}

export function idleDomainObservations(name: string): DomainObservation[] {
  const label = normalizeDomainLabel(name) ?? name.trim().toLowerCase()
  return TARGETS.map((target) => ({
    tld: target.tld,
    host: `${label}${target.tld}`,
    method: target.method,
    provider: target.provider,
    status: 'idle',
    checkedAt: null,
    cached: false,
    source: 'not_run',
    cooldownUntil: null,
  }))
}

function withStatus(
  target: DomainTarget,
  host: string,
  status: DomainObservationStatus,
  checkedAt: number | null,
  cached = false,
  source: DomainObservation['source'] = 'network',
  cooldownUntil: number | null = null,
): DomainObservation {
  return {
    tld: target.tld,
    host,
    method: target.method,
    provider: target.provider,
    status,
    checkedAt,
    cached,
    source,
    cooldownUntil,
  }
}

function retryAfterMilliseconds(response: TransportResponse, currentTime: number): number {
  const value = response.headers?.get('retry-after')?.trim()
  if (!value) return RATE_LIMIT_COOLDOWN_MS
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const until = Date.parse(value)
  return Number.isFinite(until) ? Math.max(0, until - currentTime) : RATE_LIMIT_COOLDOWN_MS
}

function questionMatches(data: Record<string, unknown>, host: string): boolean {
  if (!Array.isArray(data.Question)) return false
  return data.Question.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const question = entry as Record<string, unknown>
    if (question.type !== 1 || typeof question.name !== 'string') return false
    return question.name.replace(/\.$/, '').toLowerCase() === host
  })
}

function dnsStatus(data: unknown, host: string): DomainObservationStatus {
  if (typeof data !== 'object' || data === null) return 'inconclusive'
  const body = data as Record<string, unknown>
  if (!questionMatches(body, host) || typeof body.Status !== 'number') return 'inconclusive'
  if (body.Status === 3) return 'nxdomain'
  if (body.Status !== 0) return 'inconclusive'
  if (!Array.isArray(body.Answer) || body.Answer.length === 0) return 'no_a_answer'
  return 'dns_record'
}

function isAllowedUrl(url: string): boolean {
  try {
    return ALLOWED_ORIGINS.has(new URL(url).origin)
  } catch {
    return false
  }
}

export function createDomainEvidenceClient(dependencies: DomainEvidenceDependencies = {}) {
  const transport: DomainTransport = dependencies.transport ?? ((url, init) => (
    fetch(url, init) as Promise<TransportResponse>
  ))
  const now = dependencies.now ?? Date.now
  const delay = dependencies.delay ?? wait
  const requestTimeoutMs = dependencies.requestTimeoutMs ?? REQUEST_TIMEOUT_MS
  const overallTimeoutMs = dependencies.overallTimeoutMs ?? OVERALL_TIMEOUT_MS
  const scheduler = new OriginScheduler(now, delay)
  const cache = new Map<string, DomainObservation>()
  const inFlight = new Map<string, {
    promise: Promise<DomainObservation>
    controller: AbortController
    subscribers: Set<symbol>
    settled: boolean
  }>()
  const cooldownUntil = new Map<string, number>()

  function cached(key: string): DomainObservation | null {
    const hit = cache.get(key)
    if (!hit) return null
    if (hit.checkedAt === null || now() - hit.checkedAt >= CACHE_TTL_MS) {
      cache.delete(key)
      return null
    }
    cache.delete(key)
    cache.set(key, hit)
    return { ...hit, cached: true, source: 'cache' }
  }

  function remember(key: string, observation: DomainObservation): void {
    if (!terminalCacheable.has(observation.status)) return
    cache.delete(key)
    cache.set(key, { ...observation, cached: false, source: 'network' })
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value as string | undefined
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }

  async function request(url: string, signal: AbortSignal): Promise<TransportResponse> {
    if (!isAllowedUrl(url)) throw new Error('Blocked availability origin')
    if (signal.aborted) throw abortError()
    const controller = new AbortController()
    let rejectAbort: ((reason: unknown) => void) | null = null
    const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = () => {
      controller.abort()
      rejectAbort?.(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    let timeout: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new DOMException('Domain observation timed out', 'TimeoutError'))
      }, requestTimeoutMs)
    })
    try {
      const response = await Promise.race([
        transport(url, {
          method: 'GET',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'manual',
          headers: { Accept: url.includes('dns-query') ? 'application/dns-json' : 'application/rdap+json' },
          signal: controller.signal,
        }),
        timeoutPromise,
        abortPromise,
      ])
      if (response.redirected || response.type === 'opaqueredirect') throw new Error('Redirect rejected')
      if (response.url && !isAllowedUrl(response.url)) throw new Error('Redirect origin rejected')
      return response
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
  }

  async function observeOne(
    target: DomainTarget,
    host: string,
    signal: AbortSignal,
  ): Promise<DomainObservation> {
    const key = `${target.method}:${host}`
    const cacheHit = cached(key)
    if (cacheHit) return cacheHit
    let entry = inFlight.get(key)
    if (!entry) {
      const controller = new AbortController()
      const work = scheduler.schedule(target.origin, async () => {
        const cooldown = cooldownUntil.get(target.origin) ?? 0
        if (cooldown > now()) {
          return withStatus(target, host, 'rate_limited', now(), false, 'cooldown', cooldown)
        }
        try {
          const response = await request(target.url(host), controller.signal)
          const checkedAt = now()
          if (response.status === 429) {
            const retryAt = checkedAt + retryAfterMilliseconds(response, checkedAt)
            cooldownUntil.set(target.origin, retryAt)
            return withStatus(target, host, 'rate_limited', checkedAt, false, 'network', retryAt)
          }
          let status: DomainObservationStatus = 'inconclusive'
          if (target.method === 'rdap') {
            if (response.status === 200) status = 'record_found'
            else if (response.status === 404) status = 'no_record'
          } else if (response.ok) {
            status = dnsStatus(await response.json(), host)
          }
          const observation = withStatus(target, host, status, checkedAt)
          remember(key, observation)
          return observation
        } catch {
          return withStatus(target, host, 'inconclusive', now())
        }
      }, controller.signal).catch(() => (
        withStatus(target, host, 'inconclusive', null, false, 'cancelled')
      ))

      entry = {
        promise: work,
        controller,
        subscribers: new Set(),
        settled: false,
      }
      inFlight.set(key, entry)
      void work.finally(() => {
        entry!.settled = true
        if (inFlight.get(key) === entry) inFlight.delete(key)
      })
    }

    if (signal.aborted) {
      if (entry.subscribers.size === 0 && !entry.settled) entry.controller.abort()
      return withStatus(target, host, 'inconclusive', null, false, 'cancelled')
    }

    const subscriber = Symbol(key)
    entry.subscribers.add(subscriber)
    return await new Promise<DomainObservation>((resolve) => {
      let finished = false
      const finish = (observation: DomainObservation) => {
        if (finished) return
        finished = true
        signal.removeEventListener('abort', onAbort)
        entry!.subscribers.delete(subscriber)
        if (entry!.subscribers.size === 0 && !entry!.settled) entry!.controller.abort()
        resolve(observation)
      }
      const onAbort = () => finish(
        withStatus(target, host, 'inconclusive', null, false, 'cancelled'),
      )
      signal.addEventListener('abort', onAbort, { once: true })
      void entry!.promise.then(finish, () => finish(
        withStatus(target, host, 'inconclusive', now()),
      ))
    })
  }

  async function run(name: string, options: DomainRunOptions = {}): Promise<DomainEvidenceRun> {
    const label = normalizeDomainLabel(name)
    if (!label) {
      return { label: null, supported: false, observations: idleDomainObservations(name) }
    }

    const controller = new AbortController()
    const onAbort = () => controller.abort()
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const overallTimer = setTimeout(() => controller.abort(), overallTimeoutMs)
    const observations = idleDomainObservations(label)
    for (const observation of observations) {
      options.onUpdate?.({
        ...observation,
        status: 'checking',
        checkedAt: null,
        cached: false,
        source: 'network',
        cooldownUntil: null,
      })
    }

    try {
      const completed = await Promise.all(TARGETS.map(async (target, index) => {
        const observation = await observeOne(target, `${label}${target.tld}`, controller.signal)
        observations[index] = observation
        if (!controller.signal.aborted) options.onUpdate?.(observation)
        return observation
      }))
      return { label, supported: true, observations: completed }
    } finally {
      clearTimeout(overallTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }
  }

  return { run }
}

const defaultDomainEvidenceClient = createDomainEvidenceClient()

export function checkDomainEvidence(
  name: string,
  options?: DomainRunOptions,
): Promise<DomainEvidenceRun> {
  return defaultDomainEvidenceClient.run(name, options)
}

export type ManualLookupService = 'github' | 'npm' | 'pypi' | 'crates' | 'uspto' | 'euipo'

export interface ManualLookupLink {
  service: ManualLookupService
  label: string
  url: string
  group: 'developer' | 'trademark'
}

export function manualLookupLinks(name: string): ManualLookupLink[] {
  const query = encodeURIComponent(name.trim())
  return [
    { service: 'github', label: 'GitHub', url: `https://github.com/search?q=${query}&type=repositories`, group: 'developer' },
    { service: 'npm', label: 'npm', url: `https://www.npmjs.com/search?q=${query}`, group: 'developer' },
    { service: 'pypi', label: 'PyPI', url: `https://pypi.org/search/?q=${query}`, group: 'developer' },
    { service: 'crates', label: 'crates.io', url: `https://crates.io/search?q=${query}`, group: 'developer' },
    { service: 'uspto', label: 'USPTO', url: `https://tmsearch.uspto.gov/search/search-information?query=${query}`, group: 'trademark' },
    { service: 'euipo', label: 'EUIPO', url: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${query}`, group: 'trademark' },
  ]
}
