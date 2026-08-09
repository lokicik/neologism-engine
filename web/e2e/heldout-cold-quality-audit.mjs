// Production-path cold Auto audit on prompts and seeds kept outside the fixed
// calibration matrix. Use this to discover general quality gaps without tuning
// another rule against the same 90 pages.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4200
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const BASE_PROMPTS = [
  'candidate tracking software for recruiters',
  'a weekly menu and grocery organizer',
  'a catalog for household belongings',
  'property discovery for home buyers',
  'conference booking and attendee check-in',
  'local rain and temperature alerts',
  'routine and streak coaching',
  'a customer relationship pipeline for sales representatives',
  'a mindfulness timer for sleep and breath',
  'a veterinary appointment and pet wellness tracker',
  'a personal budget and expense tracker',
  'a private mood journal',
  'a community chat app',
  'a color palette and visual design tool',
  'a task and calendar planner',
  'an online course and study app',
  'a delivery tracking and logistics app',
  'an AI assistant for workflow automation',
  'a fast performance monitor',
  'a naming tool for new products',
  'a CLI for database migrations',
  'an API rate limiting library',
  'a terminal log viewer',
  'a browser bookmark manager',
  'an API testing toolkit',
  'a cloud deployment dashboard',
  'a message queue client',
  'a code formatter and linter',
  'an environment variable manager',
  'a filesystem search CLI',
  'a feature flag service',
  'a background job scheduler',
  'dependency update automation',
  'a documentation site generator',
  'legal research for court cases',
]
const AI_VARIANTS = [
  'workflow automation assistant powered by AI',
  'automated workflows with an AI assistant',
  'an AI automation agent',
  'an autonomous agent workflow builder',
]
const PROMPTS = [...BASE_PROMPTS, ...AI_VARIANTS]
const SEEDS = [13, 67, 313]
const DIRECT_SUFFIXES = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']

