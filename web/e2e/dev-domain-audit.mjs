// Held-out browser audit for developer-domain meaning in Brandable and Compound.
// Run from web/: node e2e/dev-domain-audit.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 4185
const APP_URL = `http://localhost:${PORT}`
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const CASES = [
  {
    prompt: 'a CLI for database migrations',
    markers: ['schema', 'query', 'table', 'store', 'base', 'shift', 'bridge', 'relay', 'port'],
  },
  {
    prompt: 'an API rate limiting library',
    markers: ['gate', 'meter', 'quota', 'pace', 'guard'],
  },
  {
    prompt: 'a terminal log viewer',
    markers: ['term', 'shell', 'prompt', 'trace', 'watch', 'scope', 'pulse', 'beacon'],
  },
  {
    prompt: 'git release automation',
    markers: ['commit', 'branch', 'tag', 'forge', 'ship'],
  },
  {
    prompt: 'a local cache inspector',
    markers: ['cache', 'stash', 'store', 'heap', 'buffer'],
  },
  {
    prompt: 'a browser bookmark manager',
    markers: ['tab', 'mark', 'link', 'page', 'web'],
  },
  {
    prompt: 'an API testing toolkit',
    markers: ['spec', 'check', 'probe', 'assert', 'trace'],
  },
  {
    prompt: 'a cloud deployment dashboard',
    markers: ['cloud', 'dock', 'ship', 'stack', 'grid'],
  },
  {
    prompt: 'a message queue client',
    markers: ['queue', 'broker', 'stream', 'topic', 'pipe', 'bus'],
  },
  {
    prompt: 'a code formatter and linter',
    markers: ['format', 'lint', 'style', 'rule', 'tidy'],
  },
  {
    prompt: 'an environment variable manager',
    markers: ['env', 'config', 'setting', 'secret', 'value'],
  },
  {
    prompt: 'a filesystem search CLI',
    markers: ['file', 'path', 'find', 'scan', 'index', 'seek'],
  },
  {
    prompt: 'a feature flag service',
    markers: ['flag', 'toggle', 'switch', 'rollout', 'gate', 'launch'],
  },
  {
    prompt: 'a background job scheduler',
    markers: ['job', 'task', 'worker', 'cron', 'schedule', 'timer', 'run'],
  },
  {
    prompt: 'dependency update automation',
    markers: ['dependency', 'package', 'version', 'bump', 'update', 'sync', 'dep', 'lock'],
  },
  {
    prompt: 'a documentation site generator',
    markers: ['doc', 'guide', 'page', 'site', 'manual', 'scribe', 'note', 'forge', 'web', 'portal', 'home'],
  },
]
const MODES = [
  { label: 'Brandable', compound: false },
  { label: 'Compound', compound: true },
]
const SEEDS = [7, 42, 101, 2024, 9999]
const EXPECTED_PER_CASE = SEEDS.length * 10
const LOSSY_OVERLAPS = new Set(['settledger', 'tagent'])
const CONCEPT_SUFFIXES = ['ia', 'io', 'ora', 'ix', 'ify']

const isConceptSuffix = (name, markers) => {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, '')
  return markers.some((marker) => CONCEPT_SUFFIXES.some((suffix) => normalized === marker + suffix))
}

const hasCompoundLexicalEcho = (name) => {
  const boundaryOffset = name.slice(1).search(/[A-Z]/)
  if (boundaryOffset < 0) return false
  const boundary = boundaryOffset + 1
  const adjective = name.slice(0, boundary).toLowerCase()
  const noun = name.slice(boundary).toLowerCase()
  if (adjective === noun) return true

  const shorter = Math.min(adjective.length, noun.length)
  if (shorter < 4) return false
  if (adjective.startsWith(noun) || noun.startsWith(adjective)) return true

  let sharedPrefix = 0
  while (sharedPrefix < shorter && adjective[sharedPrefix] === noun[sharedPrefix]) sharedPrefix++
  return sharedPrefix >= 4
    && adjective.length - sharedPrefix <= 2
    && noun.length - sharedPrefix <= 2
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
let failures = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures++
}

try {
  const page = await browser.newPage()
  await page.goto(APP_URL)
  const rows = await page.evaluate(async ({ cases, modes, seeds }) => {
    const { generateBatch } = await import('/src/lib/engine.ts')
    const output = []
    for (const testCase of cases) {
      for (const mode of modes) {
        for (const seed of seeds) {
          const results = await generateBatch({
            style: 'big_tech',
            count: 10,
            min_len: 4,
            max_len: 12,
            temperature: 0.85,
            variety: 0.3,
            roots: [],
            description: testCase.prompt,
            compound: mode.compound,
            exclude: [],
            seed,
          })
          output.push({
            prompt: testCase.prompt,
            mode: mode.label,
            markers: testCase.markers,
            names: results.map((result) => result.name),
          })
        }
      }
    }
    return output
  }, { cases: CASES, modes: MODES, seeds: SEEDS })

  const aggregate = Object.fromEntries(MODES.map((mode) => [mode.label, { mapped: 0, total: 0 }]))
  const lossyOverlaps = rows.flatMap((row) => row.names).filter((name) => LOSSY_OVERLAPS.has(name.toLowerCase()))
  check(lossyOverlaps.length === 0, `no lossy semantic overlaps (${lossyOverlaps.join(', ') || 'none'})`)
  const lexicalEchoes = rows
    .filter((row) => row.mode === 'Compound')
    .flatMap((row) => row.names)
    .filter(hasCompoundLexicalEcho)
  check(lexicalEchoes.length === 0, `no Compound lexical echoes (${lexicalEchoes.join(', ') || 'none'})`)
  const brandableRows = rows.filter((row) => row.mode === 'Brandable')
  const suffixOnlyPages = brandableRows.filter((row) =>
    row.names.every((name) => isConceptSuffix(name, row.markers)))
  console.log(`Brandable suffix-only pages: ${suffixOnlyPages.length}/${brandableRows.length}`)
  check(suffixOnlyPages.length <= 10, 'Brandable first pages do not collapse back to suffix-only forms')
  for (const testCase of CASES) {
    for (const mode of MODES) {
      const batches = rows.filter((row) => row.prompt === testCase.prompt && row.mode === mode.label)
      let mapped = 0
      let total = 0
      for (const batch of batches) {
        check(batch.names.length === 10, `${mode.label} / ${testCase.prompt}: full ten-name page`)
        for (const name of batch.names) {
          const normalized = name.toLowerCase().replace(/[^a-z]/g, '')
          mapped += Number(batch.markers.some((marker) => normalized.includes(marker)))
          total++
        }
      }

      aggregate[mode.label].mapped += mapped
      aggregate[mode.label].total += total
      const percent = total ? mapped / total * 100 : 0
      console.log(`${mode.label.padEnd(9)} ${mapped}/${total} semantic (${percent.toFixed(1)}%)  ${testCase.prompt}`)
      check(total === EXPECTED_PER_CASE, `${mode.label} / ${testCase.prompt}: ${EXPECTED_PER_CASE} audited names`)
      check(percent >= 80, `${mode.label} / ${testCase.prompt}: at least 80% carry a domain marker`)
    }
  }

  for (const mode of MODES) {
    const { mapped, total } = aggregate[mode.label]
    const percent = total ? mapped / total * 100 : 0
    console.log(`${mode.label} aggregate: ${mapped}/${total} semantic (${percent.toFixed(1)}%)`)
    check(percent >= 90, `${mode.label} aggregate stays at or above 90%`)
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
  console.error(`developer-domain audit: ${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('developer-domain audit: all checks passed')
}
