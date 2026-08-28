// Seam-blend saturation probe (Phase 141). Measures the two primary outcome
// metrics from plan.md — template-match card share and six-card single-shape
// walls — on the 105 canonical production pages, then simulates a bounded
// two-slot seam-blend accent (quality floor 75, no duplicates) and reports
// both metrics again. Seam-blend cards count as their OWN shape and are never
// counted assembled; their share is printed separately so the accounting is
// honest. Diagnostic only — always exits 0; the held-out audit stays the gate.
//
//   node e2e/seamblend-saturation-probe.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ASSEMBLED_CONSTRUCTION_SHAPES,
  TEMPLATE_CONSTRUCTION_SHAPES,
  constructionShape,
  letters,
} from './lib/construction-shapes.mjs'

const PORT = 4217
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
// Source of truth: BASE_PROMPTS in heldout-cold-quality-audit.mjs. Kept as a
// copy because importing that file would launch the audit's own server.
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
const SEEDS = [13, 67, 313]
const ACCENT_SLOTS = 2
const ACCENT_QUALITY_FLOOR = 75

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
        // Exact production page flow (mirrors heldout-cold-quality-audit.mjs).
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
        const selected = fillColdLeadRetry(ordered, retry, [...direct, ...fallback])
        // The candidate family pool, same brief and seed, its own RNG stream.
        const family = await generateNames({ ...config, variant: 'seamblend' })
        output.push({ prompt, seed, selected, family })
      }
    }
    return output
  }, { prompts: BASE_PROMPTS, seeds: SEEDS })

  const quality = (item) => (
    item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
  )
  const summarize = (pages) => {
    let cards = 0
    let assembled = 0
    let template = 0
    let seamblend = 0
    let walls = 0
    for (const names of pages) {
      const shapes = names.map(constructionShape)
      cards += shapes.length
      assembled += shapes.filter((s) => ASSEMBLED_CONSTRUCTION_SHAPES.has(s)).length
      template += shapes.filter((s) => TEMPLATE_CONSTRUCTION_SHAPES.has(s)).length
      seamblend += shapes.filter((s) => s === 'seamblend').length
      const counts = new Map()
      for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1)
      if (Math.max(...counts.values()) >= 6) walls++
    }
    return { cards, assembled, template, seamblend, walls, pages: pages.length }
  }

  const production = summarize(rows.map((row) => row.selected))
  let starvedPools = 0
  const accentPages = rows.map((row) => {
    const existing = new Set(row.selected.map((item) => letters(item.name)))
    const candidates = row.family
      .filter((item) => quality(item) >= ACCENT_QUALITY_FLOOR)
      .filter((item) => !existing.has(letters(item.name)))
      .slice(0, ACCENT_SLOTS)
    if (candidates.length === 0) starvedPools++
    // Replace the lowest-quality template-shaped cards, never the lead.
    const page = [...row.selected]
    const replaceable = page
      .map((item, index) => ({ item, index, shape: constructionShape(item) }))
      .filter(({ index, shape }) => index > 0 && TEMPLATE_CONSTRUCTION_SHAPES.has(shape))
      .sort((a, b) => quality(a.item) - quality(b.item))
    for (let k = 0; k < candidates.length && k < replaceable.length; k++) {
      page[replaceable[k].index] = candidates[k]
    }
    return page
  })
  const accented = summarize(accentPages)

  const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`
  console.log(`pages: ${production.pages} (35 canonical briefs × 3 seeds)`)
  console.log(
    `production  — template-match proxy: ${production.assembled}/${production.cards}`
    + ` (${pct(production.assembled, production.cards)})`
    + ` · root-template subtotal: ${production.template}`
    + ` · single-shape walls: ${production.walls}/${production.pages}`,
  )
  console.log(
    `with accent — template-match proxy: ${accented.assembled}/${accented.cards}`
    + ` (${pct(accented.assembled, accented.cards)})`
    + ` · root-template subtotal: ${accented.template}`
    + ` · single-shape walls: ${accented.walls}/${accented.pages}`
    + ` · seam-blend cards: ${accented.seamblend} (${pct(accented.seamblend, accented.cards)})`
    + ` · starved family pools: ${starvedPools}/${production.pages}`,
  )
  const assembledDown = accented.assembled < production.assembled
  const wallsDown = accented.walls <= production.walls
  console.log(
    `${assembledDown && wallsDown ? 'SIGNAL' : 'NO-SIGNAL'}  assembled ${production.assembled}→${accented.assembled}`
    + ` · walls ${production.walls}→${accented.walls}`,
  )
} finally {
  await browser.close()
  server.kill()
}
