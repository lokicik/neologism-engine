// Phase 164 browser contract: malformed rows inside explicit taste arrays are
// ignored in memory without erasing valid scoped or historical feedback.
// Run after `npm run build`: node e2e/taste-row-corruption.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 4223
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const EXPECTED_CHECKS = 13
const CONTEXT = {
  id: 'phase164-project🚀',
  description: 'A local 🚀 developer dashboard',
  roots: ['dash', 'local🚀'],
}
const result = (name, tasteContext) => ({
  name,
  style: 'big_tech',
  syllables: 2,
  score_pronounce: 84,
  score_novelty: 91,
  score_memorability: 82,
  connotations: ['clear🚀'],
  ...(tasteContext ? { tasteContext } : {}),
})
const VALID_LIKES = [result('LegacyLike'), result('ScopedLike', CONTEXT)]
const VALID_PASSES = [result('LegacyPass'), result('ScopedPass', CONTEXT)]
const INVALID_ROWS = [
  {},
  { ...result('BadConnotations'), connotations: [17] },
  { ...result('BadStyle'), style: 'unknown' },
  { ...result('BadName'), name: 42 },
  result('Broken\uD83D'),
  result('Broken\uDE80'),
  { ...result('BadConnotationUnicode'), connotations: ['clear\uD83D'] },
  result('BadDescriptionUnicode', { ...CONTEXT, description: 'Broken\uD83D' }),
  result('BadRootUnicode', { ...CONTEXT, roots: ['dash', 'Broken\uDE80'] }),
  result('BadContextIdUnicode', { ...CONTEXT, id: 'broken\uD83D' }),
]
const FAVORITES_RAW = JSON.stringify([
  VALID_LIKES[0],
  INVALID_ROWS[0],
  VALID_LIKES[1],
  INVALID_ROWS[1],
  INVALID_ROWS[4],
  INVALID_ROWS[6],
  INVALID_ROWS[8],
])
const REJECTED_RAW = JSON.stringify([
  VALID_PASSES[0],
  INVALID_ROWS[2],
  VALID_PASSES[1],
  INVALID_ROWS[3],
  INVALID_ROWS[5],
  INVALID_ROWS[7],
  INVALID_ROWS[9],
])

const server = spawn(process.execPath, [viteCli, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('vite preview exited early')))
})

const browser = await chromium.launch()
let checks = 0
let failures = 0
const external = []
const pageErrors = []
const check = (ok, label) => {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function readDownload(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ favorites, rejected }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:favorites', favorites)
    localStorage.setItem('neologism:rejected', rejected)
    localStorage.setItem('phase164:sentinel', 'unchanged')
  }, { favorites: FAVORITES_RAW, rejected: REJECTED_RAW })
  await context.route('https://**/*', async (route) => {
    external.push(route.request().url())
    await route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(APP_URL)
  await page.waitForTimeout(400)
  const shellReady = await page.locator('.sidebar').count() === 1
  check(shellReady, 'mixed explicit taste arrays cannot crash the application shell')
  check(pageErrors.length === 0, `mixed taste rows produce zero page errors (${pageErrors.join(' | ')})`)
  check(
    await page.evaluate(({ favorites, rejected }) => (
      localStorage.getItem('neologism:favorites') === favorites
        && localStorage.getItem('neologism:rejected') === rejected
    ), { favorites: FAVORITES_RAW, rejected: REJECTED_RAW }),
    'load validation leaves both raw taste arrays byte-identical',
  )

  let savedNames = []
  let savedMeta = []
  if (shellReady) {
    await page.locator('.sidebar-item', { hasText: 'Saved' }).click()
    savedNames = await page.locator('.saved-page .name-text').allTextContents()
    savedMeta = await page.locator('.saved-page .name-card').evaluateAll((cards) => (
      cards.map((card) => card.querySelector('.card-meta-line')?.textContent ?? '')
    ))
  }
  check(
    savedNames.length === 2
      && VALID_LIKES.every((item) => savedNames.includes(item.name))
      && savedMeta.length === 2
      && savedMeta.every((meta) => meta.includes('clear🚀')),
    'Saved retains valid astral pairs in historical and scoped likes only',
  )
  check(
    INVALID_ROWS.every((item) => !savedNames.includes(String(item.name ?? ''))),
    'malformed favorite rows never become visible Saved cards',
  )

  let settingsOpen = false
  if (shellReady) {
    await page.locator('.sidebar-settings').click()
    settingsOpen = await page.locator('.settings-modal').count() === 1
  }
  const dataMeta = settingsOpen ? ((await page.locator('.settings-data-meta').textContent()) ?? '') : ''
  const evidence = settingsOpen ? ((await page.locator('.settings-data-evidence').textContent()) ?? '') : ''
  check(/2 liked.*2 passed.*2 derived pairs/.test(dataMeta), 'Settings summary counts only the two valid rows per label')
  check(
    /1\/10 matched likes.*1\/10 matched passes.*1 project context/.test(evidence),
    'scoped evidence survives filtering while historical rows remain descriptive',
  )

  let likedLabels = []
  let passedLabels = []
  if (settingsOpen) {
    await page.locator('.settings-liked-toggle').click()
    await page.locator('.settings-passed-toggle').click()
    likedLabels = await page.locator('.settings-liked-row').allTextContents()
    passedLabels = await page.locator('.settings-passed-row').allTextContents()
  }
  check(
    likedLabels.length === 2
      && likedLabels.some((label) => label.includes('Historical unscoped feedback'))
      && likedLabels.some((label) => label.includes(CONTEXT.description) && label.includes('roots: dash, local🚀')),
    'liked review preserves one historical and one fully labeled scoped identity',
  )
  check(
    passedLabels.length === 2
      && passedLabels.some((label) => label.includes('Historical unscoped feedback'))
      && passedLabels.some((label) => label.includes(CONTEXT.description) && label.includes('roots: dash, local🚀')),
    'passed review preserves one historical and one fully labeled scoped identity',
  )

  let exported = null
  if (settingsOpen) {
    const downloadPromise = page.waitForEvent('download')
    await page.locator('.taste-export-btn').click()
    exported = await readDownload(await downloadPromise)
  }
  check(
    exported?.schema === 'neologism-taste-v2'
      && exported.summary.liked === 2
      && exported.summary.passed === 2
      && exported.summary.comparisons === 2
      && exported.examples.length === 4,
    'taste export contains only the four valid examples and their scoped plus legacy pairs',
  )

  if (settingsOpen) await page.getByTitle('Close').click()
  if (shellReady) {
    await page.locator('.sidebar-item', { hasText: 'Create' }).click()
    await page.locator('.command-area .command-go').click()
    await page.waitForSelector('.results-grid .name-card:nth-child(10)', { timeout: 20000 })
  }
  check(await page.locator('.results-grid .name-card').count() === 10, 'filtered taste rows still allow one full personalized Create page')
  check(
    await page.evaluate(() => localStorage.getItem('phase164:sentinel')) === 'unchanged',
    'taste-row validation leaves unrelated browser storage unchanged',
  )
  check(external.length === 0, `taste-row validation produces zero external HTTPS requests (${external.join(' | ')})`)
  await context.close()
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}

if (checks !== EXPECTED_CHECKS) {
  console.error(`FAIL  expected ${EXPECTED_CHECKS} checks, executed ${checks}`)
  process.exit(1)
}
if (failures > 0) process.exit(1)
console.log(`\nTaste row corruption: all checks passed (${checks}/${EXPECTED_CHECKS})`)
