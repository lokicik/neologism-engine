import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { hash } from '../shared-pool/harness.mjs'
const out=resolve(import.meta.dirname,'artifacts')
const comparison=JSON.parse(readFileSync(resolve(out,'comparison.json')))
const rows=comparison.rows.filter(r=>r.partition==='regression')
const runs=rows.map(r=>{
  assert.equal(hash(readFileSync(resolve(out,r.traceFile))),r.sha256)
  return JSON.parse(gunzipSync(readFileSync(resolve(out,r.traceFile)))).current
})
const occurrences=[]
for(const [i,run] of runs.entries()) for(const p of run.proposals) for(const s of p.sources) {
  if(!s.semantic?.retained_construction)continue
  for(const part of s.semantic.retained_construction.parts) occurrences.push({brief:rows[i].brief,name:p.name,family:s.family,rank:s.rank,...part})
}
const missing=new Map()
for(const p of occurrences.filter(p=>p.status==='unattested_fragment')) {
  const key=`${p.fragment}←${p.parent}:${p.start===0?'head':'tail'}`
  const entry=missing.get(key)??{fragment:p.fragment,parent:p.parent,position:p.start===0?'head':'tail',occurrences:0,names:[]}
  entry.occurrences++;if(!entry.names.includes(p.name))entry.names.push(p.name)
  missing.set(key,entry)
}
writeFileSync(resolve(out,'inventory-coverage.json'),JSON.stringify({scope:'12 regression first pages; source-part occurrences, not unique fragments or human recognizability',
  counts:{all:occurrences.length,whole:occurrences.filter(p=>p.status==='whole_parent').length,attested:occurrences.filter(p=>p.status==='attested_fragment').length,unattested:occurrences.filter(p=>p.status==='unattested_fragment').length},
  missing:[...missing.values()].sort((a,b)=>b.occurrences-a.occurrences||a.fragment.localeCompare(b.fragment)),occurrences},null,2))
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const names=ns=>esc(ns.join(' · ')||'Aday yok')
const label=s=>({whole_parent:'tam kaynak kelime',attested_fragment:'mevcut anlam kaydı var',unattested_fragment:'mevcut anlam kaydı yok'}[s]??s)
const details=p=>p.sources.filter(s=>s.semantic?.retained_construction).map(s=>`<p>${esc(s.family)} #${s.rank} · karar: ${esc(s.rejection??'uygun')}</p>${s.semantic.retained_construction.parts.map(part=>`<p class="part"><strong>${esc(part.fragment)}</strong> ← ${esc(part.parent)} · ${label(part.status)}${part.associations.length?' ('+esc(part.associations.join(', '))+')':''}<br><span class="small">Kaynak aralığı [${part.source_start}, ${part.source_end}) · isimde [${part.start}, ${part.end})</span></p>`).join('')}`).join('')
const examples=['macheck','sigproof','acticord','entryprise','primessage'].map(id=>runs.flatMap(r=>r.proposals).find(p=>p.id===id))
assert(examples.every(Boolean))
writeFileSync(resolve(out,'examples.html'),`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>İsimde gerçekten ne kalıyor?</title><style>
*{box-sizing:border-box}body{margin:0;background:#111418;color:#e6e9ed;font:16px/1.65 system-ui}main{max-width:1120px;margin:auto;padding:36px 24px}h1{font-size:32px;line-height:1.25}h2{font-size:20px}p{margin:10px 0}a{color:#b7cff2}.small{font-size:13px;color:#adb9c7}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.names{font-size:20px;font-weight:600}.case{border-top:1px solid #34404b;padding:20px 0}.part{background:#1b242c;padding:10px 14px;border-left:2px solid #87a3b8}.notice{border-left:3px solid #ceac79;padding-left:16px}.cut-cases{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cut-cases article{min-width:0}summary{cursor:pointer;padding:8px 0}.lost{color:#e0bd89}input{background:#1b242c;color:inherit;padding:10px;border:1px solid #687e90;font:inherit;width:100%}[hidden]{display:none!important}@media(max-width:700px){main{padding:24px 16px}h1{font-size:27px}.cols,.cut-cases{grid-template-columns:1fr}.names{overflow-wrap:anywhere}}
</style><main><p class="small">RUST / WASM · AYRI LAB DENEYİ · TOHUM 13</p><h1>İsimde gerçekten ne kalıyor?</h1><p>Üretici artık tam kaynak kelimeyle birlikte gerçek harf kesimini de kaydediyor. Anlam kontrolü, kırpılmış parçanın mevcut sözlükte o anlamı ve kullanım konumunu taşıyıp taşımadığına bakıyor.</p><p class="notice">Bu kontrol daha iyi isimler ürettiğimizi kanıtlamadı. Uygun adaylar 170 → 84 oldu; önceki 21 asistan tercihinden beşi de kanıt eksikliği nedeniyle elendi. Yeni seçenek varsayılan olarak kapalı. “Kayıt yok” demek “kötü isim” demek değil.</p><p>Uygulama: <strong>Brief intent · Lab → Use product benefits → Check retained fragment meanings</strong>. Sonraki Generate isteğine uygulanır; devam mevcut isteği korur.</p><p><a href="../REPORT.md">Teknik rapor</a> · <a href="inventory-coverage.json">Parça sözlüğünün kapsamı</a> · <a href="comparison.json">44 koşulun sonuçları</a></p>
<h2>Gerçek üretimden beş örnek</h2><div class="cut-cases">${examples.map(p=>`<article><h3>${esc(p.name)}</h3>${details(p)}</article>`).join('')}</div>
<h2>12 brief: önceki Lab ve parça denetimi</h2><p>Yalnızca uygunluk değişti. Aday yazımları, üretici sıraları, aile bütçeleri ve estetik ağırlıklar aynı kaldı. Aşağıdaki farklar kalite galibiyeti değildir.</p><label>Birleşim ara <input id="search" type="search" placeholder="örn. Sigproof"></label><p id="count" class="small" aria-live="polite"></p>
${rows.map((r,i)=>`<section class="case"><h2>${i+1}. ${esc(r.brief)}</h2><div class="cols"><div><p class="small">ÖNCEKİ LAB · ${r.oldEligible} uygun aday</p><p class="names">${names(r.old)}</p></div><div><p class="small">PARÇA DENETİMİ · ${r.currentEligible} uygun aday</p><p class="names">${names(r.current)}</p></div></div>${r.lostChoices.length?`<p class="lost">Kanıt eksikliğinden kaybedilen önceki asistan tercihi: ${names(r.lostChoices)}</p>`:''}<details class="pool"><summary>Bu briefin gerçek birleşim kayıtları</summary>${runs[i].proposals.filter(p=>p.sources.some(s=>s.semantic?.retained_construction)).map(p=>`<article class="candidate" data-name="${esc(p.id)}"><h3>${esc(p.name)}</h3>${details(p)}</article>`).join('')}</details></section>`).join('')}
<p>Yerel çakışma verisinde bulunmamak güncel müsaitlik anlamına gelmez. İnsan kalite kapısı aynı: 8/12 galibiyet, en az altı kullanılabilir brief, Auto'ya göre en az üç brief artış, 3/4 tekrar tutarlılığı. İnsan değerlendirmesi bekliyor.</p></main><script>const input=document.querySelector('#search');input.addEventListener('input',()=>{let n=0;for(const p of document.querySelectorAll('.candidate')){p.hidden=!p.dataset.name.includes(input.value.trim().toLowerCase());if(!p.hidden)n++}for(const s of document.querySelectorAll('.case')){s.hidden=!!input.value&&!s.querySelector('.candidate:not([hidden])');if(input.value&&!s.hidden)s.querySelector('.pool').open=true}document.querySelector('#count').textContent=input.value?n+' birleşim kaydı':''})</script></html>`)
console.log(JSON.stringify({firstPageParts:occurrences.length,unattested:occurrences.filter(p=>p.status==='unattested_fragment').length,examples:examples.map(p=>p.name)},null,2))
