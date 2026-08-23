import protocolJson from '../source-protocol.json'
import briefBankJson from '../brief-bank.json'
import { generateBatch, generateNames, type Config, type NameResult } from '../../../web/src/lib/engine'

interface FrozenBrief { id: string; seed: number; brief: string }
interface LaneSpec { id: string; count: number; variant: string | null; compound: boolean }
interface Protocol {
  schema: string
  sourceIdentity: Record<string, string>
  poolPolicy: {
    style: 'big_tech'; minimumCount: number; seedStride: number; seedModulus: number
    minLength: number; maxLength: number; temperature: number; variety: number
    roots: string[]; deterministicDoubleRun: true; minimumPairQuality: number; lanes: LaneSpec[]
  }
  pairPolicy: { pairsPerBrief: number; maximumCompositeDifference: number }
  recruitmentPolicy: { bankSize: number; requiredPassingBriefs: number; selection: string }
  splitPolicy: { trainBriefs: number; validationBriefs: number; testBriefs: number }
}
interface SourcePair { id: string; leftIndex: number; rightIndex: number; compositeDifference: number }
interface SourceLane { id: string; seed: number; exclude: string[]; results: NameResult[] }
interface SourceCase {
  briefId: string; brief: string; seed: number; partition?: 'train' | 'validation' | 'test'
  lanes: SourceLane[]; pool: NameResult[]; eligibleCount: number; pairs: SourcePair[]
}
interface AuditRow { briefId: string; brief: string; passed: boolean; poolCount: number; eligibleCount: number; pairCount: number; reason?: string }
interface StudySource {
  schema: 'neologism-prospective-preference-source-v1'
  protocolSha256: string
  sourceIdentity: Record<string, string>
  audit: AuditRow[]
  cases: SourceCase[]
}

