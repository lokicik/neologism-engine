// Inspect candidate families for the cold Auto pages that still open with a
// direct suffix. This is a diagnostic: a promising name must still win the
// full 90-page and long-session quality matrices before entering production.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4197
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const CASES = [
  ['an app for splitting expenses with friends', 42],
  ['an app for splitting expenses with friends', 9999],
  ['a local cache inspector', 7],
  ['a simple workout planner', 7],
  ['a simple workout planner', 42],
  ['a simple workout planner', 2024],
]

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
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ cases }) => {
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
    for (const [prompt, seed] of cases) {
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
      const retry = needsColdLeadRetry(ordered) ? await generateColdLeadRetry(config) : []
      const selected = fillColdLeadRetry(ordered, retry)
      const [deep, conceptPair, compound, metaphor] = await Promise.all([
        generateNames({ ...config, variant: undefined, compound: false, count: 60 }),
        generateNames({ ...config, variant: 'concept_pair', compound: false, count: 12 }),
        generateNames({ ...config, variant: undefined, compound: true, count: 30 }),
        generateNames({ ...config, variant: 'metaphor', compound: false, count: 40 }),
      ])
      output.push({ prompt, seed, direct, fallback, ordered, selected, deep, conceptPair, compound, metaphor })
    }
    return output
  }, { cases: CASES })

  const letters = (value) => value.toLowerCase().replace(/[^a-z]/g, '')
  const quality = (item) => (
    item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
  )
  const directSuffixes = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
  const isDirectSuffix = (item) => (
    item.sourceMode === 'brandable'
    && item.concept_coverage === 1
    && directSuffixes.some((ending) => letters(item.name).endsWith(ending))
  )
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
  const meanSimilarity = (items) => {
    let total = 0
    let pairs = 0
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        total += similarity(items[i].name, items[j].name)
        pairs++
      }
    }
    return total / Math.max(1, pairs)
  }
  const describe = (item) => (
    `${item.name}:${quality(item).toFixed(1)}/c${item.concept_coverage ?? 0}`
    + `/${item.sourceMode ?? '?'}${item.construction ? '/guided' : ''}`
  )

  for (const row of rows) {
    const pageNames = new Set(row.ordered.map((item) => letters(item.name)))
    const currentSimilarity = meanSimilarity(row.ordered)
    console.log(`\n${row.seed} - ${row.prompt}`)
    console.log(`before: ${row.ordered.map(describe).join(', ')}`)
    console.log(`production: ${row.ordered[0].name} -> ${row.selected[0].name}`)
    console.log(`fallback count: ${row.fallback.length}`)
    for (const [label, pool] of [
      ['deep brandable', row.deep],
      ['concept pair', row.conceptPair],
      ['compound', row.compound],
      ['metaphor', row.metaphor],
    ]) {
      const pairPool = label === 'concept pair'
      const candidates = pool
        .filter((candidate) => !pageNames.has(letters(candidate.name)) && !isDirectSuffix(candidate))
        .map((candidate) => {
          const replacements = row.ordered
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => (
              isDirectSuffix(item)
              && quality(item) <= quality(candidate) + (pairPool ? 0.5 : Number.EPSILON)
            ))
            .sort((left, right) => quality(left.item) - quality(right.item) || right.index - left.index)
          let chosen
          for (const replacement of replacements) {
            const next = row.ordered.slice()
            next[replacement.index] = candidate
            const prefix = letters(candidate.name).slice(0, 3)
            const before = row.ordered.filter((item) => letters(item.name).startsWith(prefix)).length
            const after = next.filter((item) => letters(item.name).startsWith(prefix)).length
            const delta = meanSimilarity(next) - currentSimilarity
            if (after <= Math.max(2, before) && delta <= Number.EPSILON) {
              chosen = { replacement, delta }
              break
            }
          }
          if (!chosen) return { candidate, safe: false, delta: 0, replacement: undefined }
          return {
            candidate,
            replacement: chosen.replacement.item,
            delta: chosen.delta,
            safe: quality(candidate) >= 85
              && (candidate.concept_coverage ?? 0) >= (row.ordered[0].concept_coverage ?? 0)
              && quality(candidate) + (pairPool ? 0.5 : Number.EPSILON)
                >= quality(row.ordered[0]),
          }
        })
        .sort((left, right) => (
          Number(right.safe) - Number(left.safe)
          || (right.candidate.concept_coverage ?? 0) - (left.candidate.concept_coverage ?? 0)
          || quality(right.candidate) - quality(left.candidate)
        ))
        .slice(0, 12)
      console.log(`${label}: ${candidates.map(({ candidate, safe, delta, replacement }) => (
        `${safe ? '*' : '-'}${describe(candidate)}`
        + `${replacement ? `>${replacement.name}/s${delta >= 0 ? '+' : ''}${delta.toFixed(3)}` : ''}`
      )).join(', ') || 'none'}`)
    }
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
