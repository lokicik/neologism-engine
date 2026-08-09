// Compare first-card ordering strategies on repaired cold Auto pages before
// the targeted final-gap retry. Every strategy keeps the same ten-name set;
// this isolates ordering from generation, quality repair, and set changes.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4195
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

const quality = (item) => (
  item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
)
const letters = (value) => value.toLowerCase().replace(/[^a-z]/g, '')
const isDirectSuffix = (item) => (
  item.sourceMode === 'brandable'
  && item.concept_coverage === 1
  && DIRECT_SUFFIXES.some((suffix) => letters(item.name).endsWith(suffix))
)

function move(items, from, to) {
  if (from < 0 || from === to) return items.slice()
  const next = items.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function promoteQualifiedNonSuffix(items, qualityMargin = 0) {
  const firstQuality = quality(items[0])
  const firstCoverage = items[0].concept_coverage ?? 0
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (
      !isDirectSuffix(item)
      && quality(item) >= firstQuality + qualityMargin
      && (item.concept_coverage ?? 0) >= firstCoverage
    ))
    .sort((left, right) => quality(right.item) - quality(left.item))
  return move(items, candidates[0]?.index ?? -1, 0)
}

function promoteAestheticAlternative(items, qualityTolerance, includeGuided) {
  if (!isDirectSuffix(items[0])) return items.slice()
  const firstQuality = quality(items[0])
  const firstCoverage = items[0].concept_coverage ?? 0
  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (
      !isDirectSuffix(item)
      && quality(item) >= firstQuality - qualityTolerance
      && (item.concept_coverage ?? 0) >= firstCoverage
      && (
        (item.concept_coverage ?? 0) > firstCoverage
        || (includeGuided && item.construction === 'guided_metaphor')
      )
    ))
    .sort((left, right) => (
      (right.item.concept_coverage ?? 0) - (left.item.concept_coverage ?? 0)
      || quality(right.item) - quality(left.item)
      || left.index - right.index
    ))
  return move(items, candidates[0]?.index ?? -1, 0)
}

