// Fixed-seed production audit for developer-name namespace semantics.
// Run from web/: node e2e/namespace-quality-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4192
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPTS = [
  'an offline naming engine for developer projects that checks npm and crates.io',
  'an offline developer naming engine for packages CLIs and libraries with npm and crates.io availability checks',
  'a tool that finds available package names across developer registries and namespaces',
]
const SEEDS = [7, 42, 101, 2024, 9999]
const NAMESPACE_MARKERS = ['scope', 'key', 'tag', 'alias', 'slug']
const NAMING_ROOTS = ['lex', 'nym', 'nom', 'mark', 'mint']
const NAMING_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
const WRONG_CONTEXT = ['engine', 'offline', 'check', 'file', 'path', 'find', 'scan', 'seek']
const VERBOSE = process.argv.includes('--verbose')

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

const pageSimilarity = (results) => {
  let total = 0
  let pairs = 0
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const left = results[i].name.toLowerCase()
      const right = results[j].name.toLowerCase()
      total += 1 - editDistance(left, right) / Math.max(left.length, right.length)
      pairs++
    }
  }
  return pairs === 0 ? 0 : total / pairs
}

const quality = (item) => (
  item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
)

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
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  failures += Number(!ok)
}

try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { generateBatch, generateNames } = await import('/src/lib/engine.ts')
    const { coldQualityPoolCount, needsQualityRepair, repairWeakShortlist } = await import('/src/lib/preferences.ts')
    const output = []
    for (const prompt of prompts) {
      const pages = []
      for (const seed of seeds) {
        const config = {
          style: 'big_tech', count: 10, min_len: 4, max_len: 12,
          temperature: 0.85, variety: 0.3, roots: [], description: prompt,
          exclude: [], seed, variant: 'auto',
        }
        const direct = await generateBatch(config)
        const fallback = needsQualityRepair(direct, 10)
          ? await generateNames({
              ...config, variant: undefined, compound: false,
              count: coldQualityPoolCount(10), exclude: direct.map((item) => item.name),
            })
          : []
        pages.push(repairWeakShortlist(direct, fallback, 10))
      }
      output.push({ prompt, pages })
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  for (const row of rows) {
    const all = row.pages.flat()
    const normalized = all.map((item) => item.name.toLowerCase().replace(/[^a-z]/g, ''))
    const markerHits = normalized.filter((name) => NAMESPACE_MARKERS.some((marker) => name.includes(marker))).length
    const directSuffixHits = normalized.filter((name) => (
      NAMING_ROOTS.some((root) => NAMING_SUFFIXES.some((suffix) => name === `${root}${suffix}`))
    )).length
    const guidedMetaphorHits = all.filter((item) => item.construction === 'guided_metaphor').length
    const guidedMetaphorsPerPage = row.pages.map((batch) => (
      batch.filter((item) => item.construction === 'guided_metaphor').length
    ))
    const wrongForms = normalized.filter((name) => WRONG_CONTEXT.some((word) => name.includes(word)))
    const averageQuality = all.reduce((sum, item) => sum + quality(item), 0) / all.length
    const averageSimilarity = row.pages.reduce((sum, batch) => sum + pageSimilarity(batch), 0) / row.pages.length
    const unique = new Set(normalized).size
    const scopePages = row.pages.filter((batch) => batch.some((item) => item.name.toLowerCase().includes('scope'))).length

    console.log(`\n${row.prompt}`)
    console.log(`namespace ${markerHits}/50 · direct suffix ${directSuffixHits}/50 · guided metaphor ${guidedMetaphorHits}/50 · quality ${averageQuality.toFixed(2)} · similarity ${averageSimilarity.toFixed(3)} · unique ${unique}/50`)
    if (VERBOSE) {
      row.pages.forEach((batch, index) => console.log(`${SEEDS[index]}: ${batch.map((item) => item.name).join(', ')}`))
    }
    check(row.pages.every((batch) => batch.length === 10), 'every cold Auto page contains ten names')
    check(scopePages === SEEDS.length, 'every fixed page carries the developer-namespace concept')
    check(markerHits >= 15, 'at least 30% of names carry a namespace naming root')
    check(
      guidedMetaphorsPerPage.every((count) => count >= 1 && count <= 2),
      'every fixed page earns one or two strong non-template metaphor forms',
    )
    check(wrongForms.length === 0, `no delivery/filesystem context leaks (${wrongForms.join(', ') || 'none'})`)
    check(all.every((item) => quality(item) >= 75), 'no visible name falls below the structural floor')
    check(averageQuality >= 85, 'visible structural quality stays at or above 85')
    check(averageSimilarity <= 0.19, 'mean within-page similarity stays at or below 0.19')
    check(unique >= 20, 'five seeds expose at least twenty distinct visible names')
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
  console.error(`namespace quality audit: ${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('namespace quality audit: all checks passed')
}
