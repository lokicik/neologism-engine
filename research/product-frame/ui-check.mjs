import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withBrowser, root } from '../shared-pool/harness.mjs'
const out = resolve(root, 'research/product-frame/artifacts-v2')
await withBrowser(async (page) => {
  await page.setViewportSize({ width: 1280, height: 1200 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.getByRole('button', { name: /Open app/ }).click()
  await page.getByRole('button', { name: /Brief intent/ }).click()
  const option = page.getByRole('checkbox', { name: /Use product benefits/ })
  const relation = page.getByRole('checkbox', { name: /Require operation/ })
  assert.equal(await option.isChecked(), false)
  await relation.check(); await option.check(); assert.equal(await relation.isChecked(), false)
  const brief = 'a terminal tool that tracks memory usage during test runs'
  await page.getByRole('textbox', { name: 'Project brief' }).fill(brief)
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  const ready = () => page.waitForFunction(() => document.querySelector('.candidate-lab')?.getAttribute('aria-busy') === 'false'
    && document.querySelector('.candidate-lab [role="status"]')?.textContent?.includes('distinct candidates'), null, { timeout: 60000 })
  await page.getByRole('button', { name: 'Generate', exact: true }).click(); await ready()
  assert.match(await page.locator('.candidate-lab').innerText(), /Meaning first:.*memory usage/)
  const first = await page.locator('.finalist-name').allTextContents()
  assert(first.length > 0 && first.length <= 4)
  assert.equal(await page.locator('.finalist-score').count(), 0)
  assert((await page.locator('.finalist-avail').allTextContents()).every((t) => /availability unverified/i.test(t)))
  assert.match(await page.locator('.finalist-list').innerText(), /syllables.*(estimate|pronunciation)/)
  await page.screenshot({ path: resolve(out, 'desktop.png'), fullPage: true, animations: 'disabled' })
  await page.locator('.finalist-list').screenshot({ path: resolve(out, 'finalists.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.finalist').getBoundingClientRect().top + scrollY - 100))
  await page.screenshot({ path: resolve(out, 'mobile-finalist.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1280, height: 1200 })
  await page.getByRole('button', { name: 'Keep', exact: true }).first().click()
  await option.uncheck()
  assert.deepEqual(await page.locator('.finalist-name').allTextContents(), first)
  await page.getByRole('textbox', { name: 'Project brief' }).fill('a different draft')
  await page.getByRole('button', { name: 'Next finalists' }).click(); await ready()
  assert((await page.locator('.finalist-name').allTextContents()).every((n) => !first.includes(n)))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export experiment' }).click()
  await (await download).saveAs(resolve(out, 'ui-export.json'))
  const exported = JSON.parse(readFileSync(resolve(out, 'ui-export.json')))
  assert.equal(exported.run.config.description, brief)
  assert.equal(exported.run.config.variant, 'frame_pool')
  assert.equal(exported.run.semantic.object_phrase.surface, 'memory usage')
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage)
  const reveal = page.getByRole('button', { name: /Show all|Inspect rejected pool/ })
  if (await reveal.count()) {
    await reveal.click()
    assert(await page.locator('.candidate-lab tbody tr').count() > 0)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(out, 'mobile.png'), fullPage: true, animations: 'disabled' })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  // Turning the option off changes the next main request, not continuation.
  await page.getByRole('textbox', { name: 'Project brief' }).fill(brief)
  await page.getByRole('button', { name: 'Generate', exact: true }).click(); await ready()
  assert(!(await page.locator('.candidate-lab').innerText()).includes('Meaning first:'))
  await option.check()
  await page.getByRole('textbox', { name: 'Project brief' }).fill('a tool that does not track users')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.candidate-lab')?.getAttribute('aria-busy') === 'false'
    && document.querySelector('.candidate-lab')?.textContent?.includes('Meaning first: unresolved'), null, { timeout: 60000 })
  assert.equal(await page.locator('.finalist').count(), 0)
  assert(await page.getByRole('button', { name: 'Next finalists' }).isDisabled())
  assert.match(await page.locator('.candidate-lab').innerText(), /unresolved/)
  await page.getByRole('button', { name: /^Auto/ }).click()
  assert.equal(await page.locator('.candidate-lab').count(), 0)
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage)
  assert.deepEqual(errors, [])
  writeFileSync(resolve(out, 'ui-verification.json'), JSON.stringify({ passed: true, syntheticChoices: true,
    checks: ['exclusive next-request options', 'phrase display', 'pronunciation provenance', 'no aesthetic rating', 'continuation snapshot', 'export', 'pool inspection', 'mobile overflow', 'unresolved brief', 'saved data unchanged', 'return to Auto'] }, null, 2))
  console.log('PASS meaning-first UI, continuation, export, mobile, errors and saved-data isolation')
})


