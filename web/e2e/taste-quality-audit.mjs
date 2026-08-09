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
const KNOWN_SUFFIXES = ['ify', 'ora', 'ium', 'ion', 'io', 'ia', 'ix', 'ly', 'ai']
const DIRECT_CONCEPT_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']

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
          const baseline = shortlistByPreference(pool, profile, requested)
          const selected = shortlistByPreference(pool, profile, requested, seed)
          output.push({
            references,
            prompt: testCase.prompt,
            seed,
            poolRequested,
            poolReturned: pool.length,
            engineFirstPage: pool.slice(0, requested).map((item) => ({
              name: item.name,
              quality: quality(item),
              taste: similarity(item, profile),
            })),
            baseline: baseline.map((item) => item.name),
            selected: selected.map((item) => ({
              name: item.name,
              mode: item.sourceMode,
              quality: quality(item),
              taste: similarity(item, profile),
              conceptCoverage: item.concept_coverage ?? 0,
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
  const engineNames = rows.flatMap((row) => row.engineFirstPage)
  let nearPairs = 0
  let pairSimilarity = 0
  let pairCount = 0
  let prefixOverTwo = 0
  let endingOverTwo = 0
  let endingOverThree = 0
  let maxEndingCount = 0
  let directSuffixForms = 0
  let suffixHeavyPages = 0
  let suffixOnlyPages = 0
  let maxDirectSuffixes = 0
  const isDirectSuffix = (item) => {
    const normalized = item.name.toLowerCase().replace(/[^a-z]/g, '')
    return item.mode === 'brandable'
      && item.conceptCoverage === 1
      && DIRECT_CONCEPT_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  }
  for (const row of rows) {
    const prefixes = new Map()
    const endings = new Map()
    for (const item of row.selected) {
      const normalized = item.name.toLowerCase().replace(/[^a-z]/g, '')
      const prefix = normalized.slice(0, 3)
      const ending = KNOWN_SUFFIXES.find((suffix) => normalized.endsWith(suffix))
        ?? normalized.slice(-2)
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
      endings.set(ending, (endings.get(ending) ?? 0) + 1)
    }
    prefixOverTwo += [...prefixes.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 2), 0)
    endingOverTwo += [...endings.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 2), 0)
    endingOverThree += [...endings.values()]
      .reduce((sum, count) => sum + Math.max(0, count - 3), 0)
    maxEndingCount = Math.max(maxEndingCount, ...endings.values())
    const pageDirectSuffixes = row.selected.filter(isDirectSuffix).length
    directSuffixForms += pageDirectSuffixes
    suffixHeavyPages += Number(pageDirectSuffixes >= 8)
    suffixOnlyPages += Number(pageDirectSuffixes === row.selected.length)
    maxDirectSuffixes = Math.max(maxDirectSuffixes, pageDirectSuffixes)
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
  const engineAverage = (field) => (
    engineNames.reduce((sum, item) => sum + item[field], 0) / engineNames.length
  )
  const averageQuality = average('quality') * 100
  const averageTaste = average('taste')
  const engineQuality = engineAverage('quality') * 100
  const engineTaste = engineAverage('taste')
  const meanPairSimilarity = pairSimilarity / pairCount
  const below75 = names.filter((item) => item.quality < 0.75).length
  const wrongSize = rows.filter((row) => (
    row.poolRequested !== 60
    || row.poolReturned <= 10
    || row.poolReturned > 60
    || row.selected.length !== 10
  )).length
  const returnedCounts = [...new Set(rows.map((row) => row.poolReturned))].sort((a, b) => a - b)
  const retryGroups = new Map()
  for (const row of rows) {
    const key = `${row.references}\n${row.prompt}`
    if (!retryGroups.has(key)) retryGroups.set(key, [])
    retryGroups.get(key).push(row)
  }
  const retrySummary = (field) => {
    let uniqueNames = 0
    let repeatedPages = 0
    for (const group of retryGroups.values()) {
      const pages = group.map((row) => (
        field === 'baseline' ? row.baseline : row.selected.map((item) => item.name)
      ))
      uniqueNames += new Set(pages.flat().map((name) => name.toLowerCase())).size
      repeatedPages += pages.length - new Set(pages.map((page) => page.join('|').toLowerCase())).size
    }
    return { uniqueNames, repeatedPages }
  }
  const baselineRetries = retrySummary('baseline')
  const seededRetries = retrySummary('selected')

  console.log(`personalized pages: ${rows.length}`)
  console.log(`selected names: ${names.length}`)
  console.log(`average structural quality: ${engineQuality.toFixed(2)} -> ${averageQuality.toFixed(2)}`)
  console.log(`average taste affinity: ${engineTaste.toFixed(3)} -> ${averageTaste.toFixed(3)} (${(averageTaste - engineTaste).toFixed(3)})`)
  console.log(`sub-75 names: ${below75}`)
  console.log(`three-plus prefix overflow: ${prefixOverTwo}`)
  console.log(`three-plus exact-ending overflow: ${endingOverTwo}`)
  console.log(`four-plus exact-ending overflow: ${endingOverThree} (max ${maxEndingCount})`)
  console.log(`direct suffix forms / pages at cap / suffix-only / max: ${directSuffixForms} / ${suffixHeavyPages} / ${suffixOnlyPages} / ${maxDirectSuffixes}`)
  console.log(`near-duplicate pairs: ${nearPairs}`)
  console.log(`mean pair similarity: ${meanPairSimilarity.toFixed(3)}`)
  console.log(`returned pool sizes: ${returnedCounts.join(', ')}`)
  console.log(`retry unique names: ${baselineRetries.uniqueNames} -> ${seededRetries.uniqueNames} / ${retryGroups.size * SEEDS.length * 10}`)
  console.log(`exact repeated retry pages: ${baselineRetries.repeatedPages} -> ${seededRetries.repeatedPages}`)
  const poolsByPrompt = new Map()
  for (const row of rows) {
    if (!poolsByPrompt.has(row.prompt)) poolsByPrompt.set(row.prompt, new Set())
    poolsByPrompt.get(row.prompt).add(row.poolReturned)
  }
  for (const [prompt, sizes] of poolsByPrompt) {
    console.log(`  ${[...sizes].sort((a, b) => a - b).join('/')}  ${prompt}`)
  }
  let minReferenceTasteUplift = Number.POSITIVE_INFINITY
  for (const references of REFERENCE_SETS) {
    const referenceRows = rows.filter((row) => row.references === references)
    const before = referenceRows.flatMap((row) => row.engineFirstPage)
    const after = referenceRows.flatMap((row) => row.selected)
    const beforeTaste = before.reduce((sum, item) => sum + item.taste, 0) / before.length
    const afterTaste = after.reduce((sum, item) => sum + item.taste, 0) / after.length
    minReferenceTasteUplift = Math.min(minReferenceTasteUplift, afterTaste - beforeTaste)
    console.log(`  taste ${beforeTaste.toFixed(3)} -> ${afterTaste.toFixed(3)} (${(afterTaste - beforeTaste).toFixed(3)})  ${references}`)
  }
  let semanticRetentionFailures = 0
  for (const testCase of CASES) {
    const caseRows = rows.filter((row) => row.prompt === testCase.prompt)
    const engineMapped = caseRows.flatMap((row) => row.engineFirstPage).filter((item) => {
      const normalized = item.name.toLowerCase().replace(/[^a-z]/g, '')
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
    [endingOverThree === 0, 'no visible page contains more than three names per exact ending'],
    [endingOverTwo <= 150, 'three-name ending families stay bounded across the matrix'],
    [averageQuality >= 85.2, 'average structural quality stays at or above 85.2'],
    [averageTaste >= -0.82, 'reference affinity stays within the retained floor'],
    [averageTaste - engineTaste >= 0.3, 'local taste improves average affinity over engine order'],
    [minReferenceTasteUplift >= 0.2, 'every reference family gains meaningful affinity'],
    [nearPairs <= 230, 'near-duplicate pairs stay at or below 230'],
    [meanPairSimilarity <= 0.22, 'mean pair similarity stays at or below 0.22'],
    [directSuffixForms <= 620, 'direct root-plus-suffix forms stay below the retained ceiling'],
    [suffixOnlyPages === 0 && maxDirectSuffixes <= 8, 'no personalized page is only suffix templates'],
    [
      seededRetries.uniqueNames >= baselineRetries.uniqueNames + 30,
      'seed-aware taste adds at least 30 fresh names across repeated first pages',
    ],
    [
      seededRetries.repeatedPages <= 10,
      'no more than ten seeded retries reproduce an exact prior page',
    ],
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
