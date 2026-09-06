import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from '../shared-pool/harness.mjs'
const out = resolve(root, 'research/brief-intent/artifacts')
const scripts = ['auto-quality-audit.mjs', 'heldout-cold-quality-audit.mjs', 'cold-quality-audit.mjs', 'taste-quality-audit.mjs', 'mode-taste-audit.mjs', 'shortlist-contract.mjs']
const results = []
for (const script of scripts) {
  const started = Date.now()
  const result = await new Promise((done) => {
    const child = spawn(process.execPath, [resolve(root, 'web/e2e', script)], { cwd: resolve(root, 'web'), stdio: 'pipe' })
    let output = ''
    child.stdout.on('data', (data) => { output += data })
    child.stderr.on('data', (data) => { output += data })
    child.on('error', (error) => done({ code: -1, output: String(error) }))
    child.on('exit', (code) => done({ code, output }))
  })
  writeFileSync(resolve(out, `${script}.log`), result.output)
  results.push({ script, exitCode: result.code, durationMs: Date.now() - started })
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${script}`)
}
writeFileSync(resolve(out, 'verification.json'), JSON.stringify(results, null, 2) + '\n')
process.exitCode = results.some((r) => r.exitCode !== 0) ? 1 : 0
