import { withBrowser, baseline, identity, writeNew } from './harness.mjs'
const source = identity()
const rows = await withBrowser(baseline)
writeNew('baseline.json', { schema: 'shared-pool-baseline-v1', identity: source, rows })
console.log(`Captured ${rows.length} baseline pages; source files and dirty diff retained.`)
