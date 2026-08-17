interface BlindCase {
  caseId: string
  brief: string
  left: string[]
  right: string[]
}

interface BlindStudy {
  schema: 'neologism-blind-page-study-v1'
  protocolSha256: string
  sourceSha256: string
  studySha256: string
  instructions: string
  cases: BlindCase[]
}

type Choice = 'left' | 'right'

const SHA256 = /^[0-9a-f]{64}$/
const CASE_ID = /^c(?:0[1-9]|[1-3][0-9]|4[0-2])$/
const NAME = /^[A-Za-z]{4,12}$/
const MAX_FILE_BYTES = 1_000_000

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing evaluator element #${id}`)
  return found as T
}

const studyInput = element<HTMLInputElement>('study-file')
const choicesInput = element<HTMLInputElement>('choices-file')
const workspace = element<HTMLElement>('workspace')
const errorBox = element<HTMLParagraphElement>('error')
const loadStatus = element<HTMLParagraphElement>('load-status')
const choiceStatus = element<HTMLParagraphElement>('choice-status')
const leftButton = element<HTMLButtonElement>('choose-left')
const rightButton = element<HTMLButtonElement>('choose-right')
const previousButton = element<HTMLButtonElement>('previous')
const nextButton = element<HTMLButtonElement>('next')
const nextUnansweredButton = element<HTMLButtonElement>('next-unanswered')
const exportButton = element<HTMLButtonElement>('export')
const resetButton = element<HTMLButtonElement>('reset')

