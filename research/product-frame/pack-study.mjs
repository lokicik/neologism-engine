import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hash, root } from '../shared-pool/harness.mjs'
const dir = import.meta.dirname
const out = resolve(dir, 'artifacts-v2')
const protocol = JSON.parse(readFileSync(resolve(dir, 'protocol.json')))
const comparisonBytes = readFileSync(resolve(out, 'comparison.json'))
const comparison = JSON.parse(comparisonBytes)
assert.equal(comparison.protocolSha256, hash(readFileSync(resolve(dir, 'protocol.json'))))
const primaries = protocol.evaluation.map((brief, i) => {
  const seed = protocol.seeds[i % protocol.seeds.length]
  const r = comparison.rows.find((r) => r.brief === brief && r.seed === seed)
  assert(r)
  const experimentalSide = i % 2 ? 'right' : 'left'
  return { token: `p${i}`, brief, seed, experimentalSide, left: i % 2 ? r.auto : r.current, right: i % 2 ? r.current : r.auto }
})
const repeats = [0, 3, 6, 9].map((i) => ({ ...primaries[i], token: `r${i}`, repeatOf: primaries[i].token,
  left: primaries[i].right, right: primaries[i].left, experimentalSide: primaries[i].experimentalSide === 'left' ? 'right' : 'left' }))
const all = [...primaries, ...repeats]
const order = [4, 0, 7, 3, 10, 1, 12, 6, 11, 13, 2, 9, 5, 14, 8, 15].map((i) => all[i])
const ids = new Map(order.map((p, i) => [p.token, `m${i + 1}`]))
const study = { schema: 'shared-pool-blind-study-v1', pages: order.map((p) => ({ id: ids.get(p.token), brief: p.brief, left: p.left, right: p.right })) }
const studySha256 = hash(JSON.stringify(study))
const key = { schema: 'shared-pool-study-key-v1', studySha256, protocolSha256: hash(JSON.stringify(protocol)), comparisonSha256: hash(comparisonBytes),
  pages: order.map((p) => ({ id: ids.get(p.token), experimentalSide: p.experimentalSide, seed: p.seed, repeatOf: p.repeatOf ? ids.get(p.repeatOf) : undefined })) }
const template = readFileSync(resolve(root, 'research/shared-pool/artifacts/blind-evaluation.html'), 'utf8')
const payload = JSON.stringify({ study, studySha256 }).replaceAll('<', '\\u003c')
const html = template.replace(/(<script id="study" type="application\/json">)[\s\S]*?(<\/script>)/, (_, start, end) => start + payload + end)
assert(html !== template && !html.includes('experimentalSide') && !html.includes('repeatOf'))
for (const [name, data] of Object.entries({ 'blind-study.json': study, 'study-key.private.json': key, 'blind-evaluation.html': html,
  'study-manifest.json': { studySha256, collectorSha256: hash(html), keySha256: hash(JSON.stringify(key)), status: 'awaiting-human-evaluation', gates: protocol.humanGate } })) {
  writeFileSync(resolve(out, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), { flag: 'wx' })
}
console.log('Packed 12 comparisons + 4 repeats; human answers remain pending')

