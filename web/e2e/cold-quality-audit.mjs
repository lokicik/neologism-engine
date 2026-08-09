// Fixed-seed production audit for cold Auto's structural quality repair and
// guarded first-card ordering.
// Run from web/: node e2e/cold-quality-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4187
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const PROMPTS = [
  'an offline naming engine for developer projects that checks npm and crates.io',
  'a developer tool that generates names for packages CLIs libraries and projects',
  'a journaling app with mood insights',
  'a secure password manager for teams',
  'an app for splitting expenses with friends',
  'a marketplace for vintage keyboards',
  'a fast analytics dashboard for API performance',
  'a local cache inspector',
  'a guided breathing and rest companion',
  'a simple workout planner',
  'a collaborative document editor',
  'automatic invoice reminders',
  'a ticket inbox for customer service agents',
  'animal health reminders for pet owners',
  'an online marketplace for local sellers',
  'a photo and video editing app',
  'a trip planning and route app',
  'git release automation',
]
const SEEDS = [7, 42, 101, 2024, 9999]
const DIRECT_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
const KNOWN_SUFFIXES = ['ify', 'ora', 'ium', 'ion', 'io', 'ia', 'ix', 'ly', 'ai']
const NEAR_TIE_TOLERANCE = 0.005
const PAIR_SET_QUALITY_FLOOR = 0.84
const BRANDABLE_SET_QUALITY_FLOOR = 0.85
const PAIR_SET_GAIN = 0.02
const EXPECTED_RETRY_CHANGES = [
  'Shieldora -> Kinloom',
  'Sharebond -> TallyBond',
  'Surgeora -> Kitwave',
  'Bufferia -> Bufferlab',
  'Fitio -> FitPath',
  'Pulsetrail -> Pulselab',
]

const server = spawn(process.execPath, [viteCli, '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite dev server did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('vite dev server exited early')))
})

