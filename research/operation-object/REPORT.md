# İşlem–nesne deneyi — 2026-09-05

**Uygulama tamamlandı. Sözcük kayıplarını düzeltiyor ve genel isimlerin nerede elendiğini gösteriyor; ancak bu katı bağlantı kuralı isim kalitesinde beklediğimiz ilerlemeyi sağlamadı. Varsayılan kapalı kalıyor.**

## Kullanım ve değişiklik

**Create → Brief intent · Lab → Require operation–object links on next Generate** seçeneğini açıp Generate'e basın. Sonraki finalistler, üretildikleri brief ve seçenek durumuyla devam eder. Taslağı veya kutucuğu değiştirmek mevcut çalışmanın devamını değiştirmez.

- `sizes → size` gibi gövdeleme adayları mevcut sözcük verisiyle doğrulanıyor. Bu veri isim üretim sözlüğüne eklenmiyor.
- Nesnenin ana sözcüğü önce yerleştiriliyor; nesne öbeğinin bütün terimleri ve özgün konumları kayıtta tutuluyor. `forms`, önceki üç nesne terimi sınırında kaybolduğu örnekte artık üretim terimlerine ulaşıyor.
- İşlem ve nesne için ayrı malzeme grupları hazırlanıyor. Yalnızca brief'teki sözcükler, mevcut kavram paletleri ve doğrudan kayıtlı anlam parçaları kullanılıyor.
- Adayın iki ayrı, çakışmayan bölümünde bu köklere tam bağlantı aranıyor. Genel veya tek taraflı isimler finalist olmuyor. Dört isim doldurma zorunluluğu yok; çözümlenemeyen brief'te bu kontrol sessizce gevşetilmiyor.
- Boş sonuçta **Inspect rejected pool** ile bütün adaylar ve eksik bağlantıları incelenebiliyor. JSON, her bağlantının kökünü, kaynağını ve isim içindeki konumunu içeriyor.

LLM, model eğitimi, yeni isim sözlüğü veya estetik ağırlık değişikliği yok. Auto, önceki iki Lab akışı ve kayıtlı beğeniler korunuyor.

## Sonuçlar

Daha önce gördüğümüz dört sorunlu brief geliştirme girdisi olarak ayrıldı. Altı başka brief, sonuçlar görülmeden önce `protocol.json` içinde sabitlendi. Her biri 13, 67, 313 tohumlarıyla çalıştırıldı. Aşağıdaki örnekler ilk tohum **13**; iyi görünen tohum sonradan seçilmedi.

| Yeni brief | Önceki Brief intent finalistleri | Bağlantı kontrolü açık |
|---|---|---|
| Veritabanı şemalarını karşılaştırma | Flucalc, Bridgebeam, Multain, PureQuery | Boş |
| Yapılandırma dosyalarını doğrulama | Verospec, Shipsignal, Mihenk, PureEnv | VerSeek |
| Bellek kullanımını izleme | Codexport, Runsignal, Mihenk, BoldRun | Boş |
| Log mesajlarını önem derecesiyle gruplama | Vocalex, Scopelink, Halka, BoldBond | GroupLink |
| Klavye kısayollarını haritalama | Nautiverb, Browsr, Atlasseed, Portolan | MapShortcut, RoamShortcut |
| Arşiv boyutunu denetleme | Notasec, Stacklink, Kura, TopSiz | Boş |

Yeni akış üç tohumun her birinde **6 brief'in 3'ünde** finalist verebildi. Bu sayı kullanılabilirlik veya beğeni ölçüsü değildir. Diğer üçü boş kaldı; zayıf isimlerle doldurulmadı.

Benim ilk tohum üzerindeki editoryal tercihim **0 yeni, 3 önceki, 3 ikisi de değil**. Dosya doğrulamada Verospec/Mihenk'i, gruplamada Halka'yı, haritalamada Portolan'ı tercih ediyorum. VerSeek okunabilir olsa da doğrulamadan çok aramayı çağrıştırıyor; GroupLink genel kalıyor; MapShortcut bir marka yerine fonksiyon adı gibi duruyor. Ayrıntılar `assistant-review.json` içinde. Değerlendiren asistan kaynak etiketlerini gördü; bunlar kör/insan yanıtları değildir ve eğitim verisi yapılmadı.

