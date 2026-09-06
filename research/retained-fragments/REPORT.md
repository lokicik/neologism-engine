# Gerçek kesim ve parça anlamı denetimi

**Çalışan teslim:** Rust/WASM üreticisinin gerçek kesim kaydı, mevcut parça sözlüğüne dayanan konum duyarlı anlam kontrolü ve ayrı, varsayılanı kapalı Lab seçeneği. [Örnekler ve eski/yeni finalistler](artifacts/examples.html).

Bu bir kalite başarısı olarak sunulmuyor. Aynı 12 briefte uygun aday sayısı 170'ten 84'e düştü; önceki 21 asistan tercihinin beşi de kaybedildi: **Maniseal, Acticord, Entryprise, Failthread, Primessage**. Birleşim kanıtını düzeltmek, bütün isim beğenisini çözmedi. Eski Lab ve Auto aynı kaldı.

## Değişen mekanizma

`seamblend::Fusion` artık gerçek sol kesim ve sağ başlangıç konumlarını taşır. Üreticinin kabul ettiği ilk yapım yolu için kaynak kelimeler, kalan yazım parçaları, kaynak/çıktı byte aralıkları ve ortak fonem sayısı saklanır. İsim sonradan parçalanarak bir kaynak hikâyesi uydurulmaz. Örtüşen fonemler ayrı kayıtlıdır; bunlar otomatik olarak kaynak kelimenin tüm harflerinin kaldığı şeklinde yorumlanmaz.

`retained::assess`, mevcut `core/data/submorph.tsv` içindeki pozitif, tam anlam eşleşmesini ve H/T/B konumunu kullanır. Önek yalnızca önek veya iki konumda geçerli kayıtla, sonek yalnızca sonek veya iki konumda geçerli kayıtla eşleşebilir. Süs ekleri anlam kanıtı sayılmaz. Yeni uzunluk eşiği, sözcük, veri satırı veya estetik ağırlık eklenmedi.

Tam kaynak kelime önceki rol kurallarıyla değerlendirilir. Kırpılmış parçada kaynak kelime veya onun doğrudan bağlı olduğu brief terimi için mevcut bir anlam kaydı gerekir. Genel kavram paletleri transitif anlam kanıtı vermez. Kaynak kelimenin varlığı tek başına bir parçayı doğrulamaz. Eksik anlam kanıtı ve üretim soy bilgisi ayrı tutulur.

| İsim | Gerçekte kalan | Mevcut kanıt |
| --- | --- | --- |
| Macheck | ma + check | ma, manifest anlamıyla kayıtlı değil |
| Sigproof | sig + proof | sig → signature, iki konumda geçerli anlam kaydı var |
| Primessage | pri + message | pri → pristine kayıtlı; prism anlamı kayıtlı değil |

Kesim ve anlam kaydı yalnızca yeni `retained_pool` akışında dışa aktarılır. Eski API çıktılarının JSON şekli korunur. Diğer üretici aileleri kendi mevcut kanıtlarını kullanır; bütün motor için parçalı anlam çözümünün tamamlandığı iddia edilmez.

## Lab kullanımı

Brief intent · Lab içinde **Use product benefits on next Generate** açıldığında **Check retained fragment meanings on next Generate** seçeneği görünür. Yeni seçenek başlangıçta kapalıdır. Aday tablosu `ma ← manifest (unattested fragment)` gibi gerçek parçaları gösterir; dışa aktarım tam aralıkları içerir. Ana Generate yeni ayarı alır, Next finalists mevcut isteğin ayarını ve dışlamalarını korur. Beğeniler kaydedilmiş taste verisine aktarılmaz.

## Sonuçları nasıl okumalı?

Kaynakları görerek daha önce seçilmiş beş ismin kaybı açıkça raporlandı; bunları korumak için isme özel istisna veya sözlük satırı eklenmedi. Mevcut parça sözlüğünün genel bir birleşim tanınabilirliği sözlüğü olmadığı görülüyor. Örneğin `prise`, reprise'a iyi bir çağrışım yapabilir, fakat bu envanterde o ilişkiyi doğrulayacak kayıt yok. Bu insan tarafından ölçülmüş tanınabilirlik değildir.