const protocol = protocolJson as Protocol
const briefs = (briefBankJson as { briefs: FrozenBrief[] }).briefs
const NAME = /^[A-Za-z]{4,12}$/

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing #${id}`)
  return found as T
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    )).join(',')}}`
  }
  if (value === undefined) return 'null'
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
  return `${result.sourceMode ?? 'unknown'}:${result.construction ?? 'none'}`
}

function buildPairs(briefId: string, pool: NameResult[]): SourcePair[] {
  const possible: Array<SourcePair & { familyMatch: number; tie: bigint }> = []
  for (let left = 0; left < pool.length; left++) {
    for (let right = left + 1; right < pool.length; right++) {
      if (composite(pool[left]) < protocol.poolPolicy.minimumPairQuality || composite(pool[right]) < protocol.poolPolicy.minimumPairQuality) continue
      const difference = Math.abs(composite(pool[left]) - composite(pool[right]))
      if (difference > protocol.pairPolicy.maximumCompositeDifference) continue
      possible.push({
        id: '', leftIndex: left, rightIndex: right, compositeDifference: difference,
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
  return selected
}

async function generateCase(frozen: FrozenBrief): Promise<{ sourceCase: SourceCase; audit: AuditRow }> {
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
        if (seen.has(normalized)) throw new Error(`${frozen.id} repeated ${result.name} across lanes`)
        seen.add(normalized)
        accumulated.push(result)
      }
      lanes.push({ id: lane.id, seed, exclude, results })
    }
    const pool: NameResult[] = []
    const maximum = Math.max(...lanes.map((lane) => lane.results.length), 0)
    for (let position = 0; position < maximum; position++) {
      for (const lane of lanes) if (lane.results[position]) pool.push(lane.results[position])
    }
    return { lanes, pool }
  }

  const first = await runSession()
  const replay = await runSession()
  if (stableJson(first) !== stableJson(replay)) throw new Error(`${frozen.id} failed deterministic replay`)
  const normalized = first.pool.map((result) => result.name.toLowerCase())
  const duplicate = new Set(normalized).size !== first.pool.length
  const invalid = first.pool.some((result) => !NAME.test(result.name))
  const eligibleCount = first.pool.filter((result) => composite(result) >= protocol.poolPolicy.minimumPairQuality).length
  const pairs = duplicate || invalid ? [] : buildPairs(frozen.id, first.pool)
  const reasons = [
    first.pool.length < protocol.poolPolicy.minimumCount ? `pool ${first.pool.length}<${protocol.poolPolicy.minimumCount}` : '',
    duplicate ? 'duplicate name' : '',
    invalid ? 'invalid name' : '',
    pairs.length < protocol.pairPolicy.pairsPerBrief ? `pairs ${pairs.length}<${protocol.pairPolicy.pairsPerBrief}` : '',
  ].filter(Boolean)
  const sourceCase: SourceCase = {
    briefId: frozen.id,
    brief: frozen.brief,
    seed: frozen.seed,
    lanes: first.lanes,
    pool: first.pool,
    eligibleCount,
    pairs,
  }
  return {
    sourceCase,
    audit: {
      briefId: frozen.id,
      brief: frozen.brief,
      passed: reasons.length === 0,
      poolCount: first.pool.length,
      eligibleCount,
      pairCount: pairs.length,
      ...(reasons.length ? { reason: reasons.join('; ') } : {}),
    },
  }
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
    if (briefs.length !== protocol.recruitmentPolicy.bankSize) throw new Error('brief bank size mismatch')
    const protocolSha256 = await sha256(stableJson({ protocol, briefBank: briefBankJson }))
    const generated: SourceCase[] = []
    const audit: AuditRow[] = []
    for (const frozen of briefs) {
      status.textContent = `Auditing ${frozen.id} · ${audit.length + 1} of ${briefs.length}`
      const result = await generateCase(frozen)
      generated.push(result.sourceCase)
      audit.push(result.audit)
      progress.value = audit.length
    }
    const passing = generated.filter((_, index) => audit[index].passed)
    passing.sort((left, right) => {
      const leftHash = fnv1a64(left.brief)
      const rightHash = fnv1a64(right.brief)
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : left.briefId.localeCompare(right.briefId)
    })
    if (passing.length < protocol.recruitmentPolicy.requiredPassingBriefs) {
      throw new Error(`Only ${passing.length}/60 briefs passed; 30 required.`)
    }
    const cases = passing.slice(0, protocol.recruitmentPolicy.requiredPassingBriefs)
    cases.forEach((item, index) => {
      item.partition = index < protocol.splitPolicy.trainBriefs
        ? 'train'
        : index < protocol.splitPolicy.trainBriefs + protocol.splitPolicy.validationBriefs
          ? 'validation'
          : 'test'
    })
    source = {
      schema: 'neologism-prospective-preference-source-v1',
      protocolSha256,
      sourceIdentity: protocol.sourceIdentity,
      audit,
      cases,
    }
    const payload = stableJson(source)
    const sourceSha256 = await sha256(payload)
    summary.textContent = JSON.stringify({
      protocolSha256,
      sourceSha256,
      bankBriefs: audit.length,
      passingBriefs: passing.length,
      failedBriefs: audit.filter((item) => !item.passed).map((item) => ({ id: item.briefId, reason: item.reason })),
      retainedBriefs: cases.length,
      retainedNames: cases.reduce((total, item) => total + item.pool.length, 0),
      retainedMinimumPool: Math.min(...cases.map((item) => item.pool.length)),
      retainedMinimumEligible: Math.min(...cases.map((item) => item.eligibleCount)),
      primaryPairs: cases.reduce((total, item) => total + item.pairs.length, 0),
      retainedIds: cases.map((item) => `${item.briefId}:${item.partition}`),
    }, null, 2)
    status.textContent = 'Source ready. All 60 briefs were audited; 30 were retained by frozen hash order.'
    downloadButton.disabled = false
    ;(window as unknown as { __preferenceLearningSource: StudySource }).__preferenceLearningSource = source
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error)
    buildButton.disabled = false
  }
})

downloadButton.addEventListener('click', () => {
  if (source) downloadJson(source, 'preference-learning-source.json')
})
