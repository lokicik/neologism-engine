import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { hash } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v2')
const comparison = JSON.parse(readFileSync(resolve(out, 'comparison.json')))
const rows = comparison.rows.filter((r) => r.partition === 'evaluation')
const first = rows.filter((r) => r.seed === 13)
// Source-visible editorial suggestions. These are not blind answers, training
// labels, automatic promotion criteria or a replacement for human responses.
const picks = ['ArchiveProof', 'HashSeal', null, 'Kiyas', 'QueueWatch', 'ProcessWatch', 'Reprise', null, 'Halka', 'AlertMesh', 'Portolan', null]
const rationale = [
  'The archive and evidence connection is readable without decoding fragments.',
  'A seal suggests attestation; the hash keeps the product association specific.',
  'The retained instrument metaphors do not convey query latency clearly enough for my preference.',
  'The comparison metaphor remains my preference; Auto already offered it.',
  'A direct but readable product name for observing queues.',
  'A direct but readable product name for observing processes.',
  'Returning to an earlier passage is a useful recovery metaphor.',
  'No experimental finalist: the shallow parser does not recognize recovers.',
  'The circle/group metaphor is preferable to the command-like alternatives for me.',
  'A selective mesh fits filtering alert traffic while keeping the whole words legible.',
  'The mapping metaphor remains my preference; Auto already offered it.',
  'The exposure frame supplies no eligible new finalist; the remaining metaphors are too broad for my preference.'
]
const review = first.map((r, i) => {
  assert(picks[i] === null || r.current.includes(picks[i]))
  return { brief: r.brief, seed: r.seed, suggestion: picks[i], rationale: rationale[i] }
})
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const equalSet = (a, b) => equal([...a].sort(), [...b].sort())
const durations = rows.filter((r) => r.status === 'ready').map((r) => r.durationMs).sort((a, b) => a - b)
const frameContributions = rows.map((r) => {
  assert.equal(hash(readFileSync(resolve(out, r.traceFile))), r.sha256)
  const trace = JSON.parse(gunzipSync(readFileSync(resolve(out, r.traceFile))))
  const family = trace.current.families.find((f) => f.family === 'guided_metaphor')
  return { brief: r.brief, seed: r.seed, returned: family.returned, selected: trace.current.finalists.filter((f) => f.selectedFrom === 'guided_metaphor').length,
    rejectionEvents: family.events.filter((e) => e.stage === 'frame.filter') }
})
const summary = {
  conditions: rows.length,
  framesMatched: rows.filter((r) => r.frame).length,
  nonemptyLists: rows.filter((r) => r.current.length).length,
  selectionOnlyChangedOrder: rows.filter((r) => !equal(r.old, r.selectionOnly)).length,
  selectionOnlyChangedSet: rows.filter((r) => !equalSet(r.old, r.selectionOnly)).length,
  inventoryOnlyChangedSet: rows.filter((r) => !equalSet(r.old, r.inventoryOnly)).length,
  combinedChangedSet: rows.filter((r) => !equalSet(r.old, r.current)).length,
  frameFamilyReachedFinalists: frameContributions.filter((r) => r.selected > 0).length,
  readyDurationMs: { median: (durations[(durations.length - 1) >> 1] + durations[durations.length >> 1]) / 2, min: durations[0], max: durations.at(-1) },
  humanResponses: 0,
  qualityImprovementEstablished: false,
  limitation: 'Revision 2 follows two general bug fixes after inspecting revision 1; these are regression examples, not untouched held-out evidence.'
}
writeFileSync(resolve(out, 'analysis.json'), JSON.stringify({ summary, frameContributions, assistantReview: { method: 'source-visible, seed 13, not training or human evaluation', rows: review } }, null, 2))
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ürün faydası deneyi · örnekler</title><style>body{margin:0;background:#111217;color:#ececf1;font:16px/1.6 system-ui}main{max-width:1060px;margin:auto;padding:32px 20px}h1{font-size:30px;line-height:1.2}h2{font-size:18px}section{border-top:1px solid #373841;padding:22px 0}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.label{font-size:13px;color:#b4b7c4}.names{font-size:20px;font-weight:600}.pick{color:#aadebd}a{color:#b9b3ff}p{margin:8px 0}@media(max-width:650px){.cols{grid-template-columns:1fr}}</style><main><h1>Ürün faydası üzerinden isim üretimi</h1><p>12 brief · tohum 13 · çevrimdışı Rust/WASM</p><p>Eski Auto ile son deneyin gerçek finalistleri. Aşağıdaki tercihler asistanın kaynakları görerek yaptığı önerilerdir; insan değerlendirmesi veya kanıtlanmış kalite artışı değildir.</p><p><a href="blind-evaluation.html">Kaynakları gizlenmiş 12 karşılaştırma + 4 tekrar</a></p>${first.map((r, i) => `<section><h2>${i + 1}. ${escape(r.brief)}</h2><div class="cols"><div><p class="label">Mevcut Auto</p><p class="names">${escape(r.auto.join(' · ') || '—')}</p></div><div><p class="label">Ürün faydası deneyi</p><p class="names">${escape(r.current.join(' · ') || 'Aday yok')}</p></div></div><p class="pick">Benim tercihim: ${escape(picks[i] ?? 'Hiçbiri')}</p><p>${escape(rationale[i])}</p></section>`).join('')}<p>Yerel çakışma verisinde görünmemek güncel müsaitlik anlamına gelmez. Başarı eşikleri değiştirilmedi; üretim varsayılanı Auto olarak kaldı.</p></main></html>`
writeFileSync(resolve(out, 'examples.html'), html)
console.log(JSON.stringify(summary, null, 2))
