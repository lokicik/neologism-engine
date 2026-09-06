# Brief intent deneyi — 2026-09-05

**Katman çalışıyor; bazı kayıp kavramları geri getiriyor. Ancak yeni brief'lerde genel bir isim kalitesi üstünlüğü göstermedi. Auto varsayılanı korunuyor.**

## Ne değişti?

Create ekranına **Brief intent · Lab** eklendi. Rust içindeki sınırlı İngilizce dilbilgisi okuyucusu işlem, nesne, koşul ve bağlam terimlerini ayrı kaydediyor. Terimler özgün brief içindeki konumlarıyla dışa aktarılıyor. Küçük anahtar kelime bütçesinde asıl işleme öncelik veriliyor; mevcut kök paletleri kavram başına sınırlanıyor. Dokuz üretici ve ortak havuzun finalist seçimi aynı kalıyor.

Üretim/eğitim için LLM yok. Yeni isim veya anlam sözlüğü eklenmedi; estetik ağırlıkları ve kayıtlı beğeni verileri değiştirilmedi. Belirsiz/olumsuz/uygunsuz girdiler eski okuyucuya dönüyor; bu, eski okuyucunun bu ifadeleri doğru anladığı anlamına gelmiyor.

## Somut örnekler

Aşağıdaki örnekler artık geliştirme verisidir. Hepsi aynı ilk tohumla, **13**, üretilmiştir; en iyi tohum seçilmemiştir.

| Brief | Auto finalistleri | Önceki ortak havuz | Brief intent havuzu |
|---|---|---|---|
| Checksum doğrulama | Halyard, Tagora, Pushify | Calcastro, Forgebeam, Kura, RareTag | **Verospec**, Stacklink, **Mihenk**, NewByte |
| API sürümleri arasında JSON yanıtı karşılaştırma | Tropic, Termia, Shellio | Autocalc, Termatlas, Falconer, KeyShell | Datalum, Commitflow, **Terazi**, TopTag |
| Yayımlama öncesi bağımlılık lisansı denetimi | Creatic, DepSeed, Bumpify | Plasserv, Versionloom, Matbaa, TopSync | Plasserv, Stacklink, Matbaa, TopSync |

Checksum örneğinde eski altı terim `assistant, package, release, binary, checksum, downloadable` idi; `verify` bütçeye giremiyordu. Yeni girdi `verify, checksum, downloadable, binary, package`. **Verospec/Mihenk benim değerlendirmemde daha ilgili ve kullanılmayı değerlendirebileceğim seçenekler.** JSON örneğinde `compare, json, response, api, version` korunuyor; Terazi karşılaştırma çağrışımı taşıyor. Lisans denetiminde ise kayda değer ilerleme yok.

Bu yorumlar asistanın editoryal değerlendirmesidir. Türkçe çağrışımları etkiler; insan beğenisi veya küresel kullanıcı tercihi ölçülmedi. Alan adı/paket adı müsaitliği doğrulanmadı.

## Sekiz ayrı brief üzerindeki değerlendirmem

Üç sorunlu örnekten ayrı sekiz brief, çıktılar görülmeden önce `protocol.json` içinde sabitlendi. Her biri 13, 67, 313 tohumlarıyla çalıştırıldı. Aşağıdaki editoryal karşılaştırma yalnızca ilk listedeki tohum 13'ü kullanır ve **yeni havuzu önceki ortak havuzla** karşılaştırır; Auto'ya karşı insan başarı ölçütü değildir.

