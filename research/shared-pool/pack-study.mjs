import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dir, protocol, hash, writeNew } from './harness.mjs'
const comparison = JSON.parse(readFileSync(resolve(dir, 'artifacts/comparison.json'), 'utf8'))
assert.equal(comparison.protocolSha256, hash(readFileSync(resolve(dir, 'protocol.json'))))
const primaries = protocol.evaluation.map((brief, index) => {
  const seed = protocol.seeds[index % protocol.seeds.length]
  const row = comparison.rows.find((r) => r.partition === 'evaluation' && r.brief === brief && r.seed === seed)
  assert(row)
  const experiment = row.experiment.finalists.map((f) => f.result.name)
  const baseline = row.baseline.finalists.map((f) => f.name)
  const experimentalSide = index % 2 === 0 ? 'left' : 'right'
  return { token: `p${index}`, brief, seed, experimentalSide, left: experimentalSide === 'left' ? experiment : baseline, right: experimentalSide === 'right' ? experiment : baseline }
})
const repeats = [0, 3, 6, 9].map((index) => {
  const parent = primaries[index]
  return { ...parent, token: `r${index}`, repeatOf: parent.token, left: parent.right, right: parent.left, experimentalSide: parent.experimentalSide === 'left' ? 'right' : 'left' }
})
const all = [...primaries, ...repeats]
// Fixed interleave: repeats occur at least four pages after their primary.
const order = [4, 0, 7, 3, 10, 1, 12, 6, 11, 13, 2, 9, 5, 14, 8, 15].map((i) => all[i])
const ids = new Map(order.map((p, i) => [p.token, `c${String(i + 1).padStart(2, '0')}`]))
const study = { schema: 'shared-pool-blind-study-v1', pages: order.map((p) => ({ id: ids.get(p.token), brief: p.brief, left: p.left, right: p.right })) }
const studySha256 = hash(JSON.stringify(study))
const key = { schema: 'shared-pool-study-key-v1', studySha256, protocolSha256: hash(JSON.stringify(protocol)), comparisonSha256: hash(readFileSync(resolve(dir, 'artifacts/comparison.json'))), pages: order.map((p) => ({ id: ids.get(p.token), experimentalSide: p.experimentalSide, repeatOf: p.repeatOf ? ids.get(p.repeatOf) : undefined, seed: p.seed })) }
const json = JSON.stringify({ study, studySha256 }).replaceAll('<', '\\u003c')
const script = readFileSync(resolve(dir, 'evaluator.js'), 'utf8')
const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>İsim karşılaştırması</title><style>
*{box-sizing:border-box}body{margin:0;background:#111216;color:#ececf2;font:17px/1.6 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:32px 24px}h1{font-size:30px;letter-spacing:-.03em}p{max-width:78ch}#brief{font-size:21px;color:#c4b5fd}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}fieldset{border:1px solid #454550;border-radius:12px;padding:18px;margin:16px 0}legend{padding:0 8px}label{display:flex;align-items:center;gap:12px;padding:10px 0;cursor:pointer}input{width:20px;height:20px;accent-color:#a999ff}button{font:inherit;background:#2b2546;color:#fff;border:1px solid #76659c;border-radius:8px;padding:10px 16px;cursor:pointer}button:disabled{opacity:.4;cursor:default}.controls{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}#status{min-height:28px;color:#c4b5fd}#resume{width:auto;height:auto;max-width:100%}small{color:#b1b1bd}button:focus-visible,input:focus-visible{outline:3px solid #c4b5fd;outline-offset:4px}@media(max-width:650px){.columns{grid-template-columns:1fr}main{padding:20px 16px}}
</style><main><h1>Hangi isimleri kullanırdın?</h1><p>Her brief için iki kısa liste göreceksin. Her listede, bu proje için gerçekten kullanmayı düşüneceğin isimleri işaretle. Yoksa “hiçbirini kullanmam” seç. Sonra tercih ettiğin listeyi belirt. İsimlerin müsaitliği doğrulanmış değildir.</p><p><small>Bu sayfa çevrimdışı çalışır. Yanıtların tarayıcıya kaydedilmez; ara vermeden veya kapatmadan önce yanıtları indir. Devam etmek için indirdiğin dosyayı yükleyebilirsin.</small></p><p id="progress" aria-live="polite"></p><h2 id="brief"></h2><form id="form" onsubmit="return false"></form><p id="status" role="status"></p><div class="controls"><button id="previous">Önceki</button><button id="next">Kaydet ve devam et</button><button id="export">Kaydedilen yanıtları indir</button></div><label>Yanıt dosyasından devam et <input id="resume" type="file" accept=".json,application/json"></label></main><script id="study" type="application/json">${json}</script><script>${script}</script></html>`
writeNew('blind-study.json', study)
writeNew('study-key.private.json', key)
writeNew('blind-evaluation.html', html)
writeNew('study-manifest.json', { studySha256, collectorSha256: hash(html), keySha256: hash(JSON.stringify(key)), gates: protocol.humanGate, status: 'awaiting-human-evaluation' })
console.log('Packed 12 primary pages + 4 repeats. Send only blind-evaluation.html; keep the key private.')
