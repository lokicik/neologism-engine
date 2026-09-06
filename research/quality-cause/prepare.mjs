import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { root, identity } from '../shared-pool/harness.mjs'
const out = resolve(root, 'research/quality-cause/artifacts')
mkdirSync(out, { recursive: true })
const briefs = [
  'a build tool that compares executable sizes between release tags',
  'a package release assistant that verifies checksums of downloadable binaries',
  'a build tool that checks dependency licenses before publishing a package',
  'a terminal tool that tracks memory usage during test runs',
  'a local service that groups log messages by severity',
  'a developer tool that verifies configuration files before deployment',
]
const configs = briefs.flatMap((description) => [13, 67, 313].map((seed) => ({ style: 'big_tech', description, seed, count: 24, min_len: 4, max_len: 12, temperature: 0.85, variety: 0.3, roots: [], exclude: [] })))
writeFileSync(resolve(out, 'configs.json'), JSON.stringify(configs, null, 2), { flag: 'wx' })
writeFileSync(resolve(out, 'identity.json'), JSON.stringify(identity(), null, 2), { flag: 'wx' })
const comparison = JSON.parse(readFileSync(resolve(root, 'research/operation-object/artifacts/comparison.json')))
const pools = briefs.map((brief) => {
  const row = comparison.rows.find((r) => r.brief === brief && r.seed === 13)
  const trace = JSON.parse(gunzipSync(readFileSync(resolve(root, 'research/operation-object/artifacts', row.filename))))
  return { brief, finalists: trace.old.finalists.map((f) => f.result.name), candidates: trace.old.proposals.filter((p) => p.sources.some((s) => !s.rejection)).map((p) => p.name).sort() }
})
writeFileSync(resolve(out, 'unranked-pools.json'), JSON.stringify(pools, null, 2), { flag: 'wx' })
console.log('Prepared 18 configs × 3 representations × 3 interventions; six existing pools for editorial ceiling review')
