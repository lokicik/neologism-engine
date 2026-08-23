import protocolBaseJson from '../protocol-v5.json'
import protocolOverrideJson from '../protocol-v8.json'
import briefProtocolJson from '../../selection-study/protocol.json'
import { generateBatch, generateNames, type Config, type NameResult } from '../../../web/src/lib/engine'

interface FrozenBrief { id: string; seed: number; brief: string }
interface Protocol {
  schema: string
  sourceIdentity: Record<string, string>
  poolPolicy: {
    style: 'big_tech'; minimumCount: number; seedStride: number; seedModulus: number
    minLength: number; maxLength: number
    temperature: number; variety: number; roots: string[]
    deterministicDoubleRun: true; minimumPairQuality: number
    lanes: Array<{ id: string; count: number; variant: string | null; compound: boolean }>
  }
  pairPolicy: { pairsPerBrief: number; maximumCompositeDifference: number }
  briefs: FrozenBrief[]
}
interface SourcePair { id: string; leftIndex: number; rightIndex: number; compositeDifference: number }
interface SourceLane { id: string; seed: number; exclude: string[]; results: NameResult[] }
interface SourceCase { briefId: string; brief: string; seed: number; lanes: SourceLane[]; pool: NameResult[]; eligibleCount: number; pairs: SourcePair[] }
interface StudySource {
  schema: 'neologism-pairwise-preference-source-v1'
  protocolSha256: string
  sourceIdentity: Record<string, string>
  cases: SourceCase[]
}

type BasePoolPolicy = Omit<Protocol['poolPolicy'], 'minimumCount'> & { targetCount: number }
type ProtocolBase = Omit<Protocol, 'briefs' | 'poolPolicy'> & { poolPolicy: BasePoolPolicy }
const protocolBase = protocolBaseJson as unknown as ProtocolBase
const protocolOverride = protocolOverrideJson as {
  schema: string
  poolOverrides: Pick<Protocol['poolPolicy'], 'minimumCount'> & { merge: string }
}
const {
  targetCount: _removedTargetCount,
  minimumEligibleNames: _removedEligibleReserve,
  ...basePoolPolicy
} = protocolBase.poolPolicy as BasePoolPolicy & { minimumEligibleNames: number }
const protocol = {
  ...protocolBase,
  schema: protocolOverride.schema,
  poolPolicy: {
    ...basePoolPolicy,
    ...protocolOverride.poolOverrides,
  },
  briefs: (briefProtocolJson as { briefs: FrozenBrief[] }).briefs,
} as Protocol
const NAME = /^[A-Za-z]{4,12}$/

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing #${id}`)
  return found as T
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(value)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n)
  }
  return hash
}

function composite(result: NameResult): number {
  return Math.round(result.score_pronounce * .4 + result.score_memorability * .3 + result.score_novelty * .3)
}

function family(result: NameResult): string {
  return `${result.sourceMode ?? 'unknown'}:${result.construction ?? 'unknown'}`
}

function validatePool(briefId: string, pool: NameResult[]): void {
  if (pool.length < protocol.poolPolicy.minimumCount) {
    throw new Error(`${briefId} produced only ${pool.length} names; ${protocol.poolPolicy.minimumCount} required.`)
  }
  const normalized = pool.map((result) => result.name.toLowerCase())
  if (new Set(normalized).size !== pool.length) throw new Error('Pool contains duplicate names.')
  if (pool.some((result) => !NAME.test(result.name))) throw new Error('Pool contains an invalid name.')
}

function buildPairs(briefId: string, pool: NameResult[]): SourcePair[] {
  const possible: Array<SourcePair & { familyMatch: number; tie: bigint }> = []
  for (let left = 0; left < pool.length; left++) {
    for (let right = left + 1; right < pool.length; right++) {
      if (
        composite(pool[left]) < protocol.poolPolicy.minimumPairQuality
        || composite(pool[right]) < protocol.poolPolicy.minimumPairQuality
      ) continue
      const difference = Math.abs(composite(pool[left]) - composite(pool[right]))
      if (difference > protocol.pairPolicy.maximumCompositeDifference) continue
      possible.push({
        id: `${briefId}-${String(possible.length + 1).padStart(3, '0')}`,
        leftIndex: left,
        rightIndex: right,
        compositeDifference: difference,
        familyMatch: Number(family(pool[left]) === family(pool[right])),
        tie: fnv1a64(`${briefId}\0${pool[left].name.toLowerCase()}\0${pool[right].name.toLowerCase()}`),
      })
    }
  }
  possible.sort((left, right) => (
    left.compositeDifference - right.compositeDifference
    || left.familyMatch - right.familyMatch
    || (left.tie < right.tie ? -1 : left.tie > right.tie ? 1 : 0)
    || left.leftIndex - right.leftIndex
    || left.rightIndex - right.rightIndex
  ))
  const used = new Set<number>()
  const selected: SourcePair[] = []
  for (const pair of possible) {
    if (used.has(pair.leftIndex) || used.has(pair.rightIndex)) continue
    used.add(pair.leftIndex)
    used.add(pair.rightIndex)
    selected.push({
      id: `${briefId}-${String(selected.length + 1).padStart(2, '0')}`,
      leftIndex: pair.leftIndex,
      rightIndex: pair.rightIndex,
      compositeDifference: pair.compositeDifference,
    })
    if (selected.length === protocol.pairPolicy.pairsPerBrief) break
  }
  if (selected.length !== protocol.pairPolicy.pairsPerBrief) {
    throw new Error(`${briefId} produced only ${selected.length} disjoint near-quality pairs.`)
  }
  return selected
}

