import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { root, hash } from '../shared-pool/harness.mjs'
const dir = resolve(root, 'research/operation-object/artifacts')
const comparisonBytes = readFileSync(resolve(dir, 'comparison.json'))
const comparison = JSON.parse(comparisonBytes)
const rows = comparison.rows.filter((r) => r.seed === 13).map((row) => {
  const run = JSON.parse(gunzipSync(readFileSync(resolve(dir, row.filename)))).current
  const matches = (name, roots) => roots.flatMap(({ root }) => {
    const found = []
    if (name.startsWith(root)) found.push([0, root.length])
    if (name.endsWith(root)) found.push([name.length - root.length, name.length])
    return found
  })
  const linked = (name) => matches(name, run.relation.operation_roots).some((a) => matches(name, run.relation.object_roots).some((b) => a[1] <= b[0] || b[1] <= a[0]))
  const internal = run.families.flatMap((f) => [...new Set(f.events.map((e) => e.name))].filter(linked).map((name) => {
    const events = f.events.filter((e) => e.name === name)
    const returned = run.proposals.some((p) => p.id === name && p.sources.some((s) => s.family === f.family))
    return { family: f.family, name, stage: returned ? 'returned_to_pool' : events.some((e) => e.stage.endsWith('rank_input')) ? 'internal_ranked_not_returned' : 'internal_filter', events }
  }))
  return { brief: row.brief, partition: row.partition, finalists: row.current, poolCount: row.poolCount, linkedPoolCount: row.linkedCount, internal }
})
writeFileSync(resolve(dir, 'diagnosis.json'), JSON.stringify({ comparisonSha256: hash(comparisonBytes), method: 'Post-hoc lexical diagnostic using the frozen plan, no changes to selection', rows }, null, 2) + '\n', { flag: 'wx' })
const verification = JSON.parse(readFileSync(resolve(root, 'research/brief-intent/artifacts/verification.json')))
for (const check of verification) {
  if (check.exitCode !== 0) throw Error(`Failed retained audit: ${check.script}`)
  copyFileSync(resolve(root, 'research/brief-intent/artifacts', `${check.script}.log`), resolve(dir, `${check.script}.log`))
}
writeFileSync(resolve(dir, 'verification.json'), JSON.stringify(verification, null, 2) + '\n', { flag: 'wx' })
console.log('PASS frozen per-stage lexical diagnosis and six current audit logs retained')
