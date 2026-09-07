// The original finalist-first Create contract is retained at commit 585e623.
// Create now exposes Auto's full page; the legacy shortlist algorithm remains
// unchanged and is checked separately below for research/Lab consumers.
import { runUiTest } from './ui-test-utils.mjs'
await runUiTest(4231, async ({ browser, url, check }) => {
  const page = await browser.newPage()
  await page.goto(url)
  await page.waitForSelector('.discovery-card')
  check(await page.locator('.discovery-card').count() === 10, 'Create shows ten real Auto names directly')
  check(await page.locator('.finalist, .shortlist-reveal, .create-page .card-score').count() === 0, 'Create has one list without finalists, score badges, or Show all')
  const rows = await page.evaluate(async () => {
    const { generateDiscoveryPage, DEFAULT_CONFIG } = await import('/src/lib/discovery-generation.ts')
    const { pickShortlist, advocacyFor, contextsFor } = await import('/src/lib/shortlist.ts')
    const { cratesTaken } = await import('/src/lib/engine.ts')
    const rows = []
    for (const description of ['', 'a self hosted password manager', 'a terminal log viewer']) {
      const batch = await generateDiscoveryPage({ ...DEFAULT_CONFIG, description }, { favorites: [], rejected: [], references: '', recent: [], seed: 42, salt: 42, append: false })
      const finalists = pickShortlist(batch, cratesTaken)
      rows.push({ description, finalists: finalists.map(item => ({ name: item.name, text: advocacyFor(item), contexts: contextsFor(item.name), chain: item.reasonChain })), hasChain: batch.some(item => item.reasonChain) })
    }
    return rows
  })
  for (const row of rows) {
    const label = row.description || 'promptless'
    check(row.finalists.length >= 2 && row.finalists.length <= 4, `${label}: retained shortlist holds two to four finalists`)
    check(row.finalists.every(item => item.text.trim().length > 0), `${label}: retained finalists have explanations`)
    check(row.finalists.every(item => item.contexts.length === 3 && item.contexts.every(context => context.text.includes(item.name.toLowerCase()))), `${label}: retained finalists keep three naming contexts`)
    const arguable = row.finalists.filter(item => item.text.includes('—') || item.text.includes('=') && !item.text.includes('canon suffix')).length
    check(row.description === '' ? arguable >= 2 : !row.hasChain || arguable >= 1, `${label}: unchanged legacy explanation gate`)
  }
})
