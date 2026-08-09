// Fixed-seed production audit for cold Auto's structural quality repair.
// Run from web/: node e2e/cold-quality-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4187
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPTS = [
  'an offline naming engine for developer projects that checks npm and crates.io',
  'a developer tool that generates names for packages CLIs libraries and projects',
  'a journaling app with mood insights',
  'a secure password manager for teams',
  'an app for splitting expenses with friends',
  'a marketplace for vintage keyboards',
  'a fast analytics dashboard for API performance',
  'a local cache inspector',
  'a guided breathing and rest companion',
  'a simple workout planner',
  'a collaborative document editor',
  'automatic invoice reminders',
  'a ticket inbox for customer service agents',
  'animal health reminders for pet owners',
  'an online marketplace for local sellers',
  'a photo and video editing app',
  'a trip planning and route app',
  'git release automation',
]
const SEEDS = [7, 42, 101, 2024, 9999]

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
let failures = 0
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { generateBatch } = await import('/src/lib/engine.ts')
    const {
      coldQualityPoolCount,
      needsQualityRepair,
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
        const repair = needsQualityRepair(direct, 10)
        const fallback = repair
          ? await generateBatch({
              ...config,
              count: coldQualityPoolCount(10),
              exclude: direct.map((item) => item.name),
            })
          : []
        output.push({
          prompt,
          seed,
          direct,
          selected: repairWeakShortlist(direct, fallback, 10),
          fallbackCount: fallback.length,
        })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  const quality = (item) => (
    0.4 * item.score_pronounce + 0.3 * item.score_memorability + 0.3 * item.score_novelty
  ) / 100
  const editDistance = (a, b) => {
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
  const lexicalSimilarity = (a, b) => {
    const left = a.toLowerCase().replace(/[^a-z]/g, '')
    const right = b.toLowerCase().replace(/[^a-z]/g, '')
    return 1 - editDistance(left, right) / Math.max(left.length, right.length)
  }
  const summarize = (field) => {
    const names = rows.flatMap((row) => row[field])
    let nearPairs = 0
    let pairSimilarity = 0
    let pairCount = 0
    for (const row of rows) {
      const items = row[field]
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const overlap = lexicalSimilarity(items[i].name, items[j].name)
          nearPairs += Number(overlap >= 0.72)
          pairSimilarity += overlap
          pairCount++
        }
      }
    }
    return {
      names: names.length,
      averageQuality: names.reduce((sum, item) => sum + quality(item), 0) / names.length * 100,
      below75: names.filter((item) => quality(item) < 0.75).length,
      nearPairs,
      meanPairSimilarity: pairSimilarity / pairCount,
    }
  }

  const direct = summarize('direct')
  const repaired = summarize('selected')
  const repairedPages = rows.filter((row) => row.fallbackCount > 0).length
  const wrongSize = rows.filter((row) => row.selected.length !== 10).length
  const wrongFallback = rows.filter((row) => ![0, 30].includes(row.fallbackCount)).length
  const ownBrief = rows.find((row) => row.prompt.startsWith('an offline naming engine') && row.seed === 42)

  console.log(`cold Auto pages: ${rows.length}`)
  console.log(`repaired pages: ${repairedPages}/${rows.length}`)
  console.log(`direct average quality: ${direct.averageQuality.toFixed(2)}`)
  console.log(`repaired average quality: ${repaired.averageQuality.toFixed(2)}`)
  console.log(`direct / repaired sub-75: ${direct.below75} / ${repaired.below75}`)
  console.log(`repaired near-duplicate pairs: ${repaired.nearPairs}`)
  console.log(`repaired mean pair similarity: ${repaired.meanPairSimilarity.toFixed(3)}`)
  console.log(`own brief: ${ownBrief.selected.map((item) => item.name).join(', ')}`)

  const gates = [
    [wrongSize === 0, 'every repaired cold page contains ten names'],
    [wrongFallback === 0, 'repair uses either no fallback or the bounded 30-name pool'],
    [direct.below75 === 0 || repairedPages > 0, 'weak pages activate the offline repair pool'],
    [repaired.below75 === 0, 'no repaired cold Auto name falls below 75 structural quality'],
    [repaired.averageQuality >= 82.5, 'repaired cold Auto quality stays at or above 82.5'],
    [repaired.nearPairs <= 60, 'repaired cold Auto near-duplicate pairs stay at or below 60'],
    [repaired.meanPairSimilarity <= 0.21, 'repaired cold Auto mean pair similarity stays at or below 0.21'],
  ]
  for (const [ok, label] of gates) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    failures += Number(!ok)
  }
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`${failures} cold quality gate(s) failed`)
  process.exitCode = 1
} else {
  console.log('cold Auto quality audit: all gates passed')
}