| Brief | Tercihim | Kullanmayı değerlendireceğim aday |
|---|---|---|
| Tekrarlanan ortam değişkenlerini bulma | İkisi de değil | — |
| Geri yüklemeden önce veritabanı yedeğini doğrulama | Önceki havuz | İkisinde de Verospec; öncekinde ayrıca Mihenk |
| Sürümler arasında çalıştırılabilir dosya boyutu karşılaştırma | İkisi de değil | — |
| Bağlantı hatasından sonra veritabanı işlemlerini tekrar oynatma | İkisi de değil | — |
| Sertifika sürelerini izleme | Yeni havuz, sınırlı tercih | Izci; takip fikri var, sertifika özgüllüğü yok |
| Form erişilebilirliği hatalarını açıklama | İkisi de değil | — |
| Çökmeleri eşleşen stack trace'lerle gruplama | Önceki havuz | Tracepeak |
| Yapılandırma referanslarını haritalama | Eşit | İkisinde de Portolan |

Sonuç: **1 yeni, 2 önceki, 1 eşit, 4 ikisi de değil.** Kullanılabilir saydığım aday sunan brief sayısı iki havuzda da 3/8; yeni tarafta Izci koşullu bir seçim. Tam gerekçeler `assistant-review.json` içindedir. Bunlar kör veya insan yanıtları değildir; özgün 8/12 ve diğer geçiş eşikleri bu sonuçlarla karşılanmış sayılmaz.

## Teşhis ve karar

İşlemi korumak yararlı, fakat tek başına yeterli değil. Yeni akış da anlamı belirsiz birleşimler ve genel `Stack/Query/Forge` türevleri üretebiliyor. İki somut kalan kayıp: mevcut gövdeleyici `sizes` sözcüğünü `siz` yapıyor; üç nesne terimi sınırı `accessibility, failure, rendered` sonrasında asıl `form` kavramını dışarıda bırakabiliyor. Üreticiler hâlâ terimleri büyük ölçüde bağımsız kavramlar olarak kullanıyor; işlem–nesne ilişkisini şart koşmuyor.

Bu sonuçları görüp sözlük veya eşik ayarlaması yapmadım. Aynı sekiz brief bundan sonra yeni/görülmemiş test verisi sayılamaz. Deney **Lab'de kalmalı**. Sonraki anlam çalışmasının odağı, daha fazla rastgele aday üretmekten önce, doğru isim/fiil gövdesini ve işlem–nesne ilişkisinden gerçekten kullanılabilir kavram malzemesine geçişi korumak olmalı. Mevcut bulgular daha geniş bir yeniden yazımı veya yeni varsayılanı haklı çıkarmıyor.

## Doğrulama

- **211 Rust testi geçti**; WASM yeniden üretildi; TypeScript ve üretim build'i geçti.
- **48 özgün Auto sayfası/finalist grubu ve 48 özgün ortak havuzun tüm aday/eleme kayıtları birebir korundu.** Süre alanları karşılaştırmadan çıkarıldı.
- **33 yeni koşul** (3 geliştirme + 8 ayrı brief, üçer tohum): tam havuz/iz/finalist tekrarlanabilirliği, devamda büyük harfli dışlamalar, 9×24 sınırı, kaynak konumları ve en fazla dört finalist geçti.
- İmkânsız koşul boş finalist döndürüyor; olumsuz brief'te fallback önceki havuzla birebir aynı.
- Mevcut Auto, held-out, cold, taste, mode-taste ve shortlist denetimlerinin **altısı da geçti**; eşikler değişmedi.
- Masaüstü/mobil gerçek tarayıcıda üretim, rol açıklamaları, Keep'in oturumda kalması, dışa aktarım, taslak değişse bile özgün brief'le devam ve modlar arası ayrım kontrol edildi. Ekran görüntüleri ayrıca görsel olarak incelendi.

Tam karşılaştırma `artifacts/comparison.json`; kaynak/veri kimliği `artifacts/identity.json`; sıkıştırılmış izler `artifacts/trace-*.json.gz`; altı denetimin kayıtları `artifacts/verification.json` ve log dosyalarıdır. UI dışa aktarımı sentetik test verisidir. WASM yaklaşık 1.03 MB; mevcut büyük paket uyarıları devam ediyor. Süreler kalite kanıtı olarak kullanılmıyor.
