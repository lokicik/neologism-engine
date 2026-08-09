// A/B audit for a local taste profile that explicitly prefers two-part names.
// Run from web/: node e2e/mode-taste-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4194
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const REFERENCES = 'GitHub, DoorDash, YouTube'
const PROMPTS = [
  'an offline naming engine for developer projects that checks npm and crates.io',
  'a Rust CLI that processes logs',
  'a secure password manager for teams',
  'a tool that syncs design tokens',
  'a local database inspector',
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
  const rows = await page.evaluate(async ({ references, prompts, seeds }) => {
    const { generateBatch, generateNames } = await import('/src/lib/engine.ts')
    const {
      buildReferencedProfile,
      compoundTastePoolCount,
      preferencePoolCount,
      shortlistByPreference,
      similarity,
    } = await import('/src/lib/preferences.ts')
    const profile = buildReferencedProfile([], [], references).profile
    if (!profile) throw new Error('compound reference profile missing')
    const quality = (item) => (
      0.4 * item.score_pronounce
      + 0.3 * item.score_memorability
      + 0.3 * item.score_novelty
    ) / 100
    const output = []
    for (const prompt of prompts) {
      for (const seed of seeds) {
        const requested = 10
        const basePool = await generateBatch({
          style: 'big_tech',
          count: preferencePoolCount(requested, profile),
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
        const compoundPool = await generateNames({
          style: 'big_tech',
          count: compoundTastePoolCount(requested, profile),
          min_len: 4,
          max_len: 12,
          temperature: 0.85,
          variety: 0.3,
          roots: [],
          description: prompt,
          compound: true,
          exclude: [],
          seed,
        })
        const mapItem = (item) => ({
          name: item.name,
          mode: item.sourceMode,
          quality: quality(item),
          taste: similarity(item, profile),
          coverage: item.concept_coverage ?? 0,
        })
        output.push({
          prompt,
          seed,
          current: shortlistByPreference(basePool, profile, requested, seed).map(mapItem),
          supplemented: shortlistByPreference(
            [...basePool, ...compoundPool],
            profile,
            requested,
            seed,
          ).map(mapItem),
        })
      }
    }
    return output
  }, { references: REFERENCES, prompts: PROMPTS, seeds: SEEDS })

  const summarize = (field) => {
    const items = rows.flatMap((row) => row[field])
    return {
      quality: items.reduce((sum, item) => sum + item.quality, 0) / items.length * 100,
      taste: items.reduce((sum, item) => sum + item.taste, 0) / items.length,
      compounds: items.filter((item) => item.mode === 'compound').length,
      unlinked: items.filter((item) => item.coverage < 1).length,
      below75: items.filter((item) => item.quality < 0.75).length,
      unique: new Set(items.map((item) => item.name.toLowerCase())).size,
      maxCompounds: Math.max(...rows.map((row) => (
        row[field].filter((item) => item.mode === 'compound').length
      ))),
    }
  }
  const current = summarize('current')
  const supplemented = summarize('supplemented')
  console.log(`compound-reference pages: ${rows.length}`)
  console.log(`quality: ${current.quality.toFixed(2)} -> ${supplemented.quality.toFixed(2)}`)
  console.log(`taste affinity: ${current.taste.toFixed(3)} -> ${supplemented.taste.toFixed(3)}`)
  console.log(`compound cards: ${current.compounds} -> ${supplemented.compounds}`)
  console.log(`unique names: ${current.unique} -> ${supplemented.unique}`)
  console.log(`unlinked / sub-75: ${current.unlinked}/${current.below75} -> ${supplemented.unlinked}/${supplemented.below75}`)
  for (const prompt of PROMPTS) {
    const promptRows = rows.filter((row) => row.prompt === prompt)
    const before = promptRows.flatMap((row) => row.current)
    const after = promptRows.flatMap((row) => row.supplemented)
    const beforeTaste = before.reduce((sum, item) => sum + item.taste, 0) / before.length
    const afterTaste = after.reduce((sum, item) => sum + item.taste, 0) / after.length
    const compounds = after.filter((item) => item.mode === 'compound').length
    console.log(`  ${beforeTaste.toFixed(3)} -> ${afterTaste.toFixed(3)} · ${compounds}/50 Compound · ${prompt}`)
  }
  const checks = [
    [supplemented.quality >= current.quality - 0.1, 'Compound accents preserve structural quality'],
    [supplemented.taste >= current.taste + 0.12, 'Compound accents materially improve matching taste'],
    [supplemented.compounds >= 25, 'strong two-part taste surfaces Compound candidates'],
    [supplemented.maxCompounds <= 3, 'Compound accents never take over a ten-name page'],
    [supplemented.unique >= current.unique + 10, 'mode-aware taste broadens the visible vocabulary'],
    [supplemented.unlinked <= current.unlinked, 'mode accents do not weaken brief coverage'],
    [supplemented.below75 === 0, 'mode accents preserve the structural quality floor'],
  ]
  for (const [ok, label] of checks) {
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

if (failures > 0) process.exitCode = 1