let study: BlindStudy | null = null
let choices = new Map<string, Choice>()
let caseIndex = 0
let bundledStudy: BlindStudy | null = null

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} contains unexpected or missing fields.`)
  }
}

function validPage(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 10) throw new Error(`${label} must contain ten names.`)
  const names = value.map((name) => {
    if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`${label} contains an invalid name.`)
    return name
  })
  if (new Set(names.map((name) => name.toLowerCase())).size !== 10) throw new Error(`${label} contains duplicate names.`)
  return names
}

async function validateStudy(value: unknown): Promise<BlindStudy> {
  const raw = record(value, 'Blind study')
  exactKeys(raw, ['schema', 'protocolSha256', 'sourceSha256', 'studySha256', 'instructions', 'cases'], 'Blind study')
  if (raw.schema !== 'neologism-blind-page-study-v1') throw new Error('Unsupported blind study schema.')
  if (!SHA256.test(String(raw.protocolSha256)) || !SHA256.test(String(raw.sourceSha256)) || !SHA256.test(String(raw.studySha256))) {
    throw new Error('Blind study hashes must be lowercase SHA-256 values.')
  }
  if (typeof raw.instructions !== 'string' || raw.instructions.length < 20 || raw.instructions.length > 500) {
    throw new Error('Blind study instructions are invalid.')
  }
  if (!Array.isArray(raw.cases) || raw.cases.length !== 42) throw new Error('Blind study must contain exactly 42 cases.')
  const ids = new Set<string>()
  const cases = raw.cases.map((valueCase, index): BlindCase => {
    const item = record(valueCase, `Case ${index + 1}`)
    exactKeys(item, ['caseId', 'brief', 'left', 'right'], `Case ${index + 1}`)
    if (typeof item.caseId !== 'string' || !CASE_ID.test(item.caseId) || ids.has(item.caseId)) {
      throw new Error(`Case ${index + 1} has an invalid or duplicate id.`)
    }
    if (typeof item.brief !== 'string' || item.brief.length < 10 || item.brief.length > 240
      || item.brief !== item.brief.trim() || /[\u0000-\u001f\u007f]/.test(item.brief)) {
      throw new Error(`${item.caseId} has an invalid brief.`)
    }
    ids.add(item.caseId)
    return { caseId: item.caseId, brief: item.brief, left: validPage(item.left, `${item.caseId}.left`), right: validPage(item.right, `${item.caseId}.right`) }
  })
  const base = { ...raw }
  delete base.studySha256
  if (await sha256Text(stableJson(base)) !== raw.studySha256) throw new Error('Blind study content hash is invalid.')
  return { ...raw, cases } as BlindStudy
}

function validateChoices(value: unknown, loaded: BlindStudy): Map<string, Choice> {
  const raw = record(value, 'Blind choices')
  exactKeys(raw, ['schema', 'studySha256', 'answers'], 'Blind choices')
  if (raw.schema !== 'neologism-blind-page-choices-v1') throw new Error('Unsupported blind choices schema.')
  if (raw.studySha256 !== loaded.studySha256) throw new Error('Blind choices target a different study.')
  if (!Array.isArray(raw.answers) || raw.answers.length > loaded.cases.length) throw new Error('Blind choices answers are invalid.')
  const studyIds = new Set(loaded.cases.map((item) => item.caseId))
  const imported = new Map<string, Choice>()
  raw.answers.forEach((valueAnswer, index) => {
    const answer = record(valueAnswer, `Choice ${index + 1}`)
    exactKeys(answer, ['caseId', 'choice'], `Choice ${index + 1}`)
    if (typeof answer.caseId !== 'string' || !studyIds.has(answer.caseId) || imported.has(answer.caseId)) {
      throw new Error(`Choice ${index + 1} has an invalid or duplicate case id.`)
    }
    if (answer.choice !== 'left' && answer.choice !== 'right') throw new Error(`Choice ${index + 1} has an invalid side.`)
    imported.set(answer.caseId, answer.choice)
  })
  return imported
}

async function readJson(file: File): Promise<unknown> {
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new Error('JSON file must be between 1 byte and 1 MB.')
  try { return JSON.parse(await file.text()) as unknown } catch { throw new Error('Selected file is not valid JSON.') }
}

function showError(message: string): void {
  errorBox.textContent = message
  errorBox.hidden = false
}

function clearError(): void {
  errorBox.textContent = ''
  errorBox.hidden = true
}

function renderNames(id: string, names: string[]): void {
  const list = element<HTMLOListElement>(id)
  list.replaceChildren(...names.map((name) => {
    const item = document.createElement('li')
    item.textContent = name
    return item
  }))
}

function render(focusBrief = false): void {
  workspace.hidden = study === null
  resetButton.disabled = study === null
  choicesInput.disabled = study === null
  element<HTMLElement>('choices-label').setAttribute('aria-disabled', String(study === null))
  exportButton.disabled = choices.size === 0
  if (!study) return
  const active = study.cases[caseIndex]
  const selected = choices.get(active.caseId)
  element<HTMLElement>('case-progress').textContent = `Case ${caseIndex + 1} of ${study.cases.length}`
  element<HTMLElement>('answer-progress').textContent = `${choices.size} of ${study.cases.length} answered`
  element<HTMLElement>('case-id').textContent = active.caseId
  element<HTMLElement>('brief-heading').textContent = active.brief
  renderNames('left-names', active.left)
  renderNames('right-names', active.right)
  leftButton.setAttribute('aria-pressed', String(selected === 'left'))
  rightButton.setAttribute('aria-pressed', String(selected === 'right'))
  choiceStatus.textContent = selected ? `${selected === 'left' ? 'Left' : 'Right'} page selected for ${active.caseId}.` : `No choice for ${active.caseId}.`
  previousButton.disabled = caseIndex === 0
  nextButton.disabled = caseIndex === study.cases.length - 1
  nextUnansweredButton.disabled = choices.size === study.cases.length
  exportButton.textContent = choices.size === study.cases.length ? 'Export complete choices' : 'Export partial choices'
  if (focusBrief) element<HTMLElement>('brief-heading').focus()
}

function choose(side: Choice): void {
  if (!study) return
  choices.set(study.cases[caseIndex].caseId, side)
  render()
}

function move(nextIndex: number): void {
  if (!study || nextIndex < 0 || nextIndex >= study.cases.length) return
  caseIndex = nextIndex
  render(true)
}

function nextUnanswered(): void {
  if (!study) return
  for (let offset = 1; offset <= study.cases.length; offset++) {
    const candidate = (caseIndex + offset) % study.cases.length
    if (!choices.has(study.cases[candidate].caseId)) { move(candidate); return }
  }
}

function exportChoices(): void {
  if (!study || choices.size === 0) return
  const payload = {
    schema: 'neologism-blind-page-choices-v1',
    studySha256: study.studySha256,
    answers: study.cases.filter((item) => choices.has(item.caseId)).map((item) => ({ caseId: item.caseId, choice: choices.get(item.caseId)! })),
  }
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = choices.size === study.cases.length ? 'blind-choices.json' : 'blind-choices.partial.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  loadStatus.textContent = `${choices.size} blind choice${choices.size === 1 ? '' : 's'} exported. No answer-key data was included.`
}

async function loadStudyFile(): Promise<void> {
  const file = studyInput.files?.[0]
  studyInput.value = ''
  if (!file) return
  clearError()
  try {
    const loaded = await validateStudy(await readJson(file))
    study = loaded
    choices = new Map()
    caseIndex = 0
    loadStatus.textContent = `Loaded ${loaded.cases.length} blinded cases. No answer key was read.`
    render(true)
  } catch (error) { showError(error instanceof Error ? error.message : String(error)) }
}

async function loadChoicesFile(): Promise<void> {
  const file = choicesInput.files?.[0]
  choicesInput.value = ''
  if (!file || !study) return
  clearError()
  try {
    choices = validateChoices(await readJson(file), study)
    const firstUnanswered = study.cases.findIndex((item) => !choices.has(item.caseId))
    caseIndex = firstUnanswered === -1 ? 0 : firstUnanswered
    loadStatus.textContent = `Resumed ${choices.size} blind choices for this exact study.`
    render(true)
  } catch (error) { showError(error instanceof Error ? error.message : String(error)) }
}

function reset(): void {
  if (!study || (choices.size > 0 && !window.confirm('Discard the loaded study and every in-memory choice?'))) return
  if (bundledStudy) {
    study = bundledStudy
    choices = new Map()
    caseIndex = 0
    clearError()
    loadStatus.textContent = `Reset ${bundledStudy.cases.length} bundled blind cases. No answer key was read.`
    render(true)
    return
  }
  study = null
  choices = new Map()
  caseIndex = 0
  clearError()
  loadStatus.textContent = 'No study loaded.'
  render()
  studyInput.focus()
}

studyInput.addEventListener('change', () => void loadStudyFile())
choicesInput.addEventListener('change', () => void loadChoicesFile())
leftButton.addEventListener('click', () => choose('left'))
rightButton.addEventListener('click', () => choose('right'))
previousButton.addEventListener('click', () => move(caseIndex - 1))
nextButton.addEventListener('click', () => move(caseIndex + 1))
nextUnansweredButton.addEventListener('click', nextUnanswered)
exportButton.addEventListener('click', exportChoices)
resetButton.addEventListener('click', reset)
window.addEventListener('beforeunload', (event) => { if (choices.size > 0) event.preventDefault() })

async function initialize(): Promise<void> {
  const embedded = document.getElementById('bundled-study')
  if (!embedded) { render(); return }
  try {
    const loaded = await validateStudy(JSON.parse(embedded.textContent ?? ''))
    bundledStudy = loaded
    study = loaded
    studyInput.disabled = true
    element<HTMLElement>('study-label').hidden = true
    loadStatus.textContent = `Loaded ${loaded.cases.length} bundled blind cases. No answer key was read.`
    render(true)
  } catch (error) {
    showError(`Bundled study rejected: ${error instanceof Error ? error.message : String(error)}`)
    render()
  }
}

void initialize()
