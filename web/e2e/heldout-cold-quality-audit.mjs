// Production-path cold Auto audit on prompts and seeds kept outside the fixed
// calibration matrix. Use this to discover general quality gaps without tuning
// another rule against the same 90 pages.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4200
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const BASE_PROMPTS = [
  'candidate tracking software for recruiters',
  'a weekly menu and grocery organizer',
  'a catalog for household belongings',
  'property discovery for home buyers',
  'conference booking and attendee check-in',
  'local rain and temperature alerts',
  'routine and streak coaching',
  'a customer relationship pipeline for sales representatives',
  'a mindfulness timer for sleep and breath',
  'a veterinary appointment and pet wellness tracker',
  'a personal budget and expense tracker',
  'a private mood journal',
  'a community chat app',
  'a color palette and visual design tool',
  'a task and calendar planner',
  'an online course and study app',
  'a delivery tracking and logistics app',
  'an AI assistant for workflow automation',
  'a fast performance monitor',
  'a naming tool for new products',
  'a CLI for database migrations',
  'an API rate limiting library',
  'a terminal log viewer',
  'a browser bookmark manager',
  'an API testing toolkit',
  'a cloud deployment dashboard',
  'a message queue client',
  'a code formatter and linter',
  'an environment variable manager',
  'a filesystem search CLI',
  'a feature flag service',
  'a background job scheduler',
  'dependency update automation',
  'a documentation site generator',
  'legal research for court cases',
]
const AI_VARIANTS = [
  'workflow automation assistant powered by AI',
  'automated workflows with an AI assistant',
  'an AI automation agent',
  'an autonomous agent workflow builder',
]
const PROMPTS = [...BASE_PROMPTS, ...AI_VARIANTS]
const SEEDS = [13, 67, 313]
const DIRECT_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']

