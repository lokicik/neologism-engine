// A/B audit for rolling personalized sessions. The production behavior has
// historically excluded every hidden pool candidate after showing ten; this
// compares that policy with excluding only names the user actually saw.
// Run from web/: node e2e/personalized-session-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4193
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPT = 'an offline naming engine for developer projects that checks npm and crates.io'
const REFERENCES = ['Vercel, Linear, Notion', 'Stripe, Figma, Sentry']
const SEEDS = [42, 2024]

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
  await page.goto(APP_URL)
  const sessions = await page.evaluate(async ({ prompt, references, seeds }) => {
    const { generateBatch } = await import('/src/lib/engine.ts')
    const {
      buildReferencedProfile,
      preferencePoolCount,
      shortlistByPreference,
    } = await import('/src/lib/preferences.ts')
    const quality = (item) => (
      0.4 * item.score_pronounce
      + 0.3 * item.score_memorability
      + 0.3 * item.score_novelty
    ) / 100

    async function run(profile, seed, consumeHiddenPool) {
      const excluded = []
      const visible = []
      const pages = []
      for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
        const requested = 10
        const pool = await generateBatch({
          style: 'big_tech',
          count: preferencePoolCount(requested, profile),
          min_len: 4,
          max_len: 12,
          temperature: 0.85,
          variety: 0.3,
          roots: [],
          variant: 'auto',
          description: prompt,
          exclude: excluded,
          seed,
        })
        const selected = shortlistByPreference(pool, profile, requested, seed)
        visible.push(...selected)
        pages.push({
          pool: pool.length,
          shown: selected.length,
          quality: selected.length
            ? selected.reduce((sum, item) => sum + quality(item), 0) / selected.length
            : 0,
        })
        excluded.push(...(consumeHiddenPool ? pool : selected).map((item) => item.name))
        if (selected.length < requested) break
      }
      return {
        excluded: excluded.length,
        names: visible.map((item) => item.name),
        quality: visible.map(quality),
        coverage: visible.map((item) => item.concept_coverage ?? 0),
        pages,
      }
    }

    const output = []
    for (const referenceSet of references) {
      const profile = buildReferencedProfile([], [], referenceSet).profile
      if (!profile) throw new Error(`reference profile missing: ${referenceSet}`)
      for (const seed of seeds) {
        output.push({
          referenceSet,
          seed,
          poolHistory: await run(profile, seed, true),
          visibleHistory: await run(profile, seed, false),
        })
      }
    }
    return output
  }, { prompt: PROMPT, references: REFERENCES, seeds: SEEDS })

  const summarize = (key) => {
    const runs = sessions.map((session) => session[key])
    const names = runs.flatMap((run) => run.names)
    const qualities = runs.flatMap((run) => run.quality)
    const coverages = runs.flatMap((run) => run.coverage)
    const lastPages = runs.map((run) => (
      [...run.pages].reverse().find((page) => page.shown > 0)?.quality ?? 0
    ))
    return {
      visible: names.length,
      unique: new Set(names.map((name) => name.toLowerCase())).size,
      excluded: runs.reduce((sum, run) => sum + run.excluded, 0),
      averageQuality: qualities.reduce((sum, value) => sum + value, 0) / qualities.length * 100,
      lastPageQuality: lastPages.reduce((sum, value) => sum + value, 0) / lastPages.length * 100,
      shortRuns: runs.filter((run) => run.names.length < 100).length,
      duplicateRuns: runs.filter((run) => (
        new Set(run.names.map((name) => name.toLowerCase())).size !== run.names.length
      )).length,
      below75: qualities.filter((value) => value < 0.75).length,
      unlinked: coverages.filter((value) => value < 1).length,
      minRun: Math.min(...runs.map((run) => run.names.length)),
      poolSizes: [...new Set(runs.flatMap((run) => run.pages.map((page) => page.pool)))].sort((a, b) => a - b),
    }
  }

  const summaries = {}
  for (const [label, key] of [
    ['exclude hidden pool', 'poolHistory'],
    ['exclude visible only', 'visibleHistory'],
  ]) {
    const summary = summarize(key)
    summaries[key] = summary
    console.log(`\n${label}`)
    console.log(`visible / unique: ${summary.visible} / ${summary.unique}`)
    console.log(`history entries: ${summary.excluded}`)
    console.log(`average / last-page quality: ${summary.averageQuality.toFixed(2)} / ${summary.lastPageQuality.toFixed(2)}`)
    console.log(`short runs: ${summary.shortRuns}/${sessions.length} (min ${summary.minRun})`)
    console.log(`duplicate runs / sub-75 / unlinked: ${summary.duplicateRuns} / ${summary.below75} / ${summary.unlinked}`)
    console.log(`pool sizes: ${summary.poolSizes.join(', ')}`)
  }

  const visible = summaries.visibleHistory
  check(visible.shortRuns === 0 && visible.minRun === 100, 'visible-only history sustains all four 100-name sessions')
  check(visible.duplicateRuns === 0, 'every visible-only session contains 100 unique names')
  check(visible.excluded === visible.visible, 'history contains only names that were actually shown')
  check(visible.below75 === 0, 'rolling personalized sessions keep the structural quality floor')
  check(visible.unlinked === 0, 'every rolling personalized name remains tied to the brief')
  check(visible.averageQuality >= 84.5, 'rolling personalized quality stays at or above 84.5')
  check(visible.lastPageQuality >= 82.5, 'the tenth personalized page stays at or above 82.5')
  check(
    visible.poolSizes.length === 1 && visible.poolSizes[0] === 60,
    'every visible-only page retains the full 60-candidate taste pool',
  )

  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('neologism:visited', '1'))
  const appPage = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await appPage.goto(APP_URL)
  await appPage.locator('.command-input').fill(PROMPT)
  await appPage.locator('.chips-row .chip-wrap:last-child > .chip').click()
  await appPage.locator('.taste-reference-input').fill(REFERENCES[0])
  await appPage.click('.command-go')
  await appPage.waitForFunction(() => document.querySelectorAll('.name-card').length === 10)
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = await appPage.locator('.name-card').count()
    if (before >= 100) break
    await appPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await appPage.waitForFunction(
      (previous) => document.querySelectorAll('.name-card').length > previous,
      before,
      { timeout: 6000 },
    )
  }
  const appNames = await appPage.locator('.name-text').allTextContents()
  const recentCount = await appPage.evaluate(() => {
    const raw = localStorage.getItem('neologism:recent')
    return raw ? JSON.parse(raw).length : 0
  })
  check(appNames.length >= 100, `the real personalized UI reaches 100 names (got ${appNames.length})`)
  check(
    new Set(appNames.map((name) => name.toLowerCase())).size === appNames.length,
    'the real personalized UI shows no repeated names',
  )
  check(recentCount === appNames.length, 'browser history matches the names visible in the personalized UI')
  check(await appPage.locator('.exhausted-notice').count() === 0, 'the personalized UI is not falsely exhausted')
  await context.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) process.exitCode = 1