const browser = await chromium.launch()
let failures = 0
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { generateBatch, generateColdLeadRetry, generateNames } = await import('/src/lib/engine.ts')
    const {
      coldQualityPoolCount,
      fillColdLeadRetry,
      needsColdLeadRetry,
      needsQualityRepair,
      prioritizeColdStrongLead,
      repairWeakShortlist,
    } = await import('/src/lib/preferences.ts')
    const output = []
    for (const prompt of prompts) {
      for (const seed of seeds) {
        const config = {
          style: 'big_tech', count: 10, min_len: 4, max_len: 12,
          temperature: 0.85, variety: 0.3, roots: [], variant: 'auto',
          description: prompt, exclude: [], seed,
        }
        const direct = await generateBatch(config)
        const repair = needsQualityRepair(direct, 10)
        const fallback = repair
          ? await generateNames({
              ...config,
              variant: undefined,
              compound: false,
              count: coldQualityPoolCount(10),
              exclude: direct.map((item) => item.name),
            })
          : []
        const repaired = repairWeakShortlist(direct, fallback, 10)
        const ordered = prioritizeColdStrongLead(repaired)
        const retry = needsColdLeadRetry(ordered)
          ? await generateColdLeadRetry(config)
          : []
        const selected = fillColdLeadRetry(ordered, retry, [...direct, ...fallback])
        output.push({
          prompt,
          seed,
          direct,
          repaired,
          selected,
          retryUsed: ordered.map((item) => item.name).join('|') !== selected.map((item) => item.name).join('|'),
          fallbackCount: fallback.length,
        })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  const quality = (item) => (
    0.4 * item.score_pronounce + 0.3 * item.score_memorability + 0.3 * item.score_novelty
  ) / 100
  const editDistance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
        const old = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(a[i - 1] !== b[j - 1]))
        previous = old
      }
    }
    return row[b.length]
  }
  const lexicalSimilarity = (a, b) => {
    const left = a.toLowerCase().replace(/[^a-z]/g, '')
    const right = b.toLowerCase().replace(/[^a-z]/g, '')
    return 1 - editDistance(left, right) / Math.max(left.length, right.length)
  }
  const meanSimilarity = (items) => {
    let total = 0
    let pairs = 0
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        total += lexicalSimilarity(items[i].name, items[j].name)
        pairs++
      }
    }
    return pairs === 0 ? 0 : total / pairs
  }
  const summarize = (field) => {
    const names = rows.flatMap((row) => row[field])
    let nearPairs = 0
    let pairSimilarity = 0
    let pairCount = 0
    for (const row of rows) {
      const items = row[field]
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const overlap = lexicalSimilarity(items[i].name, items[j].name)
          nearPairs += Number(overlap >= 0.72)
          pairSimilarity += overlap
          pairCount++
        }
      }
    }
    return {
      names: names.length,
      averageQuality: names.reduce((sum, item) => sum + quality(item), 0) / names.length * 100,
      below75: names.filter((item) => quality(item) < 0.75).length,
      nearPairs,
      meanPairSimilarity: pairSimilarity / pairCount,
    }
  }

  const direct = summarize('direct')
  const repaired = summarize('selected')
  const repairedPages = rows.filter((row) => row.fallbackCount > 0).length
  const wrongSize = rows.filter((row) => row.selected.length !== 10).length
  const wrongFallback = rows.filter((row) => ![0, 30].includes(row.fallbackCount)).length
  const accentCounts = rows.map((row) => (
    row.selected.filter((item) => item.sourceMode !== 'brandable').length
  ))
  const multipleAccentPages = accentCounts.filter((count) => count > 1).length
  const maxAccents = Math.max(...accentCounts)
  const ownBrief = rows.find((row) => row.prompt.startsWith('an offline naming engine') && row.seed === 42)
  const normalized = (item) => item.name.toLowerCase().replace(/[^a-z]/g, '')
  const familySuffix = (item) => (
    KNOWN_SUFFIXES.find((ending) => normalized(item).endsWith(ending)) ?? normalized(item).slice(-2)
  )
  const isDirectSuffix = (item) => (
    item.sourceMode === 'brandable'
    && item.concept_coverage === 1
    && DIRECT_SUFFIXES.some((suffix) => normalized(item).endsWith(suffix))
  )
  const reorderedPages = rows.filter((row) => row.repaired[0].name !== row.selected[0].name).length
  const originalLeadQuality = rows.reduce((sum, row) => sum + quality(row.repaired[0]), 0) / rows.length * 100
  const selectedLeadQuality = rows.reduce((sum, row) => sum + quality(row.selected[0]), 0) / rows.length * 100
  const selectedLeadCoverage = rows.reduce(
    (sum, row) => sum + (row.selected[0].concept_coverage ?? 0), 0,
  ) / rows.length
  const originalSuffixLeads = rows.filter((row) => isDirectSuffix(row.repaired[0])).length
  const selectedSuffixLeads = rows.filter((row) => isDirectSuffix(row.selected[0])).length
  const isGuided = (item) => (
    item.construction === 'guided_metaphor' || item.construction === 'guided_pair'
  )
  const selectedGuidedLeads = rows.filter((row) => isGuided(row.selected[0])).length
  const orderingChangedSet = rows.filter((row) => (
    row.repaired.map(normalized).sort().join('|') !== row.selected.map(normalized).sort().join('|')
  )).length
  const retryRows = rows.filter((row) => row.retryUsed)
  const retryChanges = retryRows.map((row) => {
    const repairedNames = new Set(row.repaired.map(normalized))
    const selectedNames = new Set(row.selected.map(normalized))
    const unmatchedRemoved = row.repaired.filter((item) => !selectedNames.has(normalized(item)))
    const unmatchedAdded = row.selected.filter((item) => !repairedNames.has(normalized(item)))
    const labels = []
    const similarityPreserved = meanSimilarity(row.selected)
      <= meanSimilarity(row.repaired) + Number.EPSILON
    let valid = unmatchedRemoved.length > 0
      && unmatchedRemoved.length === unmatchedAdded.length
      && !row.repaired.some((item) => item.sourceMode === 'respell')
      && row.selected.filter(isGuided).length <= 2
      && similarityPreserved
    const familySafe = (candidate, includeEnding) => {
      const prefix = normalized(candidate).slice(0, 3)
      const ending = familySuffix(candidate)
      const prefixBefore = row.repaired.filter((item) => normalized(item).startsWith(prefix)).length
      const prefixAfter = row.selected.filter((item) => normalized(item).startsWith(prefix)).length
      const endingBefore = row.repaired.filter((item) => familySuffix(item) === ending).length
      const endingAfter = row.selected.filter((item) => familySuffix(item) === ending).length
      return prefixAfter <= Math.max(2, prefixBefore)
        && (!includeEnding || endingAfter <= Math.max(2, endingBefore))
    }
    const takeMatch = (items, predicate) => {
      const index = items.findIndex(predicate)
      return index < 0 ? undefined : items.splice(index, 1)[0]
    }

    if (normalized(row.repaired[0]) !== normalized(row.selected[0])) {
      const lead = takeMatch(unmatchedAdded, (item) => normalized(item) === normalized(row.selected[0]))
      const semanticPair = lead?.construction === 'guided_pair'
      const replacement = lead && takeMatch(unmatchedRemoved, (item) => (
        isDirectSuffix(item)
        && quality(lead) + (semanticPair ? NEAR_TIE_TOLERANCE : Number.EPSILON)
          >= quality(item)
      ))
      valid = valid
        && Boolean(lead && replacement)
        && isGuided(lead)
        && quality(lead) >= 0.85
        && (lead.concept_coverage ?? 0) >= (replacement?.concept_coverage ?? 0)
        && (!semanticPair || (lead.concept_coverage ?? 0) >= 2)
        && familySafe(lead, false)
      if (lead && replacement) labels.push(`${replacement.name} -> ${lead.name}`)
    }

    while (unmatchedAdded.length > 0) {
      const candidate = unmatchedAdded.shift()
      const semanticPair = candidate.construction === 'guided_pair'
      const ordinaryBrandable = candidate.sourceMode === 'brandable'
        && !isGuided(candidate)
        && !isDirectSuffix(candidate)
        && (candidate.concept_coverage ?? 0) > 0
      const candidateValid = semanticPair
        ? quality(candidate) >= PAIR_SET_QUALITY_FLOOR
          && (candidate.concept_coverage ?? 0) >= 2
        : ordinaryBrandable && quality(candidate) >= BRANDABLE_SET_QUALITY_FLOOR
      const replacement = takeMatch(unmatchedRemoved, (item) => (
        row.repaired.indexOf(item) > 0
        && item.sourceMode === 'brandable'
        && !isGuided(item)
        && quality(candidate) + Number.EPSILON >= quality(item) + PAIR_SET_GAIN
        && (candidate.concept_coverage ?? 0) >= (item.concept_coverage ?? 0)
      ))
      valid = valid
        && candidateValid
        && Boolean(replacement)
        && familySafe(candidate, true)
      if (replacement) labels.push(`${replacement.name} -> ${candidate.name}`)
    }
    valid = valid && unmatchedRemoved.length === 0
    return { valid, labels }
  })
  const retryContractViolations = retryChanges.filter((change) => !change.valid).length
  const retrySwapLabels = retryChanges.flatMap((change) => change.labels)
  const exactRetryChanges = retrySwapLabels.slice().sort().join('|')
    === EXPECTED_RETRY_CHANGES.slice().sort().join('|')
  const weakenedLeadRows = rows.filter((row) => (
    quality(row.selected[0]) + Number.EPSILON < quality(row.repaired[0])
  ))
  const justifiedNearTies = weakenedLeadRows.filter((row) => (
    isDirectSuffix(row.repaired[0])
    && !isDirectSuffix(row.selected[0])
    && quality(row.selected[0]) + NEAR_TIE_TOLERANCE + Number.EPSILON >= quality(row.repaired[0])
    && (row.selected[0].concept_coverage ?? 0) >= (row.repaired[0].concept_coverage ?? 0)
    && (
      (row.selected[0].concept_coverage ?? 0) > (row.repaired[0].concept_coverage ?? 0)
      || row.selected[0].construction === 'guided_metaphor'
    )
  ))
  const unjustifiedWeakenedLeads = weakenedLeadRows.length - justifiedNearTies.length
  const maxLeadQualityLoss = weakenedLeadRows.reduce((max, row) => Math.max(
    max, quality(row.repaired[0]) - quality(row.selected[0]),
  ), 0)
  const weakenedLeadCoverage = rows.filter((row) => (
    (row.selected[0].concept_coverage ?? 0) < (row.repaired[0].concept_coverage ?? 0)
  )).length

  console.log(`cold Auto pages: ${rows.length}`)
  console.log(`repaired pages: ${repairedPages}/${rows.length}`)
  console.log(`direct average quality: ${direct.averageQuality.toFixed(2)}`)
  console.log(`repaired average quality: ${repaired.averageQuality.toFixed(2)}`)
  console.log(`direct / repaired sub-75: ${direct.below75} / ${repaired.below75}`)
  console.log(`repaired near-duplicate pairs: ${repaired.nearPairs}`)
  console.log(`repaired mean pair similarity: ${repaired.meanPairSimilarity.toFixed(3)}`)
  console.log(`multiple-accent pages: ${multipleAccentPages}/${rows.length} (max ${maxAccents})`)
  console.log(`strong lead reorder: ${reorderedPages}/${rows.length} · quality ${originalLeadQuality.toFixed(2)} -> ${selectedLeadQuality.toFixed(2)} · coverage ${selectedLeadCoverage.toFixed(2)} · suffix first ${originalSuffixLeads} -> ${selectedSuffixLeads} · guided first ${selectedGuidedLeads}`)
  console.log(`justified near-tie trades: ${justifiedNearTies.length} · max quality loss ${(maxLeadQualityLoss * 100).toFixed(2)}`)
  console.log(`targeted retry/set changes: ${retrySwapLabels.join(', ') || 'none'}`)
  console.log(`own brief: ${ownBrief.selected.map((item) => `${item.sourceMode}:${item.name}`).join(', ')}`)

  const gates = [
    [wrongSize === 0, 'every repaired cold page contains ten names'],
    [wrongFallback === 0, 'repair uses either no fallback or the bounded 30-name pool'],
    [multipleAccentPages === 0, 'cold repair preserves Auto\'s one-accent visible-page contract'],
    [retryRows.length === 5 && retrySwapLabels.length === 6 && exactRetryChanges, 'the targeted retry closes exactly four fixed gaps and upgrades two weak set cards'],
    [orderingChangedSet === retryRows.length, 'only targeted retry pages change the repaired name set'],
    [retryContractViolations === 0, 'each change is a bounded lead retry or a diversity-safe two-point semantic/Brandable set upgrade'],
    [unjustifiedWeakenedLeads === 0, 'any first-card quality trade stays inside the semantic/guided near-tie rule'],
    [justifiedNearTies.length === 4, 'the fixed matrix contains exactly four justified near-tie promotions'],
    [maxLeadQualityLoss <= NEAR_TIE_TOLERANCE + Number.EPSILON, 'first-card structural quality loss never exceeds half a point'],
    [weakenedLeadCoverage === 0, 'strong lead ordering never lowers first-card concept coverage'],
    [selectedLeadQuality >= 85.4, 'ordered first-card structural quality stays at or above 85.4'],
    [selectedLeadCoverage >= 1.23, 'ordered first-card concept coverage stays at or above 1.23'],
    [selectedSuffixLeads <= 10, 'direct suffix leads stay at or below ten of ninety pages'],
    [direct.below75 === 0 || repairedPages > 0, 'weak pages activate the offline repair pool'],
    [repaired.below75 === 0, 'no repaired cold Auto name falls below 75 structural quality'],
    [repaired.averageQuality >= 82.5, 'repaired cold Auto quality stays at or above 82.5'],
    [repaired.nearPairs <= 43, 'repaired cold Auto near-duplicate pairs do not exceed the prior baseline'],
    [repaired.meanPairSimilarity <= 0.21, 'repaired cold Auto mean pair similarity stays at or below 0.21'],
  ]
  for (const [ok, label] of gates) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    failures += Number(!ok)
  }
} catch (error) {
  console.error('SCRIPT ERROR:', error.message)
  failures++
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}

if (failures > 0) {
  console.error(`${failures} cold quality gate(s) failed`)
  process.exitCode = 1
} else {
  console.log('cold Auto quality audit: all gates passed')
}
