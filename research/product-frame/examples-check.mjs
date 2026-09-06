import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '../../web/node_modules/playwright/index.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v2')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
  await page.goto(pathToFileURL(resolve(out, 'examples.html')).href)
  assert.equal(await page.locator('section').count(), 12)
  assert.equal(await page.locator('a[href="blind-evaluation.html"]').count(), 1)
  await page.screenshot({ path: resolve(out, 'examples-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: resolve(out, 'examples-mobile.png') })
  console.log('PASS 12 complete comparisons, collector link and responsive layout')
} finally { await browser.close() }
