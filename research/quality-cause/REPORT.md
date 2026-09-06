# İsim kalitesi: neden araştırması — 2026-09-05

**Somut sorun, yalnızca yeterince aday üretememek değil. Mevcut adayların ürünün asıl işine göre sıralanmaması ve finalist aşamasında kaybolması.** Ayrıca telaffuz yerine harf grubu sayan filtrede yanlış elemeler var. Üçü ayrı mekanizmalar; tek bir estetik ağırlık ayarıyla çözüldüklerine dair kanıt yok.

Bu çalışma yeni bir Lab seçeneği eklemiyor. Üretim kodu, veri ve WASM değişmedi. Daha önce görülmüş altı brief ve üç tohum üzerinden neden teşhisi yapıldı; yeni held-out değerlendirme veya insan tercihi testi değildir. Aşağıdaki isimlerin daha uygun olduğu yorumu asistana aittir. Çakışma verisinde bulunmamaları güncel müsaitlik anlamına gelmez.

## 1. Brief rolleri ayrıştırılıyor, fakat Reason sıralamasında tekrar eşitleniyor

`core/src/reason.rs:142` içindeki `activate`, çıkarılan bütün anahtar sözcükleri aynı **1.0** başlangıç ağırlığıyla etkinleştiriyor. İşlem, nesne, koşul ve bağlam ayrımı bu aşamada kullanılmıyor. `generate_reason_explained` en güçlü bağlantı ve ilave etiket toplamına göre sıralıyor; bağlantının ürünün yaptığı işi mi yoksa yan koşulu mu anlattığı bir tercih ölçütü değil.

**Kontrollü bulgu:** Aynı brief, veri ve tohumla yalnızca üretim terimlerinin sırasını ters çevirdim. **18/18 Reason sayfasında isimler ve sıraları aynen kaldı.** Önceki “işlem sözcüğünü başa koy” değişikliği bu üreticide anlamsal öncelik oluşturmuyor. Bu sonuç diğer bütün üreticilerin sıra duyarsız olduğunu iddia etmez.

Koşul/bağlam terimlerini çıkarıp işlem ve nesneyi bırakan ayrı müdahale, aynı envanterde şu değişimleri üretti (tohum 13):

| Brief | Önce Reason lideri | İşlem + nesne kontrolünde lider | Kaybolan yan bağlam |
|---|---|---|---|
| Çalıştırılabilir dosya boyutlarını karşılaştırma | Creatic | Terazi | build / release / tags |
| Bağımlılık lisanslarını denetleme | Matbaa | Plumbline | publishing / package / build |
| Test sırasında bellek kullanımını izleme | Mihenk | Sankofa | test / runs / terminal |

Bu, bağlamın sıralamayı bozabildiğine dair nedensel kanıt. **Bağlamı tamamen silmek önerilen çözüm değil:** bellek örneğinde lider bu kez izleme yerine hatırlama çağrışımına kayıyor. İşlem ve birleşik nesne (`memory usage`, `dependency licenses`) birlikte temsil edilmeli.

## 2. Ortak havuz, uygun adayın görülmesini garanti etmiyor

`web/src/lib/candidate-pool.ts:63` içindeki seçici aileleri tohumla karıştırıp mevcut aile içi sırayı koruyor. Dört finalist dolunca duruyor; anlam durumu `missing` olsa da aday diğer filtrelerden geçiyorsa seçilebiliyor. Bu, ilk deneyde istenen eşit aile değerlendirmesini uyguluyor; kaliteye göre seçim yapmıyor.

**Kontrol:** Önceki Brief intent çalışmasından altı havuzu olduğu gibi yükledim. Canlı seçici, kayıtlı finalistlerin tamamını yeniden üretti. Üretimi tekrar çalıştırmadan her havuzda sadece seçim tohumunu 0–255 arasında değiştirdim: **1.536 seçim koşulu**.

| Aday | Havuzdaki kaynak / sıra | Tohum 13'te durum | 256 seçim sırasındaki erişim |
|---|---|---|---|
| Metrack — bellek takibi | Seamblend / 1 | `finalist_limit` | 106/256 |
| Izci — bellek takibi | Reason / 3 | `finalist_limit` | 0/256 |
| Terazi — boyut karşılaştırma | Reason / 7 | `finalist_limit` | 0/256 |
| Kiyas — boyut karşılaştırma | Reason / 9 | `finalist_limit` | 0/256 |
| Plumbline — lisans denetimi | Reason / 5 | `finalist_limit` | 0/256 |

