import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const web = dirname(dirname(fileURLToPath(import.meta.url)))
const port = 4252
const server = spawn(process.execPath, [join(web, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'pipe', windowsHide: true })
await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Dev server timed out')), 20000); server.stdout.on('data', data => { if (data.toString().includes(String(port))) { clearTimeout(timer); resolve() } }); server.on('exit', () => reject(new Error('Dev server exited'))) })
const browser = await chromium.launch()
const errors = []
let checks = 0
const check = (condition, label) => { assert(condition, label); checks++; console.log('PASS ' + label) }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:${port}/`)
  const items = page.locator('.discovery-item')
  const names = () => items.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
  const count = n => page.waitForFunction(n => document.querySelectorAll('.discovery-item').length === n, n)
  await count(10)
  await page.waitForTimeout(500)
  check(await items.count() === 10, 'initial Auto loads exactly one ten-name page')
  check(await page.locator('.command-go').innerText() === 'More names', 'unchanged brief offers More names')
  await page.locator('.command-go').click()
  await count(20)
  const twenty = await names()
  check(new Set(twenty.map(name => name.toLowerCase())).size === 20, 'explicit append keeps twenty distinct names')
  check(await page.locator('#discovery-name-10').evaluate(node => document.activeElement === node), 'explicit append focuses the new section')
  const y = await page.evaluate(() => scrollY)
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForTimeout(150)
  check(JSON.stringify(await names()) === JSON.stringify(twenty), 'navigation preserves the discovery')
  check(Math.abs(await page.evaluate(() => scrollY) - y) < 5, 'navigation restores scroll position')
  await page.reload()
  await count(20)
  await page.waitForTimeout(200)
  check(JSON.stringify(await names()) === JSON.stringify(twenty), 'same-tab reload restores exact names')
  check(Math.abs(await page.evaluate(() => scrollY) - y) < 5, 'reload restores scroll position')
  await page.locator('.command-input').fill('a terminal log viewer')
  check(await page.locator('.command-go').innerText() === 'Generate', 'edited draft offers Generate')
  await page.mouse.wheel(0, 10000)
  await page.waitForTimeout(400)
  check(await items.count() === 20, 'dirty draft pauses automatic append')
  await page.locator('.command-go').click()
  await count(10)
  check(await page.locator('.command-go').innerText() === 'More names', 'successful generation commits the new brief')
  const snapshot = await page.evaluate(() => JSON.parse(sessionStorage.getItem('neologism:discovery:v1')))
  check(snapshot.generationConfig.description === 'a terminal log viewer', 'session retains committed brief provenance')
  check(errors.length === 0, 'no uncaught browser errors')
  console.log(`PASS ${checks} discovery checks`)
} finally { await browser.close(); server.kill() }
