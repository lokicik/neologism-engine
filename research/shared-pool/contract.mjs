import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { withBrowser, dir } from './harness.mjs'

await withBrowser(async (page) => {
  const failures = []
  page.on('pageerror', (e) => failures.push(String(e)))
  const checks = await page.evaluate(async () => {
    const { selectCandidates, poolRejection, generateCandidatePool, familyOrder } = await import('/src/lib/candidate-pool.ts')
    const checks = []
    const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label) }
    const make = (name, family = 'brandable', rank = 1) => ({ id: name.toLowerCase(), name, collision: 'snapshot_absent', sources: [{ family, rank, result: { name, style: 'big_tech', syllables: 2, score_pronounce: 80, score_memorability: 80, score_novelty: 80, connotations: [] }, meaning: { status: 'missing', conceptCoverage: 0 }, explanation: {} }] })
    const cfg = { style: 'big_tech', min_len: 4, max_len: 12, description: 'a note taking app with backlinks', seed: 67, temperature: 0.85, variety: 0.3, roots: [] }
    check(selectCandidates([], 13).finalists.length === 0, 'empty pool stays empty')
    check(selectCandidates([make('Alpha')], 13).finalists.length === 1, 'single finalist is not padded')
    check(selectCandidates([make('Alpha'), make('Bravo', 'brandable', 2), make('Cedar', 'brandable', 3)], 13).finalists.length === 2, 'family cap of two')
    const samples = [make('Alpha'), make('Alpine', 'reason'), make('Bravo', 'seamblend'), make('Cedar', 'morpheme'), make('Delta', 'submorph'), make('Foxtrot', 'compound')]
    const selected = selectCandidates(samples, 13, 999)
    check(selected.finalists.length === 4, 'four-finalist maximum')
    check(new Set(selected.finalists.map((r) => r.proposalId.slice(0, 3))).size === selected.finalists.length, 'distinct openings')
    const changed = structuredClone(samples)
    changed.forEach((p) => p.sources.forEach((s) => { s.result.reasonChain = 'canon suffix or an extravagant story'; s.result.score_pronounce = 1; s.explanation = { text: 'changed' } }))
    check(JSON.stringify(selected.finalists.map((f) => f.proposalId)) === JSON.stringify(selectCandidates(changed, 13).finalists.map((f) => f.proposalId)), 'explanation and structural scores do not influence selection')
    const duplicate = make('Alpha', 'reason', 2)
    samples[0].sources.push(duplicate.sources[0])
    check(selectCandidates(samples, 13).finalists.filter((f) => f.proposalId === 'alpha').length <= 1, 'merged sources cannot select spelling twice')
    check(new Set(Array.from({ length: 10 }, (_, seed) => familyOrder(seed).join(','))).size > 1, 'seed rotates family order')
    const r = make('Alpha').sources[0].result
    check(poolRejection(r, { ...cfg, exclude: ['ALPHA'] }, 'brandable', 'snapshot_absent', []) === 'excluded', 'case-insensitive exclusions')
    check(poolRejection(r, { ...cfg, min_len: 6 }, 'reason', 'snapshot_absent', []) === 'length', 'shared constraints also apply to Reason')
    check(poolRejection(r, { ...cfg, contains: 'zz' }, 'reason', 'snapshot_absent', []) === 'contains', 'contains constraint')
    check(poolRejection(r, { ...cfg, starts_with: 'b' }, 'reason', 'snapshot_absent', []) === 'starts_with', 'prefix constraint')
    check(poolRejection(r, cfg, 'brandable', 'snapshot_hit', []) === 'collision_snapshot', 'snapshot collision is a pool rejection')
    check(poolRejection(r, cfg, 'brandable', 'unknown', []) === undefined, 'unknown evidence is not an invented collision')
    check(poolRejection(r, cfg, 'brandable', 'snapshot_absent', []) === undefined, 'missing meaning evidence does not become a score')
    const clean = (run) => { const copy = structuredClone(run); delete copy.durationMs; copy.families.forEach((f) => delete f.durationMs); return copy }
    const a = await generateCandidatePool(cfg)
    const b = await generateCandidatePool(cfg)
    check(JSON.stringify(clean(a)) === JSON.stringify(clean(b)), 'actual WASM trace, pools and finalists reproduce exactly')
    check(a.families.length === 9 && a.families.every((f) => f.returned <= 24), 'nine bounded family pools')
    check(a.proposals.every((p) => p.sources.length > 0), 'all candidate sources retained')
    check(a.trace.filter((t) => t.stage === 'selection').length === a.proposals.length, 'every pool candidate has a selection outcome')
    check(a.families.every((f) => f.observedSpellings >= f.returned), 'internal trace distinguishes observed and returned spellings')
    const continuation = await generateCandidatePool({ ...cfg, exclude: a.finalists.map((f) => f.result.name) })
    check(continuation.finalists.every((f) => !a.finalists.some((old) => old.proposalId === f.proposalId)), 'continuation excludes visible finalists')
    const empty = await generateCandidatePool({ ...cfg, min_len: 12, max_len: 12, starts_with: 'zzzzzz' })
    check(empty.finalists.length === 0, 'impossible constraint returns no filler')
    let invalid = false
    try { await generateCandidatePool({ ...cfg, seed: -1 }) } catch { invalid = true }
    check(invalid, 'invalid seed rejected')
    return checks
  })
  checks.forEach((label) => console.log(`PASS ${label}`))
  await page.getByRole('button', { name: /Open app/ }).click()
  await page.getByRole('button', { name: /Shared pool/ }).click()
  await page.getByRole('textbox', { name: 'Project brief' }).fill('a note taking app with backlinks')
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.locator('.candidate-lab .finalist').first().waitFor({ timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('.candidate-lab')?.getAttribute('aria-busy') === 'false')
  const first = await page.locator('.candidate-lab .finalist-name').allTextContents()
  assert(first.length > 0 && first.length <= 4)
  assert((await page.locator('.candidate-lab .finalist-avail').allTextContents()).every((label) => !/✓ free|✗ taken/.test(label)))
  await page.locator('.candidate-lab').getByRole('button', { name: 'Keep', exact: true }).first().click()
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage)
  await page.screenshot({ path: resolve(dir, 'artifacts/lab-desktop.png'), fullPage: true })
  // Draft edits must not contaminate continuation of the current run.
  await page.getByRole('textbox', { name: 'Project brief' }).fill('a totally different draft brief')
  await page.getByRole('button', { name: 'Next finalists' }).click()
  await page.waitForFunction((names) => {
    const current = [...document.querySelectorAll('.candidate-lab .finalist-name')].map((n) => n.textContent)
    return document.querySelector('.candidate-lab')?.getAttribute('aria-busy') === 'false' && current.length && current.every((n) => !names.includes(n))
  }, first, { timeout: 60000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export experiment' }).click()
  await (await download).saveAs(resolve(dir, 'artifacts/lab-export.json'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /Show all/ }).click()
  assert(await page.locator('.candidate-lab tbody tr').count() > 0)
  await page.screenshot({ path: resolve(dir, 'artifacts/lab-mobile.png') })
  await page.locator('.candidate-lab .finalist-list').screenshot({ path: resolve(dir, 'artifacts/lab-mobile-finalists.png') })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile document overflow')
  await page.getByRole('button', { name: /^Auto/ }).click()
  assert.equal(await page.locator('.candidate-lab').count(), 0)
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storage)
  assert.deepEqual(failures, [])
  console.log('PASS Lab interaction, export, continuation, mobile, isolation and return to Auto')
})