const server = spawn(process.execPath, [viteCli, '--port', String(PORT), '--strictPort'], {
  cwd: WEB_DIR,
  stdio: 'pipe',
})
let serverError = ''
server.stderr.on('data', (data) => {
  serverError += data.toString()
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite dev server did not start')), 20000)
  server.stdout.on('data', (data) => {
    if (data.toString().includes(String(PORT))) {
      clearTimeout(timer)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error(serverError || 'vite dev server exited early')))
})

const browser = await chromium.launch()
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
        const fallback = needsQualityRepair(direct, 10)
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
        const retryRequested = needsColdLeadRetry(ordered)
        const retry = retryRequested ? await generateColdLeadRetry(config) : []
        const selected = fillColdLeadRetry(ordered, retry, [...direct, ...fallback])
        output.push({
          prompt,
          seed,
          direct,
          repaired,
          ordered,
          retry,
          retryRequested,
          selected,
          fallbackCount: fallback.length,
        })
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS })

  const quality = (item) => (
    item.score_pronounce * 0.4 + item.score_memorability * 0.3 + item.score_novelty * 0.3
  )
  const letters = (value) => value.toLowerCase().replace(/[^a-z]/g, '')
  const editDistance = (left, right) => {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index)
    for (let i = 1; i <= left.length; i++) {
      let previous = row[0]
      row[0] = i
      for (let j = 1; j <= right.length; j++) {
        const old = row[j]
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(left[i - 1] !== right[j - 1]))
        previous = old
      }
    }
    return row[right.length]
  }
  const similarity = (left, right) => {
    const a = letters(left)
    const b = letters(right)
    return 1 - editDistance(a, b) / Math.max(a.length, b.length)
  }
  const isDirectSuffix = (item) => (
    item.sourceMode === 'brandable'
    && item.concept_coverage === 1
    && DIRECT_SUFFIXES.some((ending) => letters(item.name).endsWith(ending))
  )
  const basePrompts = new Set(BASE_PROMPTS)
  const auditRows = rows.filter((row) => basePrompts.has(row.prompt))
  const all = auditRows.flatMap((row) => row.selected)
  const allVisible = rows.flatMap((row) => row.selected)
  let pairSimilarity = 0
  let pairCount = 0
  let nearPairs = 0
  for (const row of auditRows) {
    for (let i = 0; i < row.selected.length; i++) {
      for (let j = i + 1; j < row.selected.length; j++) {
        const overlap = similarity(row.selected[i].name, row.selected[j].name)
        pairSimilarity += overlap
        pairCount++
        nearPairs += Number(overlap >= 0.72)
      }
    }
  }
  const averageQuality = all.reduce((sum, item) => sum + quality(item), 0) / all.length
  const leadQuality = auditRows.reduce(
    (sum, row) => sum + (row.selected[0] ? quality(row.selected[0]) : 0), 0,
  ) / auditRows.length
  const leadCoverage = auditRows.reduce(
    (sum, row) => sum + (row.selected[0]?.concept_coverage ?? 0), 0,
  ) / auditRows.length
  const suffixLeads = auditRows.filter((row) => row.selected[0] && isDirectSuffix(row.selected[0]))
  const guidedLeads = auditRows.filter((row) => Boolean(row.selected[0]?.construction))
  const guardedRepairUpgrades = rows.flatMap((row) => {
    const directNames = new Set(row.direct.map((item) => letters(item.name)))
    const repairedNames = new Set(row.repaired.map((item) => letters(item.name)))
    const removed = row.direct.filter((item) => !repairedNames.has(letters(item.name)))
    const added = row.repaired.filter((item) => !directNames.has(letters(item.name)))
    const upgrades = []
    for (const candidate of added) {
      if (
        candidate.sourceMode !== 'brandable'
        || candidate.construction
        || isDirectSuffix(candidate)
        || (candidate.concept_coverage ?? 0) === 0
        || quality(candidate) < 85
      ) continue
      const replacementIndex = removed.findIndex((item) => (
        item.sourceMode === 'brandable'
        && !item.construction
        && quality(item) >= 75
        && quality(item) + 2 <= quality(candidate)
        && (item.concept_coverage ?? 0) <= (candidate.concept_coverage ?? 0)
      ))
      if (replacementIndex < 0) continue
      const [replacement] = removed.splice(replacementIndex, 1)
      upgrades.push({ row, replacement, candidate })
    }
    return upgrades
  })
  const weakRespellAccents = rows.flatMap((row) => row.direct
    .filter((item) => item.sourceMode === 'respell' && quality(item) < 75)
    .map((item) => ({ row, item })))
  const aiWorkflowRows = rows.filter((row) => (
    /\bai\b/i.test(row.prompt) || /\bagent\b/i.test(row.prompt)
  ) && /\b(?:automation|workflow)s?\b/i.test(row.prompt))
  const aiAgentRows = rows.filter((row) => row.prompt === 'an AI automation agent')
  const aiAgentAverage = aiAgentRows.reduce(
    (sum, row) => sum + row.selected.reduce((pageSum, item) => pageSum + quality(item), 0),
    0,
  ) / (aiAgentRows.length * 10)
  const autonomousBuilderRows = rows.filter((row) => (
    row.prompt === 'an autonomous agent workflow builder'
  ))
  const autonomousBuilderAverage = autonomousBuilderRows.reduce(
    (sum, row) => sum + row.selected.reduce((pageSum, item) => pageSum + quality(item), 0),
    0,
  ) / (autonomousBuilderRows.length * 10)
  const crmRows = rows.filter((row) => (
    row.prompt === 'a customer relationship pipeline for sales representatives'
  ))
  const crmAverage = crmRows.reduce(
    (sum, row) => sum + row.selected.reduce((pageSum, item) => pageSum + quality(item), 0),
    0,
  ) / (crmRows.length * 10)
  const formatterRows = rows.filter((row) => row.prompt === 'a code formatter and linter')
  const formatterAverage = formatterRows.reduce(
    (sum, row) => sum + row.selected.reduce((pageSum, item) => pageSum + quality(item), 0),
    0,
  ) / (formatterRows.length * 10)
  const seedDiversity = BASE_PROMPTS.map((prompt) => {
    const promptRows = auditRows.filter((row) => row.prompt === prompt)
    const nameSeeds = new Map()
    for (const row of promptRows) {
      for (const item of row.selected) {
        const key = letters(item.name)
        const entry = nameSeeds.get(key) ?? { name: item.name, seeds: new Set() }
        entry.seeds.add(row.seed)
        nameSeeds.set(key, entry)
      }
    }
    let pairOverlap = 0
    let pairTotal = 0
    for (let i = 0; i < promptRows.length; i++) {
      const left = new Set(promptRows[i].selected.map((item) => letters(item.name)))
      for (let j = i + 1; j < promptRows.length; j++) {
        const right = new Set(promptRows[j].selected.map((item) => letters(item.name)))
        pairOverlap += [...left].filter((name) => right.has(name)).length
        pairTotal++
      }
    }
    const pageFingerprintSeeds = new Map()
    for (const row of promptRows) {
      const fingerprint = row.selected.map((item) => letters(item.name)).sort().join('|')
      const fingerprintSeeds = pageFingerprintSeeds.get(fingerprint) ?? []
      fingerprintSeeds.push(row.seed)
      pageFingerprintSeeds.set(fingerprint, fingerprintSeeds)
    }
    const exactDuplicatePageSeeds = [...pageFingerprintSeeds.values()]
      .filter((seeds) => seeds.length > 1)
    return {
      prompt,
      rowCount: promptRows.length,
      uniqueNames: nameSeeds.size,
      averagePairOverlap: pairTotal === 0 ? 0 : pairOverlap / pairTotal,
      sharedByEverySeed: [...nameSeeds.values()]
        .filter((entry) => entry.seeds.size === SEEDS.length)
        .map((entry) => entry.name),
      exactDuplicatePages: exactDuplicatePageSeeds.reduce(
        (sum, seeds) => sum + seeds.length - 1, 0,
      ),
      exactDuplicatePageSeeds,
    }
  }).sort((left, right) => (
    left.uniqueNames - right.uniqueNames
    || right.averagePairOverlap - left.averagePairOverlap
  ))
  const averageUniqueNames = seedDiversity.reduce(
    (sum, row) => sum + row.uniqueNames, 0,
  ) / seedDiversity.length
  const averageSeedOverlap = seedDiversity.reduce(
    (sum, row) => sum + row.averagePairOverlap, 0,
  ) / seedDiversity.length
  const exactDuplicateSeedPages = seedDiversity.reduce(
    (sum, row) => sum + row.exactDuplicatePages, 0,
  )
  const weak = allVisible.filter((item) => quality(item) < 75)
  const wrongSize = rows.filter((row) => row.selected.length !== 10)
  const wrongFallback = rows.filter((row) => row.fallbackCount < 0 || row.fallbackCount > 30)
  const multipleAccents = rows.filter((row) => (
    row.selected.filter((item) => item.sourceMode !== 'brandable').length > 1
  ))
  const worst = rows
    .map((row) => ({
      ...row,
      average: row.selected.length === 0
        ? 0
        : row.selected.reduce((sum, item) => sum + quality(item), 0) / row.selected.length,
    }))
    .sort((left, right) => left.average - right.average)
    .slice(0, 12)

  console.log(`held-out cold pages: ${auditRows.length} + ${rows.length - auditRows.length} AI wording variants`)
  console.log(`average quality: ${averageQuality.toFixed(2)} · lead ${leadQuality.toFixed(2)} · coverage ${leadCoverage.toFixed(2)}`)
  console.log(`sub-75: ${weak.length} · near pairs ${nearPairs} · similarity ${(pairSimilarity / pairCount).toFixed(3)}`)
  console.log(`suffix leads: ${suffixLeads.length} · guided leads: ${guidedLeads.length}`)
  console.log(`AI agent average: ${aiAgentAverage.toFixed(2)} · direct semantic-pair pages ${aiAgentRows.filter((row) => row.direct.some((item) => item.name === 'CogLoop' && item.construction === 'guided_pair')).length}/${aiAgentRows.length}`)
  console.log(`autonomous builder average: ${autonomousBuilderAverage.toFixed(2)} · CogLoop leads ${autonomousBuilderRows.filter((row) => row.selected[0]?.name === 'CogLoop').length}/${autonomousBuilderRows.length}`)
  console.log(`CRM average: ${crmAverage.toFixed(2)} · RevLoop leads ${crmRows.filter((row) => row.selected[0]?.name === 'RevLoop').length}/${crmRows.length}`)
  console.log(`formatter average: ${formatterAverage.toFixed(2)} · TidyKit leads ${formatterRows.filter((row) => row.selected[0]?.name === 'TidyKit').length}/${formatterRows.length}`)
  console.log(`guarded repair upgrades: ${guardedRepairUpgrades.length}`)
  console.log(`weak Respell accents: ${weakRespellAccents.length}`)
  console.log(`seed diversity: ${averageUniqueNames.toFixed(2)}/30 unique · ${averageSeedOverlap.toFixed(2)}/10 pair overlap · ${exactDuplicateSeedPages} duplicate pages`)
  console.log(`fallback counts: ${[...new Set(rows.map((row) => row.fallbackCount))].sort((a, b) => a - b).join(', ')}`)
  console.log('\nAI workflow focus')
  for (const row of aiWorkflowRows) {
    const selectedNames = new Set(row.selected.map((item) => letters(item.name)))
    const orderedNames = new Set(row.ordered.map((item) => letters(item.name)))
    const removed = row.ordered.filter((item) => !selectedNames.has(letters(item.name)))
    const added = row.selected.filter((item) => !orderedNames.has(letters(item.name)))
    console.log(
      `${row.seed} · ${row.ordered[0]?.name ?? 'empty'} -> ${row.selected[0]?.name ?? 'empty'}`
      + ` · ${removed.map((item) => item.name).join('/') || 'same set'}`
      + ` -> ${added.map((item) => item.name).join('/') || 'same set'}`,
    )
  }
  console.log('\nformatter focus')
  for (const row of formatterRows) {
    console.log(`${row.seed} · ${row.selected.map((item) => item.name).join(', ')}`)
  }
  console.log('\nguarded repair upgrades')
  for (const { row, replacement, candidate } of guardedRepairUpgrades) {
    console.log(
      `${row.seed} · ${row.prompt}: ${replacement.name}:${quality(replacement).toFixed(1)}`
      + ` -> ${candidate.name}:${quality(candidate).toFixed(1)}`,
    )
  }
  console.log('\nweak Respell accents')
  for (const { row, item } of weakRespellAccents) {
    console.log(`${quality(item).toFixed(1)} · ${row.seed} · ${row.prompt}: ${item.name}`)
  }
  console.log('\nremaining suffix leads')
  for (const row of suffixLeads) {
    const respells = row.ordered.filter((item) => item.sourceMode === 'respell')
    const guided = row.ordered.filter((item) => Boolean(item.construction))
    const blocker = respells.length > 0
      ? `respell ${respells.map((item) => item.name).join('/')}`
      : guided.length >= 2
        ? `guided capacity ${guided.map((item) => item.name).join('/')}`
        : row.retryRequested
          ? `no winning retry (${row.retry.slice(0, 4).map((item) => item.name).join('/') || 'empty'})`
          : 'not retry-eligible'
    console.log(`${row.seed} · ${row.prompt}: ${row.selected[0].name} · ${blocker}`)
  }
  console.log('\nlowest-average pages')
  for (const row of worst) {
    console.log(`${row.average.toFixed(2)} · ${row.seed} · ${row.prompt}: ${row.selected.map((item) => item.name).join(', ')}`)
  }
  console.log('\nlowest seed diversity')
  for (const row of seedDiversity.slice(0, 8)) {
    console.log(
      `${row.uniqueNames}/30 · overlap ${row.averagePairOverlap.toFixed(2)}`
      + ` · shared ${row.sharedByEverySeed.join('/') || 'none'} · ${row.prompt}`,
    )
  }
  console.log('\nexact duplicate seed pages')
  for (const row of seedDiversity.filter((item) => item.exactDuplicatePages > 0)) {
    console.log(`${row.exactDuplicatePageSeeds.map((seeds) => seeds.join('/')).join(', ')} · ${row.prompt}`)
  }

  const gates = [
    [wrongSize.length === 0, 'every held-out page contains ten names'],
    [wrongFallback.length === 0, 'held-out repair uses only the bounded fallback'],
    [multipleAccents.length === 0, 'held-out pages preserve the one-accent contract'],
    [weakRespellAccents.length === 0, 'sub-75 Respells cannot block a stronger Auto accent'],
    [weak.length === 0, 'no held-out visible name falls below 75'],
    [averageQuality >= 84, 'held-out average structural quality stays at or above 84.0'],
    [leadQuality >= 85.8, 'held-out lead structural quality stays at or above 85.8'],
    [leadCoverage >= 1.19, 'held-out lead concept coverage stays at or above 1.19'],
    [nearPairs <= 78, 'held-out near-duplicate pairs stay at or below 78'],
    [pairSimilarity / pairCount <= 0.203, 'held-out mean pair similarity stays at or below 0.203'],
    [
      seedDiversity.every((row) => row.rowCount === SEEDS.length),
      'every held-out brief contributes all three deterministic seed pages',
    ],
    [averageUniqueNames >= 18, 'held-out first pages retain at least 18/30 names across three seeds'],
    [averageSeedOverlap <= 5.25, 'held-out seed pairs share at most 5.25/10 names on average'],
    [exactDuplicateSeedPages <= 3, 'held-out content-identical seed pages do not increase'],
    [suffixLeads.length <= 24, 'held-out direct suffix leads stay at or below 24'],
    [guardedRepairUpgrades.length >= 6, 'held-out repair surfaces brief-specific inner-card upgrades'],
    [
      formatterRows.length === SEEDS.length
        && formatterAverage >= 83
        && formatterRows.filter((row) => (
          row.selected[0]?.name === 'TidyKit'
          && row.selected[0]?.construction === 'guided_pair'
        )).length >= 2
        && formatterRows.every((row) => (
          Boolean(row.selected[0]?.construction)
          && quality(row.selected[0]) >= 85
          && !row.retryRequested
        )),
      'formatter pages lead with a strong tool-specific construction without retry',
    ],
    [
      aiWorkflowRows.length === SEEDS.length * 5
        && aiWorkflowRows.filter((row) => row.selected[0]?.name === 'CogLoop').length >= 10
        && aiWorkflowRows.every((row) => (
          row.selected.length === 10
          && (
            !isDirectSuffix(row.selected[0])
            || row.selected.some((item) => item.sourceMode === 'respell')
          )
        )),
      'AI workflow variants avoid an unqualified suffix-only first impression',
    ],
    [
      aiWorkflowRows
        .filter((row) => row.prompt === 'workflow automation assistant powered by AI')
        .every((row) => row.selected[0]?.name === 'CogLoop'),
      'recognized AI semantics cannot starve when context words come first',
    ],
    [
      aiAgentRows.length === SEEDS.length
        && aiAgentRows.every((row) => (
          row.selected[0]?.name === 'CogLoop'
          && row.direct.some((item) => (
            item.name === 'CogLoop' && item.construction === 'guided_pair'
          ))
          && !row.retryRequested
        )),
      'AI agent pages surface their semantic pair before the final retry',
    ],
    [
      autonomousBuilderRows.length === SEEDS.length
        && autonomousBuilderRows.every((row) => (
          row.selected[0]?.name === 'CogLoop'
          && row.selected[0]?.construction === 'guided_pair'
          && row.direct.some((item) => (
            item.name === 'CogLoop' && item.construction === 'guided_pair'
          ))
          && !row.selected.some((item) => item.name === 'Buylder')
          && !row.retryRequested
        )),
      'generic builder roles cannot steal the AI workflow Respell accent',
    ],
    [
      crmRows.length === SEEDS.length
        && crmAverage >= 81
        && crmRows.every((row) => (
          row.seed === 67
            ? row.selected[0]?.name === 'Salelab'
              && row.selected[0]?.construction === 'guided_metaphor'
            : row.selected[0]?.name === 'RevLoop'
              && row.selected[0]?.construction === 'guided_pair'
              && !row.retryRequested
        )),
      'CRM pages surface RevLoop only where it improves the existing metaphor path',
    ],
  ]
  let failures = 0
  for (const [ok, label] of gates) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    failures += Number(!ok)
  }
  if (failures > 0) process.exitCode = 1
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}