const strategies = {
  baseline: (items) => items.slice(),
  best_first: (items) => {
    const index = items.reduce((best, item, current) => (
      quality(item) > quality(items[best]) ? current : best
    ), 0)
    return move(items, index, 0)
  },
  primary_guided_first: (items) => move(
    items,
    items.findIndex((item) => item.constructionRank === 1),
    0,
  ),
  best_guided_first: (items) => {
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.construction === 'guided_metaphor')
      .sort((left, right) => quality(right.item) - quality(left.item))
    return move(items, candidates[0]?.index ?? -1, 0)
  },
  qualified_guided_first: (items) => {
    const firstQuality = quality(items[0])
    const firstCoverage = items[0].concept_coverage ?? 0
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (
        item.construction === 'guided_metaphor'
        && quality(item) >= firstQuality
        && (item.concept_coverage ?? 0) >= firstCoverage
      ))
      .sort((left, right) => quality(right.item) - quality(left.item))
    return move(items, candidates[0]?.index ?? -1, 0)
  },
  qualified_guided_coverage_first: (items) => {
    const firstQuality = quality(items[0])
    const firstCoverage = items[0].concept_coverage ?? 0
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (
        item.construction === 'guided_metaphor'
        && quality(item) >= firstQuality
        && (item.concept_coverage ?? 0) >= firstCoverage
      ))
      .sort((left, right) => (
        (right.item.concept_coverage ?? 0) - (left.item.concept_coverage ?? 0)
        || quality(right.item) - quality(left.item)
        || left.index - right.index
      ))
    return move(items, candidates[0]?.index ?? -1, 0)
  },
  qualified_non_suffix_first: (items) => promoteQualifiedNonSuffix(items),
  guided_then_non_suffix: (items) => {
    const guided = strategies.qualified_guided_first(items)
    if (guided[0].name !== items[0].name) return guided
    if (!isDirectSuffix(guided[0])) return guided
    return strategies.qualified_non_suffix_first(items)
  },
  guided_then_non_suffix_plus_one: (items) => {
    const guided = strategies.qualified_guided_first(items)
    if (guided[0].name !== items[0].name || !isDirectSuffix(guided[0])) return guided
    return promoteQualifiedNonSuffix(items, 1)
  },
  guided_then_non_suffix_plus_two: (items) => {
    const guided = strategies.qualified_guided_first(items)
    if (guided[0].name !== items[0].name || !isDirectSuffix(guided[0])) return guided
    return promoteQualifiedNonSuffix(items, 2)
  },
  guided_coverage_then_non_suffix_plus_two: (items) => {
    const guided = strategies.qualified_guided_coverage_first(items)
    if (guided[0].name !== items[0].name || !isDirectSuffix(guided[0])) return guided
    return promoteQualifiedNonSuffix(items, 2)
  },
  strong_coverage_first: (items) => {
    if (!isDirectSuffix(items[0])) return strategies.qualified_guided_first(items)
    const firstQuality = quality(items[0])
    const firstCoverage = items[0].concept_coverage ?? 0
    const candidates = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (
        (item.concept_coverage ?? 0) >= firstCoverage
        && (
          (item.construction === 'guided_metaphor' && quality(item) >= firstQuality)
          || (!isDirectSuffix(item) && quality(item) >= firstQuality + 2)
        )
      ))
      .sort((left, right) => (
        (right.item.concept_coverage ?? 0) - (left.item.concept_coverage ?? 0)
        || quality(right.item) - quality(left.item)
        || left.index - right.index
      ))
    return move(items, candidates[0]?.index ?? -1, 0)
  },
  retained_then_semantic_half: (items) => promoteAestheticAlternative(
    strategies.guided_then_non_suffix_plus_two(items), 0.5, false,
  ),
  retained_then_semantic_one: (items) => promoteAestheticAlternative(
    strategies.guided_then_non_suffix_plus_two(items), 1, false,
  ),
  retained_then_semantic_or_guided_half: (items) => promoteAestheticAlternative(
    strategies.guided_then_non_suffix_plus_two(items), 0.5, true,
  ),
  coverage_first_then_semantic_or_guided_half: (items) => promoteAestheticAlternative(
    strategies.guided_coverage_then_non_suffix_plus_two(items), 0.5, true,
  ),
  strong_coverage_then_semantic_or_guided_half: (items) => promoteAestheticAlternative(
    strategies.strong_coverage_first(items), 0.5, true,
  ),
  retained_then_semantic_or_guided_one: (items) => promoteAestheticAlternative(
    strategies.guided_then_non_suffix_plus_two(items), 1, true,
  ),
  retained_then_semantic_or_guided_two: (items) => promoteAestheticAlternative(
    strategies.guided_then_non_suffix_plus_two(items), 2, true,
  ),
  guided_in_top_three: (items) => {
    if (items.slice(0, 3).some((item) => item.construction === 'guided_metaphor')) return items.slice()
    const index = items.findIndex((item) => item.construction === 'guided_metaphor')
    return move(items, index, 2)
  },
}

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
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}`)
  const rows = await page.evaluate(async ({ prompts, seeds }) => {
    const { generateBatch, generateNames } = await import('/src/lib/engine.ts')
    const {
      coldQualityPoolCount,
      needsQualityRepair,
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
        const fallback = needsQualityRepair(direct, 10)
          ? await generateNames({
              ...config,
              variant: undefined,
              compound: false,
              count: coldQualityPoolCount(10),
              exclude: direct.map((item) => item.name),
            })
          : []
        output.push({
          prompt,
          seed,
          direct,
          fallback,
          items: repairWeakShortlist(direct, fallback, 10),
        })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  console.log('strategy · changed · first q · regret · first guided · guided top3 · first suffix · first coverage')
  for (const [label, strategy] of Object.entries(strategies)) {
    let changed = 0
    let firstQuality = 0
    let regret = 0
    let firstGuided = 0
    let guidedTop3 = 0
    let firstSuffix = 0
    let firstCoverage = 0
    for (const row of rows) {
      const selected = strategy(row.items)
      const best = Math.max(...selected.map(quality))
      changed += Number(selected.map((item) => item.name).join('|') !== row.items.map((item) => item.name).join('|'))
      firstQuality += quality(selected[0])
      regret += best - quality(selected[0])
      firstGuided += Number(selected[0].construction === 'guided_metaphor')
      guidedTop3 += Number(selected.slice(0, 3).some((item) => item.construction === 'guided_metaphor'))
      firstSuffix += Number(isDirectSuffix(selected[0]))
      firstCoverage += selected[0].concept_coverage ?? 0
    }
    console.log(
      `${label} · ${changed}/90 · ${(firstQuality / 90).toFixed(2)} · ${(regret / 90).toFixed(2)} · ${firstGuided}/90 · ${guidedTop3}/90 · ${firstSuffix}/90 · ${(firstCoverage / 90).toFixed(2)}`,
    )
  }

  const guardedSuffixPages = rows.filter((row) => (
    isDirectSuffix(strategies.qualified_guided_first(row.items)[0])
  ))
  const blockerCounts = { no_guided: 0, quality: 0, coverage: 0, quality_and_coverage: 0 }
  for (const row of guardedSuffixPages) {
    const first = row.items[0]
    const guided = row.items.filter((item) => item.construction === 'guided_metaphor')
    if (guided.length === 0) {
      blockerCounts.no_guided++
      continue
    }
    const qualityPass = guided.some((item) => quality(item) >= quality(first))
    const coveragePass = guided.some((item) => (
      (item.concept_coverage ?? 0) >= (first.concept_coverage ?? 0)
    ))
    if (!qualityPass && !coveragePass) blockerCounts.quality_and_coverage++
    else if (!qualityPass) blockerCounts.quality++
    else blockerCounts.coverage++
  }
  console.log(`guided blockers on ${guardedSuffixPages.length} remaining suffix leads: ${JSON.stringify(blockerCounts)}`)

  console.log('\nadditional suffix-only promotions')
  for (const row of rows) {
    const guided = strategies.qualified_guided_first(row.items)
    const expanded = strategies.guided_then_non_suffix(row.items)
    if (guided[0].name !== expanded[0].name) {
      console.log(`${row.seed} · ${row.prompt}: ${guided[0].name}:${quality(guided[0]).toFixed(1)}/c${guided[0].concept_coverage ?? 0} -> ${expanded[0].name}:${quality(expanded[0]).toFixed(1)}/c${expanded[0].concept_coverage ?? 0}`)
    }
  }

  console.log('\nremaining suffix leads after retained +2 strategy')
  for (const row of rows) {
    const selected = strategies.guided_then_non_suffix_plus_two(row.items)
    if (!isDirectSuffix(selected[0])) continue
    const describe = (item) => (
      `${item.name}:${quality(item).toFixed(1)}/c${item.concept_coverage ?? 0}`
      + `${item.construction === 'guided_metaphor' ? '/guided' : ''}`
    )
    const alternatives = row.items
      .filter((item) => !isDirectSuffix(item))
      .sort((left, right) => quality(right) - quality(left))
      .slice(0, 4)
      .map(describe)
    console.log(
      `${row.seed} · ${row.prompt}: ${describe(selected[0])}`
      + ` | alternatives ${alternatives.join(', ') || 'none'}`
      + ` | direct ${row.direct.length} fallback ${row.fallback.length}`,
    )
  }

  console.log('\nnear-tie tolerance changes beyond retained +2 strategy')
  for (const label of [
    'retained_then_semantic_half',
    'retained_then_semantic_one',
    'retained_then_semantic_or_guided_half',
    'retained_then_semantic_or_guided_one',
    'retained_then_semantic_or_guided_two',
  ]) {
    console.log(label)
    for (const row of rows) {
      const retained = strategies.guided_then_non_suffix_plus_two(row.items)
      const selected = strategies[label](row.items)
      if (retained[0].name === selected[0].name) continue
      console.log(
        `  ${row.seed} · ${row.prompt}: ${retained[0].name}:${quality(retained[0]).toFixed(1)}`
        + `/c${retained[0].concept_coverage ?? 0} -> ${selected[0].name}:${quality(selected[0]).toFixed(1)}`
        + `/c${selected[0].concept_coverage ?? 0}`,
      )
    }
  }

  console.log('\nstrong coverage-first changes versus guided-first production')
  for (const row of rows) {
    const guidedFirst = strategies.retained_then_semantic_or_guided_half(row.items)
    const coverageFirst = strategies.strong_coverage_then_semantic_or_guided_half(row.items)
    if (guidedFirst[0].name === coverageFirst[0].name) continue
    console.log(
      `${row.seed} · ${row.prompt}: ${guidedFirst[0].name}:${quality(guidedFirst[0]).toFixed(1)}`
      + `/c${guidedFirst[0].concept_coverage ?? 0} -> ${coverageFirst[0].name}:${quality(coverageFirst[0]).toFixed(1)}`
      + `/c${coverageFirst[0].concept_coverage ?? 0}`,
    )
  }

  const own = rows.find((row) => row.prompt.startsWith('an offline naming engine') && row.seed === 42)
  console.log('\nown page')
  for (const [label, strategy] of Object.entries(strategies)) {
    console.log(`${label}: ${strategy(own.items).map((item) => item.name).join(', ')}`)
  }

  console.log('\nseed 42 · baseline -> production near-tie strategy')
  for (const row of rows.filter((item) => item.seed === 42)) {
    const selected = strategies.retained_then_semantic_or_guided_half(row.items)
    console.log(`${row.prompt}: ${row.items[0].name} -> ${selected[0].name}`)
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