const server = spawn(process.execPath, [viteCli, '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
let serverError = ''
server.stderr.on('data', (data) => {
  serverError += data.toString()
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite dev server did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error(serverError || 'vite dev server exited early')))
})

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { generateBatch, generateColdLeadRetry, generateNames } = await import('/src/lib/engine.ts')
    const {
      coldQualityPoolCount,
      fillColdLeadRetry,
      needsColdLeadRetry,
      needsQualityRepair,
      prioritizeColdStrongLead,
      repairWeakShortlist,
    } = await import('/src/lib/preferences.ts')
    const output = []
    for (const prompt of prompts) {
      for (const seed of seeds) {
        const config = {
          style: 'big_tech', count: 10, min_len: 4, max_len: 12,
          temperature: 0.85, variety: 0.3, roots: [], variant: 'auto',
          description: prompt, exclude: [], seed,
        }
        const direct = await generateBatch(config)
        const fallback = needsQualityRepair(direct, 10)
          ? await generateNames({
              ...config,
              variant: undefined,
              compound: false,
              count: coldQualityPoolCount(10),
              exclude: direct.map((item) => item.name),
            })
          : []
        const repaired = repairWeakShortlist(direct, fallback, 10)
        const ordered = prioritizeColdStrongLead(repaired)
        const retryRequested = needsColdLeadRetry(ordered)
        const retry = retryRequested ? await generateColdLeadRetry(config) : []
        const selected = fillColdLeadRetry(ordered, retry, [...direct, ...fallback])
        output.push({ prompt, seed, direct, ordered, retry, retryRequested, selected, fallbackCount: fallback.length })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  const quality = (item) => (
    item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
  )
  const letters = (value) => value.toLowerCase().replace(/[^a-z]/g, '')
  const editDistance = (left, right) => {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index)
    for (let i = 1; i <= left.length; i++) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= right.length; j++) {
        const old = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(left[i - 1] !== right[j - 1]))
        previous = old
      }
    }
    return row[right.length]
  }
  const similarity = (left, right) => {
    const a = letters(left)
    const b = letters(right)
    return 1 - editDistance(a, b) / Math.max(a.length, b.length)
  }
  const isDirectSuffix = (item) => (
    item.sourceMode === 'brandable'
    && item.concept_coverage === 1
    && DIRECT_SUFFIXES.some((ending) => letters(item.name).endsWith(ending))
  )
  const basePrompts = new Set(BASE_PROMPTS)
  const auditRows = rows.filter((row) => basePrompts.has(row.prompt))
  const all = auditRows.flatMap((row) => row.selected)
  const allVisible = rows.flatMap((row) => row.selected)
  let pairSimilarity = 0
  let pairCount = 0
  let nearPairs = 0
  for (const row of auditRows) {
    for (let i = 0; i < row.selected.length; i++) {
      for (let j = i + 1; j < row.selected.length; j++) {
        const overlap = similarity(row.selected[i].name, row.selected[j].name)
        pairSimilarity += overlap
        pairCount++
        nearPairs += Number(overlap >= 0.72)
      }
    }
  }
  const averageQuality = all.reduce((sum, item) => sum + quality(item), 0) / all.length
  const leadQuality = auditRows.reduce(
    (sum, row) => sum + (row.selected[0] ? quality(row.selected[0]) : 0), 0,
  ) / auditRows.length
  const leadCoverage = auditRows.reduce(
    (sum, row) => sum + (row.selected[0]?.concept_coverage ?? 0), 0,
  ) / auditRows.length
  const suffixLeads = auditRows.filter((row) => row.selected[0] && isDirectSuffix(row.selected[0]))
  const guidedLeads = auditRows.filter((row) => Boolean(row.selected[0]?.construction))
  const aiWorkflowRows = rows.filter((row) => (
    /\bai\b/i.test(row.prompt) || /\bagent\b/i.test(row.prompt)
  ) && /\b(?:automation|workflow)s?\b/i.test(row.prompt))
  const weak = allVisible.filter((item) => quality(item) < 75)
  const wrongSize = rows.filter((row) => row.selected.length !== 10)
  const wrongFallback = rows.filter((row) => row.fallbackCount < 0 || row.fallbackCount > 30)
  const multipleAccents = rows.filter((row) => (
    row.selected.filter((item) => item.sourceMode !== 'brandable').length > 1
  ))
  const worst = rows
    .map((row) => ({
      ...row,
      average: row.selected.length === 0
        ? 0
        : row.selected.reduce((sum, item) => sum + quality(item), 0) / row.selected.length,
    }))
    .sort((left, right) => left.average - right.average)
    .slice(0, 12)

  console.log(`held-out cold pages: ${auditRows.length} + ${rows.length - auditRows.length} AI wording variants`)
  console.log(`average quality: ${averageQuality.toFixed(2)} · lead ${leadQuality.toFixed(2)} · coverage ${leadCoverage.toFixed(2)}`)
  console.log(`sub-75: ${weak.length} · near pairs ${nearPairs} · similarity ${(pairSimilarity / pairCount).toFixed(3)}`)
  console.log(`suffix leads: ${suffixLeads.length} · guided leads: ${guidedLeads.length}`)
  console.log(`fallback counts: ${[...new Set(rows.map((row) => row.fallbackCount))].sort((a, b) => a - b).join(', ')}`)
  console.log('\nAI workflow focus')
  for (const row of aiWorkflowRows) {
    const selectedNames = new Set(row.selected.map((item) => letters(item.name)))
    const orderedNames = new Set(row.ordered.map((item) => letters(item.name)))
    const removed = row.ordered.filter((item) => !selectedNames.has(letters(item.name)))
    const added = row.selected.filter((item) => !orderedNames.has(letters(item.name)))
    console.log(
      `${row.seed} · ${row.ordered[0]?.name ?? 'empty'} -> ${row.selected[0]?.name ?? 'empty'}`
      + ` · ${removed.map((item) => item.name).join('/') || 'same set'}`
      + ` -> ${added.map((item) => item.name).join('/') || 'same set'}`,
    )
  }
  console.log('\nremaining suffix leads')
  for (const row of suffixLeads) {
    const respells = row.ordered.filter((item) => item.sourceMode === 'respell')
    const guided = row.ordered.filter((item) => Boolean(item.construction))
    const blocker = respells.length > 0
      ? `respell ${respells.map((item) => item.name).join('/')}`
      : guided.length >= 2
        ? `guided capacity ${guided.map((item) => item.name).join('/')}`
        : row.retryRequested
          ? `no winning retry (${row.retry.slice(0, 4).map((item) => item.name).join('/') || 'empty'})`
          : 'not retry-eligible'
    console.log(`${row.seed} · ${row.prompt}: ${row.selected[0].name} · ${blocker}`)
  }
  console.log('\nlowest-average pages')
  for (const row of worst) {
    console.log(`${row.average.toFixed(2)} · ${row.seed} · ${row.prompt}: ${row.selected.map((item) => item.name).join(', ')}`)
  }

  const gates = [
    [wrongSize.length === 0, 'every held-out page contains ten names'],
    [wrongFallback.length === 0, 'held-out repair uses only the bounded fallback'],
    [multipleAccents.length === 0, 'held-out pages preserve the one-accent contract'],
    [weak.length === 0, 'no held-out visible name falls below 75'],
    [averageQuality >= 83.9, 'held-out average structural quality stays at or above 83.9'],
    [leadQuality >= 85.8, 'held-out lead structural quality stays at or above 85.8'],
    [leadCoverage >= 1.17, 'held-out lead concept coverage stays at or above 1.17'],
    [nearPairs <= 82, 'held-out near-duplicate pairs stay at or below 82'],
    [pairSimilarity / pairCount <= 0.203, 'held-out mean pair similarity stays at or below 0.203'],
    [suffixLeads.length <= 24, 'held-out direct suffix leads stay at or below 24'],
    [
      aiWorkflowRows.length === SEEDS.length * 5
        && aiWorkflowRows.filter((row) => row.selected[0]?.name === 'CogLoop').length >= 10
        && aiWorkflowRows.every((row) => (
          row.selected.length === 10
          && (
            !isDirectSuffix(row.selected[0])
            || row.selected.some((item) => item.sourceMode === 'respell')
          )
        )),
      'AI workflow variants avoid an unqualified suffix-only first impression',
    ],
    [
      aiWorkflowRows
        .filter((row) => row.prompt === 'workflow automation assistant powered by AI')
        .every((row) => row.selected[0]?.name === 'CogLoop'),
      'recognized AI semantics cannot starve when context words come first',
    ],
  ]
  let failures = 0
  for (const [ok, label] of gates) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    failures += Number(!ok)
  }
  if (failures > 0) process.exitCode = 1
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}