Metrack zaten ailesinin ilk adayı; kaybı aile sırasından kaynaklanıyor. Diğerleri için aile sırasını değiştirmek yetmiyor: mevcut aile içi sıra da engel. Bu 256 koşul bütün olası tohumların ispatı değildir; üretim tohumları ve adaylar sabit tutulmuştur.

İkinci sabit-havuz kontrolünde sadece Reason kaynaklarının sırasını değiştirdim: yapılandırılmış zinciri doğrudan işlem sözcüğünden başlayanlar öne alındı, kendi aralarındaki eski sıraları korundu. İsim, açıklama metni, yapısal puan, çakışma veya uygunluk filtreleri değişmedi. Özel isim listesi kullanılmadı.

| Brief | Önceki dört finalist | Sadece Reason sırası değişince |
|---|---|---|
| Boyut karşılaştırma | Creagen, Commitflow, **Multain**, PureSiz | Creagen, Commitflow, **Terazi**, PureSiz |
| Lisans denetleme | Plasserv, Stacklink, **Matbaa**, TopSync | Plasserv, Stacklink, **Plumbline**, TopSync |
| Bellek takibi | Codexport, Runsignal, **Mihenk**, BoldRun | Codexport, Runsignal, **Izci**, BoldRun |

Multain'in kayıtlı zinciri `build → maintain`, Matbaa'nın `publishing`, Mihenk'in bellek brief'indeki zinciri `test`. Yerlerine gelen adayların zincirleri sırasıyla `compares`, `checks`, `tracks`. Diğer üç brief'in finalistleri değişmedi.

**Bu bir üretim önerisinin başarı testi değil.** Dört isimlik sayfaların geri kalanı hâlâ zayıf olabilir; lisans için Plumbline genel bir doğruluk metaforu. Fakat daha doğrudan işlem bağlantısı olan isimleri göstermek için yeni jeneratör veya sözlük gerekmediği kanıtlandı. Ortak havuzun tamamen kullanılmaz olduğu varsayımı bu örneklerde doğru değil.

## 3. Gerçek bir yanlış eleme: hece yerine sesli harf grupları

`core/src/phonotactics.rs:145` harf gruplarını sayıyor. `core/src/lib.rs:1037` bunu non-compound Brandable yolunda üç hecelik sert sınır olarak kullanıyor. Sessiz `e` gibi telaffuz özellikleri bu tahminde yok.

Mevcut telaffuz sözlüğündeki **tam işlem/nesne köklerinin** sayılarıyla karşılaştırdım; keyfî sözcük parçalama yapılmadı:

| Elenen ad | Harf grubu tahmini | Sözlükte bileşenlerin heceleri | Toplam |
|---|---:|---|---:|
| CompareSize | 5 | compare 2 + size 1 | 3 |
| CheckLicense | 4 | check 1 + license 2 | 3 |
| TrackUsage | 4 | track 1 + usage 2 | 3 |
| GroupMessage | 4 | group 1 + message 2 | 3 |
| VerifyFile | 5 | verify 3 + file 1 | 4 |

Bileşen toplamı, yeni markanın bütünü için insan telaffuz kaydı değildir. VerifyFile gerçekten de üç sınırını aşıyor; her geri kazanılan ad yanlış elenmiş sayılmadı.

**Karşı müdahale:** Sadece araştırma koşusunda hece sınırını kaldırdım. Katı ilişki kapsamındaki 18 üretimde, ayrı koşullar üzerinden toplam 27 yeni işlem–nesne bağlantılı ad sonuç sayfalarına geldi. Bu sayı tekil marka veya beğeni sayısı değildir. Buna rağmen ilk aday **14/18** koşulda aynı kaldı. Örneğin TrackUsage geri geliyor ama Trackia/Trackix gibi biçimler üst sıralarda kalıyor; CompareSize çoğunlukla bir marka yerine işlev adı gibi okunuyor. Filtre hatası gerçek, estetik sorunun tamamı değil.

## 4. Neden önceki “kalite” kontrolleri yeşil kalabiliyor?

Kaynak incelemesi ile doğrulanan fakat burada bağımsız insan tercihi deneyi yapılmayan iki sorun:

