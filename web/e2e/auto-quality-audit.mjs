// Inspect Auto's first-page accent modes across representative product briefs.
// Run from web/: node e2e/auto-quality-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4183
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPTS = [
  'a developer tool that generates names for packages CLIs libraries and projects',
  'a journaling app with mood insights',
  'a secure password manager for teams',
  'an app for splitting expenses with friends',
  'a marketplace for vintage keyboards',
  'a fast analytics dashboard for API performance',
]
const SEEDS = [7, 42, 101, 2024, 9999]
const VERBOSE = process.argv.includes('--verbose')
const LOSSY_SEAMS = new Set(['aurank', 'poolink', 'pooledger'])

const server = spawn(process.execPath, [viteCli, '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite dev server did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('vite dev server exited early')))
})

const browser = await chromium.launch()

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(a[i - 1] !== b[j - 1]))
      previous = old
    }
  }
  return row[b.length]
}

function isPromptLinked(item, keywords) {
  const name = item.name.toLowerCase().replace(/[^a-z]/g, '')
  if (item.sourceMode === 'realword') return false
  if (item.sourceMode === 'compound') return keywords.some((keyword) => name.includes(keyword))
  if (item.sourceMode === 'respell') return keywords.some((keyword) => editDistance(name, keyword) === 1)
  return true
}

let failures = 0
try {
  const page = await browser.newPage()
  await page.goto(APP_URL)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { extractKeywords, generateBatch } = await import('/src/lib/engine.ts')
    const output = []
    for (const prompt of prompts) {
      const keywords = await extractKeywords(prompt)
      for (const seed of seeds) {
        const results = await generateBatch({
          style: 'big_tech',
          count: 10,
          min_len: 4,
          max_len: 12,
          temperature: 0.85,
          variety: 0.3,
          roots: [],
          variant: 'auto',
          description: prompt,
          exclude: [],
          seed,
        })
        output.push({ prompt, seed, keywords, results })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  let accents = 0
  let linked = 0
  const byMode = {}
  for (const row of rows) {
    const samples = row.results.filter((item) => item.sourceMode !== 'brandable')
    const badAccents = samples.filter((item) => !isPromptLinked(item, row.keywords))
    const lossySeams = row.results.filter((item) => LOSSY_SEAMS.has(item.name.toLowerCase()))
    if (row.results.length !== 10 || samples.length > 1 || badAccents.length > 0 || lossySeams.length > 0) failures++
    if (VERBOSE) {
      console.log(`\n${row.seed}  ${row.prompt}`)
      console.log(`keywords: ${row.keywords.join(', ')}`)
      console.log(row.results.map((item) => {
        const score = Math.round(item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3)
        return `${item.sourceMode}:${item.name}(${score})`
      }).join('  '))
    }
    for (const item of samples) {
      accents++
      const hit = isPromptLinked(item, row.keywords)
      linked += Number(hit)
      const mode = item.sourceMode ?? 'unknown'
      byMode[mode] ??= { total: 0, linked: 0 }
      byMode[mode].total++
      byMode[mode].linked += Number(hit)
    }
  }

  console.log('\nAuto accent relevance')
  for (const [mode, stats] of Object.entries(byMode)) {
    console.log(`${mode}: ${stats.linked}/${stats.total} prompt-linked`)
  }
  console.log(`all accents: ${linked}/${accents} prompt-linked`)
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`${failures} Auto page(s) violated the quality gate`)
  process.exitCode = 1
} else {
  console.log('PASS  all 30 Auto pages contain ten names, no lossy seams, and at most one prompt-linked accent')
}
