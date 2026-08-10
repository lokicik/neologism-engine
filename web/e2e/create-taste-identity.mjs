// Browser contract: the primary Create cards apply like/pass state to the
// current project identity only. Run after `npm run build`.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4183
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPT = 'a secure developer project for offline code review'

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
let failures = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

async function createContext(favorites = [], rejected = []) {
  const context = await browser.newContext()
  await context.addInitScript(({ liked, passed }) => {
    localStorage.setItem('neologism:visited', '1')
    if (!localStorage.getItem('phase145:create-identity-seeded')) {
      localStorage.setItem('neologism:favorites', JSON.stringify(liked))
      localStorage.setItem('neologism:rejected', JSON.stringify(passed))
      localStorage.setItem('phase145:create-identity-seeded', '1')
    }
    Math.random = () => 0.125
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) {
        for (let index = 0; index < array.length; index++) {
          array[index] = (17 + index * 31) & 0xff
        }
        return array
      },
    })
  }, { liked: favorites, passed: rejected })
  return context
}

async function generateCreatePage(context) {
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(APP_URL)
  await page.locator('.command-input').fill(PROMPT)
  await page.locator('.command-go').click()
  await page.waitForSelector('.name-card', { timeout: 20000 })
  return page
}

async function storedCounts(page) {
  return page.evaluate(() => ({
    liked: JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]').length,
    passed: JSON.parse(localStorage.getItem('neologism:rejected') ?? '[]').length,
  }))
}

try {
  const baselineContext = await createContext()
  const baselinePage = await generateCreatePage(baselineContext)
  const baselineCard = baselinePage.locator('.name-card').first()
  const name = (await baselineCard.locator('.name-text').textContent())?.trim() ?? ''
  await baselineCard.locator('.star-btn').click()
  const explicit = await baselinePage.evaluate(() => {
    const raw = localStorage.getItem('neologism:favorites')
    return raw ? JSON.parse(raw)[0] : null
  })
  check(Boolean(name && explicit?.tasteContext?.id), 'Create stores a generated like with project context')
  await baselineContext.close()

  const otherLike = {
    ...explicit,
    tasteContext: { ...explicit.tasteContext, id: 'project-a', description: 'project-a' },
  }
  const conflictContext = await createContext([otherLike], [explicit])
  const conflictPage = await generateCreatePage(conflictContext)
  const conflictCard = conflictPage.locator('.name-card').filter({ hasText: name })
  check(await conflictCard.count() === 1, 'deterministic Create replay contains the same candidate')
  check(
    await conflictCard.locator('.star-btn').getAttribute('aria-pressed') === 'false'
      && await conflictCard.locator('.pass-btn').getAttribute('aria-pressed') === 'true',
    'Create shows the current-project pass without inheriting another-project like state',
  )
  await conflictCard.locator('.star-btn').click()
  let counts = await storedCounts(conflictPage)
  check(
    counts.liked === 2
      && counts.passed === 0
      && await conflictCard.locator('.star-btn').getAttribute('aria-pressed') === 'true',
    'same-project star clears only the current pass and preserves the other-project like',
  )

  await conflictPage.evaluate(() => localStorage.removeItem('neologism:recent'))
  await conflictPage.reload()
  await conflictPage.locator('.command-input').fill(PROMPT)
  await conflictPage.locator('.command-go').click()
  await conflictPage.waitForSelector('.name-card', { timeout: 20000 })
  const restoredCard = conflictPage.locator('.name-card').filter({ hasText: name })
  counts = await storedCounts(conflictPage)
  check(
    counts.liked === 2
      && await restoredCard.locator('.star-btn').getAttribute('aria-pressed') === 'true',
    'contextual Create feedback survives reload without collapsing duplicate spellings',
  )
  await restoredCard.locator('.pass-btn').click()
  counts = await storedCounts(conflictPage)
  check(
    counts.liked === 1
      && counts.passed === 1
      && await restoredCard.locator('.pass-btn').getAttribute('aria-pressed') === 'true',
    'same-project pass removes only its matching like and leaves project A intact',
  )
  await conflictContext.close()

  const otherPass = {
    ...explicit,
    tasteContext: { ...explicit.tasteContext, id: 'project-b', description: 'project-b' },
  }
  const neutralContext = await createContext([otherLike], [otherPass])
  const neutralPage = await generateCreatePage(neutralContext)
  const neutralCard = neutralPage.locator('.name-card').filter({ hasText: name })
  check(
    await neutralCard.locator('.star-btn').getAttribute('aria-pressed') === 'false'
      && await neutralCard.locator('.pass-btn').getAttribute('aria-pressed') === 'false'
      && (await storedCounts(neutralPage)).liked === 1
      && (await storedCounts(neutralPage)).passed === 1,
    'project C stays neutral while the same spelling keeps project A like and project B pass',
  )
  await neutralContext.close()
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('Create taste identity e2e: all checks passed')
}
