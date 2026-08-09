// Score hand-curated candidate spellings with the same offline metrics used by
// the browser engine. This is a diagnostic; it does not add candidates to any
// generation path.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const candidates = process.argv.slice(2)
if (candidates.length === 0) {
  throw new Error('usage: node e2e/candidate-quality-probe.mjs NameOne NameTwo ...')
}

const PORT = 4198
const E2E_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = join(E2E_DIR, '..')
const viteCli = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
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
  const rows = await page.evaluate(async (names) => {
    const { explainName } = await import('/src/lib/engine.ts')
    return Promise.all(names.map(async (name) => ({ name, ...await explainName(name) })))
  }, candidates)
  for (const row of rows) {
    const quality = (
      row.score_pronounce * 0.4
      + row.score_memorability * 0.3
      + row.score_novelty * 0.3
    )
    console.log(
      `${row.name.padEnd(14)} ${quality.toFixed(1)}`
      + `  p${row.score_pronounce} m${row.score_memorability} n${row.score_novelty}`,
    )
  }
} finally {
  await browser.close()
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    server.kill()
  }
}
