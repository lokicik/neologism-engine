// Search deterministic third-chance metaphor seeds only for cold Auto pages
// that still lead with a direct suffix after production ordering. This is a
// diagnostic: any winning offset must still pass all product quality gates.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4196
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
const OFFSETS = [
  ...Array.from({ length: 64 }, (_, index) => index + 1).filter((offset) => offset !== 16),
  97, 127, 257, 521, 1021, 4099, 7919, 65537, 0x9e3779b9,
]
const UINT32_RANGE = 0x1_0000_0000

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
  const rows = await page.evaluate(async ({ prompts, seeds, offsets, range }) => {
    const { generateBatch, generateNames } = await import('/src/lib/engine.ts')
    const {
      coldQualityPoolCount,
      needsQualityRepair,
      prioritizeColdStrongLead,
      repairWeakShortlist,
    } = await import('/src/lib/preferences.ts')
    const directSuffixes = ['ify', 'ora', 'ion', 'era', 'io', 'ia', 'ix', 'el', 'en', 'on']
    const metaphorTails = [
      'flow', 'forge', 'spark', 'seed', 'craft', 'lab', 'wave', 'link', 'pulse', 'beam',
      'prism', 'lumen', 'nova', 'peak', 'signal', 'smith', 'grove', 'glow', 'loom', 'muse',
      'flux', 'atlas',
    ]
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
    const meanSimilarity = (items) => {
      let total = 0
      let pairs = 0
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const left = letters(items[i].name)
          const right = letters(items[j].name)
          total += 1 - editDistance(left, right) / Math.max(left.length, right.length)
          pairs++
        }
      }
      return total / Math.max(1, pairs)
    }
    const tail = (item) => metaphorTails.find((ending) => letters(item.name).endsWith(ending))
    const isDirectSuffix = (item) => (
      item.sourceMode === 'brandable'
      && item.concept_coverage === 1
      && directSuffixes.some((ending) => letters(item.name).endsWith(ending))
    )
    const addCandidate = (items, candidate, constructionRank) => {
      const replacement = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isDirectSuffix(item) && quality(item) <= quality(candidate))
        .sort((left, right) => quality(left.item) - quality(right.item) || right.index - left.index)[0]
      if (!replacement) return null
      const next = items.slice()
      next[replacement.index] = {
        ...candidate,
        construction: 'guided_metaphor',
        constructionRank,
      }
      return next
    }

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
        const selected = prioritizeColdStrongLead(repaired)
        if (!isDirectSuffix(selected[0])) continue

        const guided = selected.filter((item) => item.construction === 'guided_metaphor')
        const respells = selected.filter((item) => item.sourceMode === 'respell')
        const row = {
          prompt,
          seed,
          lead: selected[0],
          guided: guided.map((item) => item.name),
          respells: respells.map((item) => item.name),
          trials: [],
        }
        if (respells.length > 0 || guided.length >= 2) {
          output.push(row)
          continue
        }

        const usedNames = new Set(selected.map((item) => letters(item.name)))
        const usedTails = new Set(guided.map(tail))
        for (const offset of offsets) {
          const pool = await generateNames({
            ...config,
            variant: 'metaphor',
            compound: false,
            count: 8,
            seed: (seed + offset) % range,
          })
          const candidates = pool
            .filter((item) => (
              (item.concept_coverage ?? 0) > 0
              && quality(item) >= 85
              && tail(item)
              && !usedNames.has(letters(item.name))
              && !usedTails.has(tail(item))
            ))
            .sort((left, right) => quality(right) - quality(left))
          let firstTrial
          let safeTrial
          for (const candidate of candidates) {
            const expanded = addCandidate(selected, candidate, guided.length + 1)
            if (!expanded) continue
            const ordered = prioritizeColdStrongLead(expanded)
            if (isDirectSuffix(ordered[0])) continue
            const prefix = letters(candidate.name).slice(0, 3)
            const similarityDelta = meanSimilarity(expanded) - meanSimilarity(selected)
            const prefixBefore = selected.filter((item) => letters(item.name).startsWith(prefix)).length
            const prefixAfter = expanded.filter((item) => letters(item.name).startsWith(prefix)).length
            const trial = {
              offset,
              name: candidate.name,
              quality: quality(candidate),
              coverage: candidate.concept_coverage ?? 0,
              replaced: selected.find((item) => !expanded.some((next) => letters(next.name) === letters(item.name)))?.name,
              lead: ordered[0].name,
              similarityDelta,
              prefixBefore,
              prefixAfter,
              safe: prefixAfter <= Math.max(2, prefixBefore) && similarityDelta <= Number.EPSILON,
            }
            firstTrial ??= trial
            if (trial.safe) {
              safeTrial = trial
              break
            }
          }
          if (safeTrial ?? firstTrial) row.trials.push(safeTrial ?? firstTrial)
        }
        output.push(row)
      }
    }
    return output
  }, { prompts: PROMPTS, seeds: SEEDS, offsets: OFFSETS, range: UINT32_RANGE })

  const blockedRespell = rows.filter((row) => row.respells.length > 0)
  const blockedCapacity = rows.filter((row) => row.respells.length === 0 && row.guided.length >= 2)
  const searchable = rows.filter((row) => row.respells.length === 0 && row.guided.length < 2)
  const noWinner = searchable.filter((row) => row.trials.length === 0)
  console.log(`remaining suffix leads: ${rows.length}`)
  console.log(`blocked by earned Respell: ${blockedRespell.length}`)
  console.log(`blocked by two guided forms: ${blockedCapacity.length}`)
  console.log(`searchable with no winning offset: ${noWinner.length}/${searchable.length}`)
  for (const row of rows) {
    const blocker = row.respells.length > 0
      ? `respell ${row.respells.join('/')}`
      : row.guided.length >= 2
        ? `guided capacity ${row.guided.join('/')}`
        : row.trials.length === 0
          ? 'no winning offset'
          : `${row.trials.length} winning offsets`
    console.log(`${row.seed} · ${row.prompt}: ${row.lead.name} · ${blocker}`)
  }

  const ranked = OFFSETS.map((offset) => {
    const wins = searchable.flatMap((row) => row.trials
      .filter((trial) => trial.offset === offset)
      .map((trial) => ({ ...trial, prompt: row.prompt, seed: row.seed })))
    return {
      offset,
      wins,
      unique: new Set(wins.map((win) => win.name.toLowerCase())).size,
      quality: wins.reduce((sum, win) => sum + win.quality, 0) / Math.max(1, wins.length),
    }
  }).sort((left, right) => (
    right.wins.length - left.wins.length
    || right.unique - left.unique
    || right.quality - left.quality
    || left.offset - right.offset
  ))

  console.log('\noffset · closed gaps · unique · quality · changes')
  for (const row of ranked.slice(0, 15)) {
    console.log(
      `${row.offset} · ${row.wins.length}/${searchable.length} · ${row.unique} · ${row.quality.toFixed(2)} · `
      + row.wins.map((win) => (
        `${win.seed}:${win.replaced}→${win.name}`
        + `/p${win.prefixBefore}→${win.prefixAfter}`
        + `/s${win.similarityDelta >= 0 ? '+' : ''}${win.similarityDelta.toFixed(3)}`
      )).join(', '),
    )
  }

  const safeRanked = ranked.map((row) => {
    const wins = row.wins.filter((win) => win.safe)
    return {
      ...row,
      wins,
      unique: new Set(wins.map((win) => win.name.toLowerCase())).size,
      quality: wins.reduce((sum, win) => sum + win.quality, 0) / Math.max(1, wins.length),
    }
  }).sort((left, right) => (
    right.wins.length - left.wins.length
    || right.unique - left.unique
    || right.quality - left.quality
    || left.offset - right.offset
  ))
  console.log('\nsafe offset · closed gaps · unique · quality · changes')
  for (const row of safeRanked.slice(0, 15)) {
    console.log(
      `${row.offset} · ${row.wins.length}/${searchable.length} · ${row.unique} · ${row.quality.toFixed(2)} · `
      + row.wins.map((win) => `${win.seed}:${win.replaced}→${win.name}`).join(', '),
    )
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
