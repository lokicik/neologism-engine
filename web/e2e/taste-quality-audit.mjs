// Fixed-seed production audit for personalized local shortlists.
// Run from web/: node e2e/taste-quality-audit.mjs [--verbose]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4184
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const VERBOSE = process.argv.includes('--verbose')
const CASES = [
  {
    prompt: 'an offline naming engine for developer projects that checks npm and crates.io',
    markers: ['scope', 'key', 'tag', 'alias', 'slug'],
  },
  {
    prompt: 'a Rust CLI that processes logs',
    markers: ['trace', 'watch', 'scope', 'pulse', 'beacon'],
  },
  {
    prompt: 'a secure password manager for teams',
    markers: ['vault', 'guard', 'shield', 'lock', 'cipher'],
  },
  {
    prompt: 'a tool that syncs design tokens',
    markers: ['hue', 'form', 'pixel', 'canvas', 'prism'],
  },
  {
    prompt: 'a local database inspector',
    markers: ['schema', 'query', 'table', 'store', 'base', 'data', 'record', 'row', 'field', 'index'],
  },
]
const REFERENCE_SETS = [
  'Vercel, Linear, Notion',
  'Stripe, Figma, Sentry',
  'Docker, GitHub, Cloudflare',
  'Supabase, Vite, Prisma',
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
  await page.goto(APP_URL)
  const rows = await page.evaluate(async ({ cases, referenceSets, seeds }) => {
    const { generateBatch } = await import('/src/lib/engine.ts')
    const {
      buildReferencedProfile,
      preferencePoolCount,
      shortlistByPreference,
      similarity,
    } = await import('/src/lib/preferences.ts')
    const quality = (item) => (
      0.4 * item.score_pronounce
      + 0.3 * item.score_memorability
      + 0.3 * item.score_novelty
    ) / 100
    const output = []
    for (const references of referenceSets) {
      const profile = buildReferencedProfile([], [], references).profile
      if (!profile) throw new Error(`reference profile missing: ${references}`)
      for (const testCase of cases) {
        for (const seed of seeds) {
          const requested = 10
          const poolRequested = preferencePoolCount(requested, profile)
          const pool = await generateBatch({
            style: 'big_tech',
            count: poolRequested,
            min_len: 4,
            max_len: 12,
            temperature: 0.85,
            variety: 0.3,
            roots: [],
            variant: 'auto',
            description: testCase.prompt,
            exclude: [],
            seed,
          })
          const selected = shortlistByPreference(pool, profile, requested)
          output.push({
            references,
            prompt: testCase.prompt,
            seed,
            poolRequested,
            poolReturned: pool.length,
            engineFirstPage: pool.slice(0, requested).map((item) => item.name),
            selected: selected.map((item) => ({
              name: item.name,
              mode: item.sourceMode,
              quality: quality(item),
              taste: similarity(item, profile),
            })),
          })
        }
      }
    }
    return output
  }, { cases: CASES, referenceSets: REFERENCE_SETS, seeds: SEEDS })

  const editDistance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
        const old = row[j]
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          previous + Number(a[i - 1] !== b[j - 1]),
        )
        previous = old
      }
    }
    return row[b.length]
  }
  const lexicalSimilarity = (a, b) => {
    const left = a.toLowerCase().replace(/[^a-z]/g, '')
    const right = b.toLowerCase().replace(/[^a-z]/g, '')
    const length = Math.max(left.length, right.length)
    return length === 0 ? 0 : 1 - editDistance(left, right) / length
  }

  const names = rows.flatMap((row) => row.selected)
  let nearPairs = 0
  let pairSimilarity = 0
  let pairCount = 0
  let prefixOverTwo = 0
  for (const row of rows) {
    const prefixes = new Map()
    for (const item of row.selected) {
      const prefix = item.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 3)
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
    }
    prefixOverTwo += [...prefixes.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 2), 0)
    for (let i = 0; i < row.selected.length; i++) {
      for (let j = i + 1; j < row.selected.length; j++) {
        const overlap = lexicalSimilarity(row.selected[i].name, row.selected[j].name)
        pairSimilarity += overlap
        pairCount++
        nearPairs += Number(overlap >= 0.72)
      }
    }
    if (VERBOSE) {
      console.log(`\n${row.seed}  ${row.references}  |  ${row.prompt}`)
      console.log(row.selected.map((item) => (
        `${item.mode}:${item.name}(${Math.round(item.quality * 100)})`
      )).join('  '))
    }
  }

  const average = (field) => names.reduce((sum, item) => sum + item[field], 0) / names.length
  const averageQuality = average('quality') * 100
  const averageTaste = average('taste')
  const meanPairSimilarity = pairSimilarity / pairCount
  const below75 = names.filter((item) => item.quality < 0.75).length
  const wrongSize = rows.filter((row) => (
    row.poolRequested !== 60
    || row.poolReturned <= 10
    || row.poolReturned > 60
    || row.selected.length !== 10
  )).length
  const returnedCounts = [...new Set(rows.map((row) => row.poolReturned))].sort((a, b) => a - b)

  console.log(`personalized pages: ${rows.length}`)
  console.log(`selected names: ${names.length}`)
  console.log(`average engine quality: ${averageQuality.toFixed(2)}`)
  console.log(`average taste affinity: ${averageTaste.toFixed(3)}`)
  console.log(`sub-75 names: ${below75}`)
  console.log(`three-plus prefix overflow: ${prefixOverTwo}`)
  console.log(`near-duplicate pairs: ${nearPairs}`)
  console.log(`mean pair similarity: ${meanPairSimilarity.toFixed(3)}`)
  console.log(`returned pool sizes: ${returnedCounts.join(', ')}`)
  const poolsByPrompt = new Map()
  for (const row of rows) {
    if (!poolsByPrompt.has(row.prompt)) poolsByPrompt.set(row.prompt, new Set())
    poolsByPrompt.get(row.prompt).add(row.poolReturned)
  }
  for (const [prompt, sizes] of poolsByPrompt) {
    console.log(`  ${[...sizes].sort((a, b) => a - b).join('/')}  ${prompt}`)
  }
  let semanticRetentionFailures = 0
  for (const testCase of CASES) {
    const caseRows = rows.filter((row) => row.prompt === testCase.prompt)
    const engineMapped = caseRows.flatMap((row) => row.engineFirstPage).filter((name) => {
      const normalized = name.toLowerCase().replace(/[^a-z]/g, '')
      return testCase.markers.some((marker) => normalized.includes(marker))
    }).length
    const mapped = caseRows.flatMap((row) => row.selected).filter((item) => {
      const normalized = item.name.toLowerCase().replace(/[^a-z]/g, '')
      return testCase.markers.some((marker) => normalized.includes(marker))
    }).length
    const total = caseRows.length * 10
    semanticRetentionFailures += Number(mapped * 10 < engineMapped * 7)
    console.log(
      `  semantic engine ${engineMapped}/${total} -> taste ${mapped}/${total} (${(mapped / total * 100).toFixed(1)}%)  ${testCase.prompt}`,
    )
  }

  const gates = [
    [wrongSize === 0, 'every page selects 10 names after requesting an expanded pool of up to 60'],
    [below75 === 0, 'no selected name falls below the structural quality floor'],
    [prefixOverTwo === 0, 'no visible page contains more than two names per prefix family'],
    [averageQuality >= 85.2, 'average structural quality stays at or above 85.2'],
    [averageTaste >= -0.82, 'reference affinity stays within the retained floor'],
    [nearPairs <= 260, 'near-duplicate pairs stay at or below 260'],
    [meanPairSimilarity <= 0.24, 'mean pair similarity stays at or below 0.24'],
    [
      semanticRetentionFailures === 0,
      'taste keeps at least 70% of the engine first page\'s specialized meaning',
    ],
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
  console.error(`${failures} personalized quality gate(s) failed`)
  process.exitCode = 1
} else {
  console.log('personalized taste quality audit: all gates passed')
}