async function generateCase(frozen: FrozenBrief): Promise<SourceCase> {
  const runSession = async (): Promise<{ lanes: SourceLane[]; pool: NameResult[] }> => {
    const lanes: SourceLane[] = []
    const accumulated: NameResult[] = []
    const seen = new Set<string>()
    for (let index = 0; index < protocol.poolPolicy.lanes.length; index++) {
      const lane = protocol.poolPolicy.lanes[index]
      const seed = (frozen.seed + index * protocol.poolPolicy.seedStride) % protocol.poolPolicy.seedModulus
      const exclude = accumulated.map((result) => result.name)
      const cfg: Config = {
        style: protocol.poolPolicy.style,
        variant: lane.variant ?? undefined,
        compound: lane.compound,
        count: lane.count,
        min_len: protocol.poolPolicy.minLength,
        max_len: protocol.poolPolicy.maxLength,
        temperature: protocol.poolPolicy.temperature,
        variety: protocol.poolPolicy.variety,
        roots: protocol.poolPolicy.roots,
        exclude,
        description: frozen.brief,
        seed,
      }
      const results = lane.id === 'auto' ? await generateBatch({ ...cfg, variant: 'auto' }) : await generateNames(cfg)
      for (const result of results) {
        const normalized = result.name.toLowerCase()
        if (seen.has(normalized)) throw new Error(`${frozen.id} repeated ${result.name} across lanes.`)
        seen.add(normalized)
        accumulated.push(result)
      }
      lanes.push({ id: lane.id, seed, exclude, results })
    }
    const pool: NameResult[] = []
    const maximumLaneLength = Math.max(...lanes.map((lane) => lane.results.length), 0)
    for (let position = 0; position < maximumLaneLength; position++) {
      for (const lane of lanes) {
        if (lane.results[position]) pool.push(lane.results[position])
      }
    }
    return { lanes, pool }
  }
  const first = await runSession()
  const replay = await runSession()
  validatePool(frozen.id, first.pool)
  validatePool(frozen.id, replay.pool)
  if (stableJson(first) !== stableJson(replay)) throw new Error(`${frozen.id} failed multi-lane replay.`)
  const eligibleCount = first.pool.filter((result) => (
    composite(result) >= protocol.poolPolicy.minimumPairQuality
  )).length
  return { briefId: frozen.id, brief: frozen.brief, seed: frozen.seed, lanes: first.lanes, pool: first.pool, eligibleCount, pairs: buildPairs(frozen.id, first.pool) }
}

const buildButton = element<HTMLButtonElement>('build')
const downloadButton = element<HTMLButtonElement>('download')
const status = element<HTMLParagraphElement>('status')
const progress = element<HTMLProgressElement>('progress')
const summary = element<HTMLPreElement>('summary')
let source: StudySource | null = null

function downloadJson(value: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([`${stableJson(value)}\n`], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

buildButton.addEventListener('click', async () => {
  buildButton.disabled = true
  downloadButton.disabled = true
  summary.textContent = ''
  source = null
  try {
    const protocolSha256 = await sha256(stableJson(protocol))
    const cases: SourceCase[] = []
    for (const frozen of protocol.briefs) {
      status.textContent = `Generating ${frozen.id} · ${cases.length + 1} of ${protocol.briefs.length}`
      cases.push(await generateCase(frozen))
      progress.value = cases.length
    }
    source = { schema: 'neologism-pairwise-preference-source-v1', protocolSha256, sourceIdentity: protocol.sourceIdentity, cases }
    const payload = stableJson(source)
    const sourceSha256 = await sha256(payload)
    summary.textContent = JSON.stringify({ protocolSha256, sourceSha256, briefs: cases.length, names: cases.reduce((total, item) => total + item.pool.length, 0), primaryPairs: cases.length * protocol.pairPolicy.pairsPerBrief }, null, 2)
    status.textContent = 'Source ready. Exact replay passed for all 30 briefs.'
    downloadButton.disabled = false
    ;(window as unknown as { __preferenceStudySource: StudySource }).__preferenceStudySource = source
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error)
    buildButton.disabled = false
  }
})

downloadButton.addEventListener('click', () => {
  if (source) downloadJson(source, 'preference-source.json')
})
