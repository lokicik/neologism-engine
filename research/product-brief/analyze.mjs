import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { hash } from '../shared-pool/harness.mjs'
const out = resolve(import.meta.dirname, 'artifacts-v3')
const read = (f) => JSON.parse(readFileSync(resolve(out, f)))
const comparison = read('comparison.json'), verification = read('verification.json')
const rows = comparison.rows.filter((r) => r.partition === 'regression')
const trace = (stage, r) => JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, stage, r.traceFile)))).current
const stageSummary = (stage) => {
  const result = { returned: 0, eligible: 0, missingObject: 0 }
  for (const r of rows) {
    const run = trace(stage, r)
    result.returned += run.families.find((f) => f.family === 'seamblend').returned
    for (const p of run.proposals) for (const s of p.sources.filter((s) => s.family === 'seamblend')) {
      if (!s.rejection) result.eligible++
      if (s.rejection === 'missing_object_evidence') result.missingObject++
    }
  }
  return result
}
const picks = ['ArchiveProof', 'HashSeal', 'QueryGauge', 'StorageGauge', 'QueueWatch', 'ProcessWatch', 'Reprise', 'Entryprise', 'Halka', 'Primessage', 'Portolan', 'Lantoken']
const notes = [
  'Arşiv ve doğrulama bağlantısı açık; önceki sürümde de vardı.',
  'Hash ile onay/mühür ilişkisini anlaşılır biçimde taşıyor; önceki sürümde de vardı.',
  'Sorgu–gecikme ilişkisi korunduğu için QueryGauge yeniden aday olabiliyor.',
  'Depolama maliyeti ölçümünü çağrıştırıyor; kısa bir açıklama adı olmaya yakın.',
  'Kuyruk izlemeyi doğrudan anlatıyor; önceki sürümde de vardı.',
  'İşlem izlemeyi doğrudan anlatıyor; önceki sürümde de vardı.',
  'Önceki duruma geri dönüş metaforu; diğer yeni birleşimlerden daha doğal buluyorum.',
  'Entry + reprise. Enterprise çağrışımı da var; yeni birleşimler içinde denemeye değer buluyorum.',
  'Gruplama için halka metaforu; biçimsel birleşimlerden daha doğal buluyorum.',
  'Prism + message. Yeni birleşimler içinde akıcı buluyorum; prime message şeklinde de okunabilir.',
  'Haritalama metaforu; Auto zaten bu adı sunuyordu.',
  'Lantern + token. Söylenişini denemeye değer buluyorum; güvenlik anlamı açıklama olmadan zayıf.'
]
const review = rows.map((r, i) => {
  assert(r.current.includes(picks[i]))
  assert.equal(hash(readFileSync(resolve(out, r.traceFile))), r.sha256)
  return { brief: r.brief, suggestion: picks[i], rationale: notes[i], method: 'assistant, source-visible; not human validation or training' }
})
const summary = { ...verification, regressionBriefs: rows.length, previousNonempty: rows.filter((r) => r.old.length).length,
  currentNonempty: rows.filter((r) => r.current.length).length,
  seamblend: { initial: stageSummary('artifacts'), bounded: stageSummary('artifacts-v2'), final: stageSummary('artifacts-v3') },
  humanQualityGate: 'pending; thresholds unchanged', qualityImprovementEstablished: false }
writeFileSync(resolve(out, 'analysis.json'), JSON.stringify({ summary, assistantReview: review }, null, 2))
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anlamı koruyan isim üretimi</title><style>body{margin:0;background:#111217;color:#ececf1;font:16px/1.65 system-ui}main{max-width:1160px;margin:auto;padding:30px 22px}h1{font-size:30px;line-height:1.2}h2{font-size:18px}section{border-top:1px solid #373841;padding:24px 0}.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.label{font-size:13px;color:#b4b7c4}.names{font-size:19px;font-weight:600}.pick{color:#aadebd}p{margin:8px 0}a{color:#b9b3ff}summary{cursor:pointer}@media(max-width:700px){.cols{grid-template-columns:1fr}}</style><main><h1>Anlamı koruyan isim üretimi</h1><p>16/16 eşdeğer ifade çiftinde aynı finalistler · 12 mevcut briefte karşılaştırma · tohum 13</p><p>İşlem eşdeğerleri ve ürün–özellik ilişkisi korunuyor. Destek sözcükleri ayrı tutuluyor; birleşim üreticisi genel kelime komşularıyla havuzu doldurmuyor.</p><p>Aşağıdaki seçimler benim önerilerim. Bunlar insan değerlendirmesi, eğitim verisi veya kanıtlanmış kalite artışı değildir. <a href="../REPORT.md">Teknik rapor</a></p>${rows.map((r,i)=>`<section><h2>${i+1}. ${esc(r.brief)}</h2><div class="cols"><div><p class="label">Mevcut Auto</p><p class="names">${esc(r.auto.join(' · '))}</p></div><div><p class="label">Önceki Lab</p><p class="names">${esc(r.old.join(' · ')||'Aday yok')}</p></div><div><p class="label">Son Lab</p><p class="names">${esc(r.current.join(' · ')||'Aday yok')}</p></div></div><p class="pick">Benim tercihim: ${esc(picks[i])}</p><p>${esc(notes[i])}</p><details><summary>Nasıl okundu?</summary><p>İsim kökleri: ${esc(r.generationTerms.join(', '))}</p><p>Ürün: ${esc(r.relation?.subject.surface??'—')} · özellik: ${esc(r.relation?.property.surface??'—')}</p><p>Destek bilgisi: ${esc(r.relation?.supporting_terms.map(t=>t.surface).join(', ')||'—')}</p></details></section>`).join('')}<p>Yerel çakışma verisinde görünmemek güncel müsaitlik anlamına gelmez. Auto varsayılan olarak korunuyor.</p></main></html>`
writeFileSync(resolve(out, 'examples.html'), html)
console.log(JSON.stringify(summary, null, 2))