- **Yapısal puanlar estetik tercihi ölçmüyor.** `core/src/score.rs` harf uzunluğu, sesli/sessiz geçişi, tekrar ve sözlük benzerliği hesaplıyor. `web/src/lib/score.ts` bunları %40 telaffuz, %30 hatırlanabilirlik, %30 yenilik olarak topluyor. Örneğin adayın sözlükte bulunmaması yüksek yenilik puanı getirebilir; iyi marka olduğunun kanıtı değildir.
- **Auto açıklama varlığını, ortak havuz ise aile sırasını kullanıyor.** `web/src/lib/shortlist.ts:22` bir `reasonChain` metninin bulunmasını ve `canon suffix` içerip içermemesini öncelik sınıfı yapıyor. Metnin asıl işleme bağlı olması şart değil. Ortak havuz bunu kaldırıyor ama yerine anlamsal uygunluk sıralaması getirmiyor. Bu iki seçicinin kusurları aynı değil.

Üç açık biçim bonusunu (`prefix_w`, `suffix_w`, `concept_suffix_w`) sıfırlamak da genel bir çözüm vermedi: ilk aday legacy ve intent kapsamlarında **14/18**, ilişki kapsamında **15/18** kez değişmedi. Diğer puanlar ve üretim malzemesi sabit kaldı. Bu, bütün estetik ağırlıkların etkisiz olduğu veya kalan sıralama bileşenlerinden birinin tek suçlu olduğu iddiası değildir.

Ek veri kusuru: mevcut anlamsal komşulukta `backup` spor yedeklerini (`receiver`, `defensive`, `starter`…), `replay` spor karşılaşmalarını (`match`, `game`, `referee`…) getiriyor. `core/data/semfield/neighbors.tsv:1342` ve `:13771`. Yazılım bağlamında anlam kaymasına elverişli; ancak bu iki sözcük altı teşhis brief'inde yok, dolayısıyla yukarıdaki sonuçları bunlarla açıklamıyorum.

## Sonraki mimari müdahalenin sırası

1. **Üretici sayısını artırmadan önce, yapılandırılmış anlam kanıtıyla ortak havuz sıralaması.** İşlem ve birleşik nesneyle uygunluk önce; aile çeşitliliği bundan sonra. Eksik kanıt görünür kalmalı ve dört ad doldurmak için anlamsal uygunluk varsayılmamalı.
2. **Rolleri üreticiye kadar koruma.** İşlem, nesne ve koşulları sonunda eşit anahtar sözcük kümesine çevirmemek; `memory usage` gibi birleşik nesneleri bölmeden temsil etmek. Doğrudan kök harflerini zorunlu tutmak metaforları kaybettirdiği için önceki iki-kök filtresini daha da sıkılaştırmamak.
3. **Telaffuz filtresini kaynaklı telaffuzla düzeltme.** Bilinen bileşenlerde mevcut sözlüğü kullanmak; bilinmeyen coinage için tahminin belirsizliğini korumak. Sınırı tamamen kaldırmamak.
4. **Estetik tercihi ayrı değerlendirme.** Yapısal puanları teşhis olarak tutmak. Sonraki aday seçicisini bu altı örneğe özel isim kurallarıyla ayarlamadan ayrı veride ve özgün insan eşikleriyle karşılaştırmak.

Bu çalışma sorunun mekanizmalarını buldu; isim kalitesinin insan tarafından doğrulanmış biçimde düzeldiğini göstermedi. Yeni varsayılan, yeni eğitim, sözlük genişletme veya eşik değişikliği yapılmadı.

## Tekrarlanabilir kanıt

`artifacts/analysis.json`: bütün karşı müdahaleler, aday kaynakları ve sıraları, 256 seçim sırası, telaffuz karşılaştırmaları. `interventions-v2.json`: 162 Brandable müdahalesi + 72 Reason kontrolü. Aynı 234 koşul ikinci çalıştırmada bayt düzeyinde tekrarlandı. Önceki 162 koşul da yeni kontrol kodu eklendiğinde aynen kaldı.

`artifacts/verification.json`: tekrar kontrolleri ve SHA-256 kimlikleri. `identity.json` → `analysis-identity.json` arasında yalnızca araştırma Rust örneği değişti; çalışma zamanı kodu/veri/WASM sabit. Önceki tam ürün testleri `../operation-object/REPORT.md` içinde; bu rapor onları yeni çalıştırılmış gibi sunmaz. Yeniden çalıştırma komutları [README.md](README.md) içinde.
