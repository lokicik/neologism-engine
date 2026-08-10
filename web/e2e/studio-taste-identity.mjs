// Browser contract: AI Studio star state follows project taste identity, not
// global spelling or share-only Saved membership. Run after `npm run build`.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4182
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

async function createContext(favorites = [], importedSaved = []) {
  const context = await browser.newContext()
  await context.addInitScript(({ favorites: liked, imported }) => {
    localStorage.setItem('neologism:visited', '1')
    localStorage.setItem('neologism:judge', JSON.stringify({
      enabled: true,
      provider: 'openrouter',
      apiKey: 'test-key',
      model: 'mock-model',
    }))
    localStorage.setItem('neologism:favorites', JSON.stringify(liked))
    localStorage.setItem('neologism:imported-saved', JSON.stringify(imported))
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
  }, { favorites, imported: importedSaved })
  return context
}

async function mockJudge(page) {
  await page.route('**/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    const content = body.messages?.[0]?.content ?? ''
    const names = [...content.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim())
    const ranked = names.map((_, index) => ({
      i: index + 1,
      score: names.length - index,
      reason: `mock reason ${index + 1}`,
    }))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(ranked) } }] }),
    })
  })
}

async function generateStudioPage(context) {
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  await mockJudge(page)
  await page.goto(APP_URL)
  await page.getByRole('button', { name: /AI Studio/ }).click()
  await page.locator('.ai-studio .command-input').fill(PROMPT)
  await page.locator('.ai-studio .command-go').click()
  await page.waitForSelector('.ai-studio .card-ai-reason', { timeout: 20000 })
  return page
}

try {
  const baselineContext = await createContext()
  const baselinePage = await generateStudioPage(baselineContext)
  const baselineCard = baselinePage.locator('.ai-studio .name-card').first()
  const name = (await baselineCard.locator('.name-text').textContent())?.trim() ?? ''
  await baselineCard.locator('.star-btn').click()
  const explicit = await baselinePage.evaluate(() => {
    const raw = localStorage.getItem('neologism:favorites')
    return raw ? JSON.parse(raw)[0] : null
  })
  check(Boolean(name && explicit?.tasteContext?.id), 'AI Studio stores a generated like with project context')
  await baselineContext.close()

  const importedStub = {
    name,
    style: explicit.style,
    score_pronounce: 0,
    score_novelty: 0,
    score_memorability: 0,
    connotations: [],
    syllables: 0,
  }
  const otherContextLike = {
    ...explicit,
    tasteContext: {
      ...explicit.tasteContext,
      id: 'another-project',
      description: 'another project',
    },
  }
  const isolatedContext = await createContext([otherContextLike], [importedStub])
  const isolatedPage = await generateStudioPage(isolatedContext)
  const isolatedCard = isolatedPage.locator('.ai-studio .name-card').filter({ hasText: name })
  check(await isolatedCard.count() === 1, 'deterministic Studio replay contains the same candidate')
  check(
    await isolatedCard.locator('.star-btn').getAttribute('aria-pressed') === 'false',
    'share-only and another-project records do not light the Studio star',
  )
  await isolatedCard.locator('.star-btn').click()
  const isolatedCounts = await isolatedPage.evaluate(() => ({
    liked: JSON.parse(localStorage.getItem('neologism:favorites') ?? '[]').length,
    imported: JSON.parse(localStorage.getItem('neologism:imported-saved') ?? '[]').length,
  }))
  check(
    isolatedCounts.liked === 2 && isolatedCounts.imported === 1,
    'starring the current Studio candidate adds its context without mutating other sources',
  )
  await isolatedContext.close()

  const matchingContext = await createContext([explicit], [importedStub])
  const matchingPage = await generateStudioPage(matchingContext)
  const matchingCard = matchingPage.locator('.ai-studio .name-card').filter({ hasText: name })
  check(
    await matchingCard.locator('.star-btn').getAttribute('aria-pressed') === 'true',
    'the exact same-project Studio record restores the active star state',
  )
  await matchingContext.close()
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
  console.log('Studio taste identity e2e: all checks passed')
}
