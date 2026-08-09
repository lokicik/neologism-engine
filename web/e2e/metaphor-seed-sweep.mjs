// Search deterministic seed offsets for Auto's small guided-metaphor pool.
// This is a candidate-pool diagnostic; finalists must still pass the full
// namespace, cold, taste, and session audits before production use.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4193
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPTS = [
  'an offline naming engine for developer projects that checks npm and crates.io',
  'an offline developer naming engine for packages CLIs and libraries with npm and crates.io availability checks',
  'a tool that finds available package names across developer registries and namespaces',
]
const SEEDS = [7, 42, 101, 2024, 9999]
const OFFSETS = [
  ...Array.from({ length: 65 }, (_, index) => index),
  97, 127, 257, 521, 1021, 4099, 7919, 65537, 0x9e3779b9,
]
const UINT32_RANGE = 0x1_0000_0000
const QUALITY_FLOOR = 85

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
  const rows = await page.evaluate(async ({ prompts, seeds, offsets, range, qualityFloor }) => {
    const { generateNames } = await import('/src/lib/engine.ts')
    const quality = (item) => (
      item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
    )
    const output = []
    for (const offset of offsets) {
      const selected = []
      const byPrompt = []
      for (let promptIndex = 0; promptIndex < prompts.length; promptIndex++) {
        const prompt = prompts[promptIndex]
        let promptPages = 0
        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
          const seed = seeds[seedIndex]
          const pool = await generateNames({
            style: 'big_tech', count: 8, min_len: 4, max_len: 12,
            temperature: 0.85, variety: 0.3, roots: [], variant: 'metaphor',
            description: prompt, exclude: [], seed: (seed + offset) % range,
          })
          const best = pool
            .filter((item) => (item.concept_coverage ?? 0) > 0 && quality(item) >= qualityFloor)
            .sort((left, right) => quality(right) - quality(left))[0]
          if (best) {
            promptPages++
            selected.push({ name: best.name, quality: quality(best), promptIndex, seedIndex })
          }
        }
        byPrompt.push(promptPages)
      }
      output.push({ offset, selected, byPrompt })
    }
    return output
  }, {
    prompts: PROMPTS,
    seeds: SEEDS,
    offsets: OFFSETS,
    range: UINT32_RANGE,
    qualityFloor: QUALITY_FLOOR,
  })

  const baseline = rows.find((row) => row.offset === 0)
  const baselinePages = new Set(baseline.selected.map((item) => `${item.promptIndex}:${item.seedIndex}`))
  const ranked = rows.map((row) => {
    const fallback = row.selected.filter((item) => !baselinePages.has(`${item.promptIndex}:${item.seedIndex}`))
    return {
      ...row,
      pages: row.selected.length,
      unique: new Set(row.selected.map((item) => item.name.toLowerCase())).size,
      quality: row.selected.reduce((sum, item) => sum + item.quality, 0) / Math.max(1, row.selected.length),
      fallback,
      fallbackUnique: new Set(fallback.map((item) => item.name.toLowerCase())).size,
    }
  }).sort((left, right) => (
    right.fallback.length - left.fallback.length
    || right.fallbackUnique - left.fallbackUnique
    || right.pages - left.pages
    || right.unique - left.unique
    || right.quality - left.quality
    || left.offset - right.offset
  ))

  console.log('offset · fills baseline gaps · fallback unique · covered pages · per prompt · candidate quality · fallback names')
  for (const row of ranked.slice(0, 15)) {
    console.log(
      `${row.offset} · ${row.fallback.length}/6 · ${row.fallbackUnique} · ${row.pages}/15 · ${row.byPrompt.join('/')} · ${row.quality.toFixed(2)} · ${row.fallback.map((item) => item.name).join(', ')}`,
    )
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
