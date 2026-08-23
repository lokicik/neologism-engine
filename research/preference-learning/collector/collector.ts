import sourceJson from '../work/source.json'
import protocolJson from '../collector-protocol.json'

type Choice = 'left' | 'right' | 'neither'
type Partition = 'train' | 'validation' | 'test'
interface Result { name: string }
interface Pair { id: string; leftIndex: number; rightIndex: number }
interface SourceCase { briefId: string; brief: string; partition: Partition; pool: Result[]; pairs: Pair[] }
interface Source { schema: string; protocolSha256: string; cases: SourceCase[] }
interface Protocol {
  schema: string; sourcePayloadSha256: string; primaryCount: number; repeatCount: number
  consistencyGate: number; resumeStorageKey: string
  minimumDecisive: Record<Partition, number>
}
interface Task {
  id: string; pairId: string; briefId: string; brief: string; partition: Partition
  leftName: string; rightName: string; repeatOf?: string
}
interface Decision { taskId: string; choice: Choice; decidedAt: string }
interface SavedState { sourceSha256: string; collectorProtocolSha256: string; decisions: Decision[] }

const source = sourceJson as Source
const protocol = protocolJson as Protocol

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

function downloadJson(value: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([`${stableJson(value)}\n`], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function makeTasks(): Promise<Task[]> {
  const primary: Task[] = []
  for (const sourceCase of source.cases) {
    for (const pair of sourceCase.pairs) {
      const originalLeft = sourceCase.pool[pair.leftIndex].name
      const originalRight = sourceCase.pool[pair.rightIndex].name
      const swap = (fnv1a64(pair.id) & 1n) === 1n
      primary.push({
        id: `primary:${pair.id}`,
        pairId: pair.id,
        briefId: sourceCase.briefId,
        brief: sourceCase.brief,
        partition: sourceCase.partition,
        leftName: swap ? originalRight : originalLeft,
        rightName: swap ? originalLeft : originalRight,
      })
    }
  }
  if (primary.length !== protocol.primaryCount) throw new Error('primary task count mismatch')
  const withHashes = await Promise.all(primary.map(async (task) => ({ task, hash: await sha256(task.pairId) })))
  withHashes.sort((left, right) => left.hash.localeCompare(right.hash) || left.task.pairId.localeCompare(right.task.pairId))
  const repeats = withHashes.slice(0, protocol.repeatCount).map(({ task }) => ({
    ...task,
    id: `repeat:${task.pairId}`,
    leftName: task.rightName,
    rightName: task.leftName,
    repeatOf: task.id,
  }))
  const combined = [...primary, ...repeats]
  const ordered = await Promise.all(combined.map(async (task) => ({ task, hash: await sha256(task.id) })))
  ordered.sort((left, right) => left.hash.localeCompare(right.hash) || left.task.id.localeCompare(right.task.id))
  return ordered.map(({ task }) => task)
}

const sourcePayloadSha256 = await sha256(stableJson(source))
const collectorProtocolSha256 = await sha256(stableJson(protocol))
if (sourcePayloadSha256 !== protocol.sourcePayloadSha256) throw new Error('source hash mismatch')
const tasks = await makeTasks()

const choicePanel = element<HTMLElement>('choice-panel')
const completePanel = element<HTMLElement>('complete-panel')
const brief = element<HTMLElement>('brief')
const leftName = element<HTMLElement>('left-name')
const rightName = element<HTMLElement>('right-name')
const progress = element<HTMLProgressElement>('progress')
const progressText = element<HTMLElement>('progress-text')
const status = element<HTMLElement>('status')
const completeSummary = element<HTMLElement>('complete-summary')

let decisions: Decision[] = []
try {
  const saved = JSON.parse(localStorage.getItem(protocol.resumeStorageKey) ?? 'null') as SavedState | null
  if (saved?.sourceSha256 === sourcePayloadSha256 && saved.collectorProtocolSha256 === collectorProtocolSha256) {
    const expected = tasks.slice(0, saved.decisions.length).map((task) => task.id)
    if (saved.decisions.every((decision, index) => decision.taskId === expected[index])) decisions = saved.decisions
  }
} catch {
  localStorage.removeItem(protocol.resumeStorageKey)
}

function persist(): void {
  const state: SavedState = { sourceSha256: sourcePayloadSha256, collectorProtocolSha256, decisions }
  localStorage.setItem(protocol.resumeStorageKey, stableJson(state))
}

function normalizedChoice(task: Task, choice: Choice): string {
  if (choice === 'neither') return 'neither'
  return choice === 'left' ? task.leftName.toLowerCase() : task.rightName.toLowerCase()
}

function finish(): void {
  choicePanel.hidden = true
  completePanel.hidden = false
  progress.value = tasks.length
  progressText.textContent = `${tasks.length} of ${tasks.length}`
  const byTask = new Map(decisions.map((decision) => [decision.taskId, decision]))
  let consistent = 0
  const decisive: Record<Partition, number> = { train: 0, validation: 0, test: 0 }
  for (const task of tasks) {
    const decision = byTask.get(task.id)
    if (!decision) continue
    if (!task.repeatOf && decision.choice !== 'neither') decisive[task.partition]++
    if (task.repeatOf) {
      const originalTask = tasks.find((candidate) => candidate.id === task.repeatOf)
      const originalDecision = byTask.get(task.repeatOf)
      if (originalTask && originalDecision && normalizedChoice(task, decision.choice) === normalizedChoice(originalTask, originalDecision.choice)) consistent++
    }
  }
  const consistencyPassed = consistent >= protocol.consistencyGate
  const decisivePassed = (Object.keys(decisive) as Partition[]).every((partition) => decisive[partition] >= protocol.minimumDecisive[partition])
  completeSummary.textContent = `Repeat consistency ${consistent}/${protocol.repeatCount}. Decisive train/validation/test: ${decisive.train}/${decisive.validation}/${decisive.test}. ${consistencyPassed && decisivePassed ? 'Collection gates passed.' : 'Collection gates did not pass; no model may be fit.'}`
  element<HTMLButtonElement>('download').onclick = () => downloadJson({
    schema: 'neologism-prospective-preference-collection-v1',
    sourcePayloadSha256,
    collectorProtocolSha256,
    decisions,
    audit: { consistentRepeats: consistent, decisive, consistencyPassed, decisivePassed },
  }, 'preference-learning-collection.json')
}

function render(): void {
  status.textContent = ''
  if (decisions.length === tasks.length) {
    finish()
    return
  }
  const task = tasks[decisions.length]
  completePanel.hidden = true
  choicePanel.hidden = false
  progress.value = decisions.length
  progressText.textContent = `${decisions.length + 1} of ${tasks.length}`
  brief.textContent = task.brief
  leftName.textContent = task.leftName
  rightName.textContent = task.rightName
}

function decide(choice: Choice): void {
  const task = tasks[decisions.length]
  if (!task) return
  decisions = [...decisions, { taskId: task.id, choice, decidedAt: new Date().toISOString() }]
  persist()
  render()
}

element<HTMLButtonElement>('left').addEventListener('click', () => decide('left'))
element<HTMLButtonElement>('right').addEventListener('click', () => decide('right'))
element<HTMLButtonElement>('neither').addEventListener('click', () => decide('neither'))

progress.max = tasks.length
render()