Geliştirme örneklerinden checksum doğrulama yalnızca `VerChecksum` bırakıyor. Sözcük bağlantısı açık, fakat benim gözümde önceki Verospec/Mihenk'ten daha iyi bir isim değil. Daha fazla sözcüğü açıkça taşımak estetiği garanti etmiyor.

## Artık hangi aşamanın sorunlu olduğunu görebiliyoruz

`artifacts/diagnosis.json`, ilk tohumdaki iç üretici kayıtlarını aynı dondurulmuş kök planıyla inceliyor. Bu inceleme seçimi değiştirmiyor.

1. **Üretici filtresi:** `CompareSize`, `CompareRow`, `CompareData` ve `TrackUsage` oluşturulmuş, fakat ortak havuza ulaşmadan `legacy.filter: syllables` aşamasında elenmiş. Kuralı geçemedikleri kayıtla sabit; bu, isimlerin insan tarafından iyi bulunacağı anlamına gelmez.
2. **Ortak havuz kısıtı:** `CheckSize` iki rolün bağlantısını taşıyor ve havuza ulaşıyor; yerel çakışma anlık görüntüsüne takılıyor. Bunu atlamadım. Bloom eşleşmesi güncel kesin kullanım veya hukuki sonuç değildir.
3. **Bağlantının anlamı:** Mevcut `file → seek` veya `message → link` paletleri mekanik kanıt sayılabiliyor, fakat projenin işlevini yeterince anlatmayabiliyor. Bir palet kaydı, anlam eşdeğerliği kanıtı değildir.
4. **Nesne öbeği:** `memory usage` içinden yalnızca `usage` başını zorunlu tutmak ayırt edici `memory` bilgisini ikinci plana itiyor. Tüm terimler üretime ulaşsa bile tek ana sözcük üzerinden kurulan kontrol birleşik nesneleri yeterince temsil etmiyor.

Bu nedenle bu seçeneği bir kalite iyileştirmesi olarak varsayılan yapmıyorum. **Katı iki-kök filtresini daha fazla sıkılaştırmayı önermiyorum.** Elde edilen yarar; yanlış gövdelemeyi düzeltmek ve malzeme, iç filtre, havuz kısıtı ve anlam zayıflığını birbirinden ayırabilmek. Bir sonraki tasarımın birleşik nesneleri ve telaffuz filtresini birlikte hesaba katması gerekir; eldeki sonuçlar yeni bir varsayılanı haklı çıkarmıyor.

Bu altı brief artık görülmemiş veri sayılamaz. Sonuçları gördükten sonra kök eşleştirmeleri, filtre eşikleri veya estetik puanları ayarlanmadı. Özgün insan değerlendirmesi ve geçiş eşikleri değişmedi.

## Doğrulama

- **214 Rust testi geçti.** WASM yeniden derlendi; TypeScript ve üretim web build'i geçti.
- **48 Auto sayfası, 48 ilk ortak havuz ve 33 önceki Brief intent havuzu**, aday/iz/finalist kayıtlarıyla birebir tekrarlandı. Yalnızca süre alanları dışarıda bırakıldı.
- **30 yeni koşul**: her tam havuz tekrarlandı; devamda büyük harfli dışlamalar, 9×24 sınırı, en fazla dört finalist, özgün sözcük konumları ve ayrı kök kanıtları doğrulandı.
- Olumsuz, işlemi belirsiz ve birden fazla nesneyi bağlayan kontrol brief'leri boş finalist bıraktı. İmkânsız uzunluk/başlangıç koşulu da boş kaldı.
- Mevcut altı Auto/held-out/cold/taste/mode-taste/shortlist denetimi geçti; eşik değişikliği yok.
- Gerçek tarayıcıda anahtarın yalnızca sonraki Generate'i etkilemesi, seçeneği kapattıktan sonra mevcut sonuçla devam, JSON dışa aktarımı, eski Brief intent'e dönüş, boş havuz incelemesi ve kayıtlı verilerin korunması geçti. Masaüstü ve mobil görüntüler incelendi.

Kod/veri/WASM kimliği `artifacts/identity.json`; tam karşılaştırma `artifacts/comparison.json`; sıkıştırılmış kayıtlar `artifacts/trace-*.json.gz`; altı güncel denetimin kopyalanmış logları ve sonuçları `artifacts/verification.json` içindedir. UI dışa aktarımı sentetik test kaydıdır. WASM yaklaşık 1.06 MB; mevcut büyük paket uyarıları sürüyor.
