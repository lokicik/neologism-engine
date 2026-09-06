import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v3')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
  await page.goto(pathToFileURL(resolve(out, 'examples.html')).href)
  assert.equal(await page.locator('section').count(), 12)
  assert.equal(await page.locator('.names').count(), 36)
  await page.locator('summary').nth(7).click()
  assert.match(await page.locator('section').nth(7).innerText(), /restore, archive, entry/)
  await page.screenshot({ path: resolve(out, 'examples-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: resolve(out, 'examples-mobile.png') })
  console.log('PASS 12 three-way comparisons, source details and responsive layout')
} finally { await browser.close() }