Bu nedenle seçenek **kanıt denetimi deneyi** olarak kaldı. Eski üretimin yerine geçmedi; başarılı isim seçici veya kalite yükseltmesi olarak onaylanmadı. Sayfa boşsa veya kısa kalıyorsa doldurma yapılmaz. Tam sözük ve eski metaforlar hâlâ estetik açıdan zayıf olabilir; doğrulanmış parça da iyi marka garantisi vermez.

Önceki incelemede yazımdan kesim tahmin edilmişti. Burada kayıt üreticinin gerçek kesiminden geliyor; bu ayrım mimari olarak tamamlandı. Yeni bir parça envanteri oluşturmak veya tercih modeli eğitmek bu teslimin kapsamına alınmadı.

## Doğrulama

- 227 Rust testi; kapsam, yanlış anlam/konum, süs ekleri, gerçek aralıklar, fonem örtüşmesi ve eski kanıt davranışı kontrolleri.
- Yeniden üretilen WASM, TypeScript ve web üretim build'i. Mevcut paket boyutu uyarısı devam ediyor.
- 44 koşulun birebir tekrarı ve 44 dışlama içeren devam sayfası; 16/16 eşdeğer brief çifti aynı finalistler. 44 önceki product-brief havuzu, kanıtı ve finalistleri eşleşti. Yeni akışta üreticilerin döndürdüğü isimler ve aile sıraları aynı kaldı.
- Üretimden kaydedilen 1.657 birleşimdeki kaynak/çıktı aralıkları kontrol edildi. Bu sayı 44 ilk ve 44 devam sayfasındaki kaynak kayıtlarının toplamıdır; benzersiz isim veya iyi isim sayısı değildir. 12 ilk sayfanın ayrı kapsam sayımları `inventory-coverage.json` içindedir.
- Auto, held-out, cold, taste, mode-taste ve shortlist kontrolleri aynı eşiklerle geçti. Önceki Auto ve diğer Lab katmanlarının donmuş çıktıları ayrıca tekrar denetlendi.
- Tarayıcıda varsayılanın kapalı olması, gerçek kesim ve sözlük desteği ayrımı, dışa aktarım, devam ayarının korunması, eski moda dönüş, belirsiz brief, mobil taşma ve kaydedilmiş tercihlerin korunması kontrol edildi.

İlk test denemelerinde veri değişikliği bulunmadı: frozen JSON'da bulunmayan JavaScript `undefined` alanları karşılaştırmada normalize edildi; UI testi ilk açılışta üretim isteği yokken sonuç beklemeyecek ve her mod değişiminde yeni çıktıyı bekleyecek şekilde düzeltildi. Motor eşikleri bu test hataları için değiştirilmedi.

Özgün insan kapısı değişmedi: 8/12 galibiyet, en az altı kullanılabilir brief, Auto'ya göre en az üç brief artış ve 3/4 tekrar tutarlılığı. İnsan yanıtı toplanmadı, asistan seçimleri eğitim etiketi yapılmadı.

## Tekrar çalıştırma

```powershell
cargo test --workspace
wasm-pack build wasm --target web --out-dir ../web/src/wasm
node web/node_modules/typescript/bin/tsc -b web
node research/retained-fragments/check.mjs --replay
node research/retained-fragments/legacy-replay.mjs
node research/product-brief/audits.mjs ../retained-fragments/audits
node research/retained-fragments/ui-check.mjs
node research/retained-fragments/analyze.mjs
node research/retained-fragments/examples-check.mjs
node research/retained-fragments/finalize.mjs
```

Build'i `web` içinde `node node_modules/vite/bin/vite.js build` ile çalıştırın. Tarayıcı harness'ini kullanan komutlar 4246 portunu paylaştığı için sırayla çalıştırılır. Kaynak ve veri kimlikleri `artifacts/identity.json`, son doğrulama `artifacts/delivery.json` içindedir. Önceden değiştirilmiş `concept_bridges.tsv` ve `story_kb.tsv` korunur.
