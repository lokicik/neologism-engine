// Phase 144 browser contract: a Create page argues for a few finalists rather
// than listing the whole batch. Six taste rounds ended with nothing chosen
// from ten-name grids, so the shortlist is the page's product claim: every
// finalist carries a case the engine can state, availability, and the places
// the name has to survive — with the rest of the batch one click away.
// Run against the dev server: node e2e/shortlist-contract.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4231
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const BRIEFS = ['', 'a self hosted password manager', 'a terminal log viewer']

const server = spawn(process.execPath, [viteCli, '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not start')), 30000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('vite exited early')))
})

const browser = await chromium.launch()
let checks = 0
let failures = 0
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Open app/ }).click()
  await page.waitForSelector('input')

  for (const brief of BRIEFS) {
    const label = brief === '' ? 'promptless' : `"${brief}"`
    if (brief !== '') {
      await page.fill('input', brief)
    }
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForSelector('.finalist', { timeout: 30000 })
    // The batch keeps loading its availability data after the first paint.
    await page.waitForTimeout(2500)

    const panel = await page.evaluate(() => {
      const finalists = [...document.querySelectorAll('.finalist')]
      return {
        count: finalists.length,
        gridCards: document.querySelectorAll('.name-card').length,
        reveal: document.querySelector('.shortlist-reveal')?.textContent ?? '',
        cases: finalists.map((card) => card.querySelector('.finalist-case')?.textContent ?? ''),
        contexts: finalists.map((card) => (
          [...card.querySelectorAll('.finalist-contexts code')].map((code) => code.textContent)
        )),
        names: finalists.map((card) => card.querySelector('.finalist-name')?.textContent ?? ''),
        availability: finalists.map((card) => card.querySelector('.finalist-avail')?.textContent ?? ''),
      }
    })

    check(panel.count >= 2 && panel.count <= 4, `${label}: shortlist holds two to four finalists (${panel.count})`)
    check(panel.gridCards === 0, `${label}: the rest of the batch stays behind the reveal`)
    check(/Show all \d+ names/.test(panel.reveal), `${label}: the reveal names the batch size (${panel.reveal})`)
    check(
      panel.cases.every((text) => text.trim().length > 0),
      `${label}: every finalist states its case`,
    )
    check(
      panel.contexts.every((lines, index) => (
        lines.length === 3
        && lines.every((line) => line.includes(panel.names[index].toLowerCase()))
      )),
      `${label}: every finalist shows the name in three real contexts`,
    )
    check(
      panel.availability.every((text) => text.includes('crates.io')),
      `${label}: every finalist carries its availability`,
    )

    // The names the page can argue for lead it: a shortlist of well-scored
    // spellings is the failure mode this panel exists to prevent.
    //
    // A promptless page draws on the reasoning and dense-coinage families, so
    // it can fill the shortlist with full cases. A brief-driven page is held
    // to one reasoning card by the Auto page-shape contract, and only ~57% of
    // them offer it a slot at all, so the promise there is narrower: whenever
    // the batch carries a card with a chain, the shortlist must be leading
    // with it rather than with a better-scored spelling.
    const arguable = panel.cases.filter((text) => (
      text.includes('—') || (text.includes('=') && !text.includes('canon suffix'))
    )).length
    if (brief === '') {
      check(arguable >= 2, `${label}: at least two finalists carry a full case (${arguable}/${panel.count})`)
    } else {
      const batchHasChain = await page.evaluate(() => {
        const reveal = document.querySelector('.shortlist-reveal')
        const wasHidden = /Show all/.test(reveal?.textContent ?? '')
        if (wasHidden) reveal?.click()
        const chains = document.querySelectorAll('.card-ai-reason').length
        if (wasHidden) document.querySelector('.shortlist-reveal')?.click()
        return chains > 0
      })
      check(
        !batchHasChain || arguable >= 1,
        `${label}: a batch with a chain leads the shortlist with it (chain in batch: ${batchHasChain}, full cases: ${arguable}/${panel.count})`,
      )
    }
  }

  await page.click('.shortlist-reveal')
  await page.waitForSelector('.name-card')
  const revealed = await page.evaluate(() => ({
    grid: document.querySelectorAll('.name-card').length,
    reveal: document.querySelector('.shortlist-reveal')?.textContent ?? '',
    finalists: document.querySelectorAll('.finalist').length,
  }))
  check(revealed.grid >= 10, `the reveal opens the full batch (${revealed.grid} cards)`)
  check(revealed.finalists >= 2, 'the finalists stay on the page when the batch is revealed')
  check(/Hide the rest/.test(revealed.reveal), 'the reveal control offers the way back')

  check(pageErrors.length === 0, `shortlist paths produce zero page errors (${JSON.stringify(pageErrors)})`)
} finally {
  await browser.close()
  server.kill()
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
