import { runUiTest } from './ui-test-utils.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const out = resolve(process.env.UI_EVIDENCE_DIR ?? '../docs/uiux-2026-09-07/screenshots')
await mkdir(out, { recursive: true })
await runUiTest(4255, async ({ browser, url, check }) => {
  const measurements = []
  for (const width of [320, 390, 768, 1251, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(url)
    await page.waitForFunction(() => document.querySelectorAll('.discovery-card').length === 10)
    await page.evaluate(() => document.fonts.ready)
    const geometry = await page.evaluate(() => {
      const grid = document.querySelector('.discovery-grid')
      const controls = [...document.querySelectorAll('.app-nav button, .app-nav summary, .command-go, .discovery-actions button, .generation-options > summary')].filter(node => node.getBoundingClientRect().width)
      return { overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, smallTargets: controls.filter(node => { const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).map(node => node.textContent), font: getComputedStyle(document.querySelector('.command-input')).fontFamily, reducedMotion: getComputedStyle(document.querySelector('.discovery-card')).transitionDuration }
    })
    check(!geometry.overflow && geometry.columns === (width >= 1100 ? 3 : width >= 700 ? 2 : 1), `${width}px: no horizontal overflow and expected columns`)
    check(!geometry.smallTargets.length && geometry.font.includes('Inter') && geometry.reducedMotion === '0s', `${width}px: 44px targets, inherited fonts, and reduced motion`)
    await page.screenshot({ path: resolve(out, `create-${width}.png`), fullPage: true })
    await page.locator('.discovery-card').first().getByRole('button', { name: /Details for/ }).click()
    await page.getByRole('dialog').waitFor()
    const drawer = await page.getByRole('dialog').boundingBox()
    check(width >= 700 || Math.abs(drawer.width - width) <= 16, `${width}px: Details fits the viewport`)
    await page.keyboard.press('Tab')
    check(await page.getByRole('dialog').evaluate(node => node.contains(document.activeElement)), `${width}px: keyboard focus stays in Details`)
    if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(out, `details-${width}.png`) })
    await page.keyboard.press('Escape')
    if ([390, 1440].includes(width)) {
      for (let i = 0; i < 5; i++) await page.locator('.discovery-card').nth(i).locator('.save-name').click()
      await page.getByRole('button', { name: /^Saved/ }).first().click()
      for (let i = 0; i < 3; i++) await page.getByRole('checkbox').nth(i).check()
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: resolve(out, `saved-${width}.png`), fullPage: true })
      await page.getByRole('button', { name: 'Compare (3)', exact: true }).click()
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: comparison scroll stays inside its dialog`)
      await page.screenshot({ path: resolve(out, `compare-${width}.png`) })
      await page.keyboard.press('Escape')
    }
    measurements.push({ width, ...geometry, drawer })
    await context.close()
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(url)
  await page.waitForSelector('.discovery-card')
  const contrasts = await page.evaluate(() => {
    const rgb = value => value.match(/[\d.]+/g).map(Number).slice(0, 3).map(n => n / 255)
    const luminance = color => rgb(color).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    return ['.discovery-name', '.discovery-hint', '.command-go', '.command-input', '.discovery-actions button'].map(selector => {
      const node = document.querySelector(selector); let parent = node
      while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement
      const fg = getComputedStyle(node).color; const bg = getComputedStyle(parent ?? document.body).backgroundColor
      const l = [luminance(fg), luminance(bg)].sort((a,b) => b-a)
      return { selector, fg, bg, ratio: (l[0]+.05)/(l[1]+.05) }
    })
  })
  check(contrasts.every(row => row.ratio >= 4.5), 'rendered primary text and controls meet 4.5:1 contrast')
  await page.locator('.discovery-card').first().getByRole('button', { name: /Details for/ }).click()
  await page.waitForSelector('.why-scores')
  const detailText = await page.locator('.why-scores').evaluate(node => {
    const style = getComputedStyle(node)
    const fg = style.color
    const bg = getComputedStyle(node.closest('dialog')).backgroundColor
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    const light = [luminance(fg), luminance(bg)].sort((a,b) => b-a)
    return { fg, bg, ratio: (light[0]+.05)/(light[1]+.05), opacity: Number(style.opacity), fontSize: parseFloat(style.fontSize) }
  })
  check(detailText.ratio >= 4.5 && detailText.opacity === 1 && detailText.fontSize >= 14, 'Details estimates remain readable without inherited small faint text')
  await page.keyboard.press('Escape')
  // A rendering fixture, not 500 generated quality examples.
  const fixture = await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem('neologism:discovery:v1'))
    data.results = Array.from({ length: 500 }, (_, index) => ({ ...data.results[index % data.results.length], name: `FixtureName${String(index).padStart(3, '0')}` }))
    data.results[0].name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZAB'
    data.scrollY = 0
    return data
  })
  await page.addInitScript(data => sessionStorage.setItem('neologism:discovery:v1', JSON.stringify(data)), fixture)
  const start = performance.now()
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.discovery-card').length === 500)
  const renderMs = performance.now() - start
  const inputStart = performance.now()
  await page.locator('.command-input').fill('a queue manager')
  await page.waitForFunction(() => document.querySelector('.command-go').textContent === 'Generate')
  const inputMs = performance.now() - inputStart
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '500-card fixture and an 80-character name do not overflow')
  check(renderMs < 5000 && inputMs < 500, '500-card restore and editing remain responsive on this host')
  await writeFile(resolve(out, '../measurements.json'), JSON.stringify({ viewports: measurements, contrasts, detailText, performance: { fixtureCards: 500, renderMs, inputMs, context: 'Isolated Chromium on the development host; no CPU throttling.' } }, null, 2))
})
