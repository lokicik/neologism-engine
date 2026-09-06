import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const out = resolve(import.meta.dirname, 'artifacts')
mkdirSync(out, { recursive: true })
const rows = []
for (const script of ['auto-quality-audit.mjs', 'heldout-cold-quality-audit.mjs', 'cold-quality-audit.mjs', 'taste-quality-audit.mjs', 'mode-taste-audit.mjs', 'shortlist-contract.mjs']) {
  const start = Date.now()
  const r = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../web/e2e', script)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  writeFileSync(resolve(out, `${script}.log`), r.stdout + r.stderr)
  rows.push({ script, exitCode: r.status, durationMs: Date.now() - start })
  console.log(JSON.stringify(rows.at(-1)))
}
writeFileSync(resolve(out, 'audits.json'), JSON.stringify(rows, null, 2))
if (rows.some((r) => r.exitCode !== 0)) process.exitCode = 1
