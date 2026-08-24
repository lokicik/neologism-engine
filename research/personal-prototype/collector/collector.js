const SOURCE_URL = '../human-study.json'
const STORAGE_PREFIX = 'neologism-phase305-absolute-v1:'

const elements = {
  ratingView: document.querySelector('#ratingView'),
  doneView: document.querySelector('#doneView'),
  brief: document.querySelector('#brief'),
  name: document.querySelector('#name'),
  progressText: document.querySelector('#progressText'),
  progressBar: document.querySelector('#progressBar'),
  back: document.querySelector('#back'),
  download: document.querySelector('#download'),
  review: document.querySelector('#review'),
  error: document.querySelector('#error'),
  choices: [...document.querySelectorAll('[data-choice]')],
}

let source
let sourceSha256
let decisions = new Map()
let index = 0

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256(text) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

function storageKey() {
  return `${STORAGE_PREFIX}${sourceSha256}`
}

function save() {
  localStorage.setItem(storageKey(), JSON.stringify({ decisions: [...decisions] }))
}

function load() {
  const raw = localStorage.getItem(storageKey())
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    decisions = new Map(parsed.decisions.filter(([taskId, choice]) =>
      source.tasks.some((task) => task.id === taskId) && source.choices.includes(choice)))
  } catch {
    localStorage.removeItem(storageKey())
  }
}

function firstUnanswered() {
  const found = source.tasks.findIndex((task) => !decisions.has(task.id))
  return found === -1 ? source.tasks.length : found
}

function render() {
  const complete = index >= source.tasks.length
  elements.ratingView.hidden = complete
  elements.doneView.hidden = !complete
  elements.progressText.textContent = complete ? '30 / 30' : `${index + 1} / ${source.tasks.length}`
  elements.progressBar.style.width = `${(decisions.size / source.tasks.length) * 100}%`
  if (complete) return

  const task = source.tasks[index]
  elements.brief.textContent = task.brief
  elements.name.textContent = task.name
  elements.back.disabled = index === 0
  for (const button of elements.choices) {
    button.classList.toggle('selected', decisions.get(task.id) === button.dataset.choice)
  }
}

function choose(choice) {
  if (index >= source.tasks.length || !source.choices.includes(choice)) return
  decisions.set(source.tasks[index].id, choice)
  save()
  index += 1
  if (index < source.tasks.length && decisions.has(source.tasks[index].id)) {
    index = firstUnanswered()
  }
  render()
}

function download() {
  if (decisions.size !== source.tasks.length) return
  const payload = {
    schema: 'neologism-personal-prototype-collection-v1',
    sourceSha256,
    collectedAt: new Date().toISOString(),
    decisions: source.tasks.map((task) => ({ taskId: task.id, choice: decisions.get(task.id) })),
  }
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'phase305-absolute-collection.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

for (const button of elements.choices) button.addEventListener('click', () => choose(button.dataset.choice))
elements.back.addEventListener('click', () => { if (index > 0) { index -= 1; render() } })
elements.review.addEventListener('click', () => { index = source.tasks.length - 1; render() })
elements.download.addEventListener('click', download)
window.addEventListener('keydown', (event) => {
  if (event.key === '1') choose('use')
  if (event.key === '2') choose('maybe')
  if (event.key === '3') choose('no')
  if (event.key === 'ArrowLeft' && index > 0) { index -= 1; render() }
})

try {
  const response = await fetch(SOURCE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Kaynak yüklenemedi (${response.status})`)
  const text = await response.text()
  sourceSha256 = await sha256(text)
  source = JSON.parse(text)
  if (source.schema !== 'neologism-personal-prototype-study-v1' || source.taskCount !== 30) {
    throw new Error('Beklenmeyen çalışma kaynağı')
  }
  load()
  index = firstUnanswered()
  render()
} catch (error) {
  elements.progressText.textContent = 'Açılamadı'
  elements.error.textContent = error instanceof Error ? error.message : String(error)
  elements.error.hidden = false
}
