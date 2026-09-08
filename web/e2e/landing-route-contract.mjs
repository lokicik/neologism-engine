import { runUiTest } from './ui-test-utils.mjs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const out = resolve(process.env.UI_EVIDENCE_DIR ?? '../docs/landing-restore-2026-09-07/screenshots')
await mkdir(out, { recursive: true })
await runUiTest(4258, async ({ browser, url, check }) => {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, reducedMotion: 'reduce' })
    // Old visited/history state must not hide the restored home route.
    await context.addInitScript(() => {
      localStorage.setItem('neologism:visited', '1')
      history.replaceState({ neologismView: 'create' }, '', location.href)
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.goto(url)
    await page.locator('.landing').waitFor()
    await page.waitForFunction(() => document.querySelector('.decode-name')?.textContent.trim().length > 0)
    check(await page.getByRole('navigation', { name: 'Application navigation' }).isHidden() && await page.locator('.discovery-card').count() === 0, `${width}px: root shows only the landing, despite old visit state`)
    check(await page.locator('.landing').evaluate(node => !node.closest('.shell, .page') && document.documentElement.scrollWidth <= innerWidth), `${width}px: original landing stands outside the app frame without overflow`)
    check((await page.title()) === 'Neologism Engine — Startup & Project Name Generator', `${width}px: landing keeps its original page title`)
    await page.evaluate(() => document.fonts.ready)
    const readWordmark = node => {
      const text = getComputedStyle(node)
      const icon = node.querySelector('svg')
      const svg = getComputedStyle(icon)
      return { markup: node.innerHTML, font: text.font, color: text.color, gap: text.gap, icon: { color: svg.color, width: svg.width, height: svg.height, display: svg.display } }
    }
    const landingWordmark = await page.locator('.landing-nav .brand-wordmark').evaluate(readWordmark)
    await page.screenshot({ path: resolve(out, `landing-${width}.png`), fullPage: true })

    const enter = page.getByRole('button', { name: 'Open app' })
    if (width === 1440) { await enter.focus(); await page.keyboard.press('Enter') }
    else await enter.click()
    await page.waitForFunction(() => document.querySelectorAll('.discovery-card').length === 10)
    const input = page.locator('.create-page .command-input')
    check(new URL(page.url()).searchParams.get('view') === 'create' && await page.locator('.landing').count() === 0, `${width}px: landing action enters real Auto discovery`)
    check(JSON.stringify(await page.locator('.app-wordmark .brand-wordmark').evaluate(readWordmark)) === JSON.stringify(landingWordmark), `${width}px: landing and app use the same logo and typography`)
    check(await input.evaluate((node, keyboard) => (document.activeElement === node) === keyboard, width === 1440), `${width}px: entry focus respects keyboard versus pointer`)
    await page.locator('.command-go').click()
    await page.waitForFunction(() => document.querySelectorAll('.discovery-card').length === 20)
    const names = await page.locator('.discovery-name').allTextContents()
    await input.fill('a background job manager')
    await page.evaluate(() => scrollTo(0, 400))
    const position = await page.evaluate(() => scrollY)
    await page.getByRole('button', { name: 'Neologism — Home', exact: true }).click()
    check(new URL(page.url()).search === '' && await page.locator('.landing').isVisible(), `${width}px: the app wordmark returns home`)
    await page.getByRole('button', { name: 'Open app' }).click()
    await page.waitForFunction(y => Math.abs(scrollY - y) < 5, position)
    check(JSON.stringify(await page.locator('.discovery-name').allTextContents()) === JSON.stringify(names) && await input.inputValue() === 'a background job manager', `${width}px: returning keeps the discovery, draft, and scroll position`)
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.discovery-card').length === 20)
    check(new URL(page.url()).searchParams.get('view') === 'create' && await input.inputValue() === 'a background job manager', `${width}px: explicit Create reload keeps its session`)
    await page.goBack()
    check(await page.locator('.landing').isVisible(), `${width}px: browser Back returns to the landing`)
    await page.goto(url + '/?view=about')
    check(await page.locator('.landing').isVisible() && await page.getByRole('navigation', { name: 'Application navigation' }).isHidden(), `${width}px: existing About links still open the standalone landing`)
    check(errors.length === 0, `${width}px: landing and discovery navigation have no uncaught errors`)
    await context.close()
  }
})
