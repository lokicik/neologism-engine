import { chromium } from '../../web/node_modules/playwright/index.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

export const dir = dirname(fileURLToPath(import.meta.url))
export const root = resolve(dir, '../..')
export const hash = (value) => createHash('sha256').update(value).digest('hex')
export const protocol = JSON.parse(readFileSync(resolve(dir, 'protocol.json'), 'utf8'))
export function writeNew(name, value) {
  mkdirSync(resolve(dir, 'artifacts'), { recursive: true })
  writeFileSync(resolve(dir, 'artifacts', name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
}
export function identity() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'core', 'wasm', 'web/src', 'Cargo.lock', 'web/package-lock.json'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/)
  return {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    protocolSha256: hash(readFileSync(resolve(dir, 'protocol.json'))),
    wasmSha256: hash(readFileSync(resolve(root, 'web/src/wasm/neologism_wasm_bg.wasm'))),
    files: Object.fromEntries(files.map((f) => [f, hash(readFileSync(resolve(root, f)))])),
    diff: execFileSync('git', ['diff', '--binary'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }),
  }
}
export async function withBrowser(run) {
  const port = 4246
  const server = spawn(process.execPath, [resolve(root, 'web/node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: resolve(root, 'web'), stdio: 'pipe' })
  let browser
  let errors = ''
  server.stderr.on('data', (data) => { errors += data })
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('Vite startup timeout')), 30000)
      server.stdout.on('data', (d) => { if (d.toString().includes('Local:')) { clearTimeout(timer); ok() } })
      server.on('error', fail)
      server.on('exit', () => { clearTimeout(timer); fail(new Error(`Vite exited: ${errors}`)) })
    })
    browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(`http://localhost:${port}`)
    return await run(page)
  } finally {
    await browser?.close()
    server.kill()
  }
}

// Matches App's cold, no-feedback first-page path, including repair and retry.
export async function baseline(page, studyProtocol = protocol) {
  return page.evaluate(async ({ protocol }) => {
    const e = await import('/src/lib/engine.ts')
    const p = await import('/src/lib/preferences.ts')
    const { pickShortlist } = await import('/src/lib/shortlist.ts')
    await e.generateNames({ style: 'big_tech', variant: 'reason', seed: 13, count: 1 })
    const rows = []
    for (const [partition, briefs] of [['development', protocol.development], ['evaluation', protocol.evaluation]]) {
      for (const brief of briefs) for (const seed of protocol.seeds) {
        const config = { style: 'big_tech', variant: 'auto', description: brief, seed, count: 10, min_len: 4, max_len: 12, temperature: 0.85, variety: 0.3, roots: [], exclude: [] }
        const start = performance.now()
        const primary = await e.generateBatch(config)
        let pool = primary
        let batch
        if (p.needsQualityRepair(primary, 10)) {
          const fallback = await e.generateNames({ ...config, variant: undefined, compound: false, count: p.coldQualityPoolCount(10), exclude: primary.map((x) => x.name) })
          pool = [...primary, ...fallback]
          batch = p.repairWeakShortlist(primary, fallback, 10)
        } else batch = p.shortlistByPreference(pool, null, 10, seed)
        batch = p.prioritizeColdStrongLead(batch)
        if (p.needsColdLeadRetry(batch)) batch = p.fillColdLeadRetry(batch, await e.generateColdLeadRetry(config), pool)
        const finalists = pickShortlist(batch, e.cratesTaken)
        rows.push({ partition, brief, seed, config, primaryCount: primary.length, poolCount: pool.length, batch, finalists, durationMs: performance.now() - start })
      }
    }
    return rows
  }, { protocol: studyProtocol })
}
