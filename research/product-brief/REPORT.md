# Anlamı üreticiye kadar koruma — son sonuç

**Teslim:** mevcut Lab içinde çalışan işlem eşdeğerleri, ürün–özellik ilişkileri, ayrı destek sözcükleri ve üreticiye kadar korunan anlam malzemesi. Yeni model eğitilmedi; üretim varsayılanı ve estetik ağırlıklar değiştirilmedi.

[Tüm eski/yeni örnekler ve asistanın tercihleri](artifacts-v3/examples.html) · [Uygulama ve tekrar çalıştırma yönergesi](README.md).

## Doğrulanan değişiklikler

- Sekiz eşdeğer ifade çifti, iki tohumla denendi: **16/16 aynı malzeme, 16/16 aynı finalist listesi**. Örneğin `measures query latency` ile `measuring latency of queries`; `restores configuration sections` ile `recovering configuration sections`.
- Eski 12 briefte boş olmayan listeler **11’den 12’ye** çıktı. Bu, kullanılabilir isim sayısı veya kalite galibiyeti değildir.
- Birleşim üreticisinin mevcut uygunluk ve anlam filtrelerini geçen adayları, aynı 12 örnekte ilk kayıtta **19/288**, son kayıtta **91/193** oldu. Paydalar üreticinin ortak havuza döndürdüğü aday sayısıdır; tüm deneme sayısı değildir. Bu mekanik anlam uygunluğudur, insan beğenisi değildir.
- Üretici içindeki genel komşu kelime eklemesi kapatıldığında ara kayıtta sayı **104/218** idi. Son adımda destek sözcüklerinin köklerden ayrılmasıyla 91/193 oldu. Aday sayısını artırmak amacıyla bu son ayrım geri alınmadı.

## Gerçek eski/yeni örnekler

| Brief | Önceki Lab | Son Lab | Asistan tercihi |
| --- | --- | --- | --- |
| Sorgu gecikmesini ölçme | Anemometer, Seismograph | QueryGauge, Anemometer, Seismograph, Latenlance | QueryGauge |
| Hasarlı arşiv kayıtlarını kurtarma | Aday yok | Reprise, MendEntry, Entryprise, Arstore | Entryprise; daha sade alternatif Reprise |
| Editör oturumlarını geri getirme | Reprise, SessionMend, Restoresave | Reprise, SessionMend, Sereprise, Ediprise | Reprise |
| Tekrarlanan uyarıları filtreleme | AlertMesh, Valka, SieveAlert, Refilter | AlertMesh, Valka, Primessage, SieveAlert | Primessage; daha açıklayıcı alternatif AlertMesh |
| Açığa çıkan erişim tokenlarını bulma | Seismograph, Sarraf | Seismograph, Triptoken, Sarraf, Lantoken | Lantoken, yalnızca denenmeye değer bir taslak |

Tercihler kaynakları görerek asistan tarafından yapıldı. Eğitim verisi, insan değerlendirmesi veya marka müsaitliği onayı değildir. `Entryprise` entry + reprise bağlantısını taşır fakat enterprise çağrışımı da vardır. `Primessage` prism + message birleşimidir; prime message olarak da okunabilir. Bu alternatif okumalar otomatik bir kalite puanıyla çözülmüş değildir.

## Kapatılan hata

Seamblend, açıkça verilmiş kök gruplarını yetersiz bulduğunda `augment_thin_groups` ile genel kelime komşuları ekliyordu. Hash doğrulama havuzundaki `Proofrent` ve bağımlılık haritasındaki `Paychart` ortak havuzda nesne kanıtı olmadığı için eleniyordu. Buna rağmen üreticinin en fazla 24 isimlik çıkışında yer kaplıyorlardı.

Son sürüm, fayda planının kök bütçesini koruyor. Aynı malzemeyi guided-pair üreticisi de kullanıyor. Genel genişletme davranışı eski akışlarda aynen duruyor; yeni akışın malzemesini değiştiremiyor. Mevcut kavram paletleri tamamen değiştirilmedi ve yeni öğrenilmiş ağırlık eklenmedi.

Ürün ilişkisi bulunduğunda `damaged`, `saved`, `repeated`, `exposed` gibi ek sözcükler silinmeden destek bilgisi olarak saklanıyor. Örneğin kurtarma briefinin üretim kökleri `restore, archive, entry`; `damaged, replicas` özgün kaynak aralıklarıyla ayrıca görünür. Böylece hasar durumu isim üretim kökü haline gelmiyor.

## Sınırlar

- Desteklenen ilişkiler 21 açık editoryal eşleşmeyle sınırlı. Bu, genel amaçlı dil anlama değildir; desteklenmeyen anlamlarda temkinli davranır.
- `Mendtion`, `Latenlance`, `Sereprise` gibi açıklanabilir fakat estetik olarak tartışmalı birleşimler hâlâ çıkabiliyor. Malzemenin anlamlı olması, ismin bütün olarak iyi olduğuna yetmiyor.
- Bazı isimler doğrudan ürün açıklaması gibi kalıyor. Bazı güçlü eski adaylar aynen korunuyor; bunlar yeni kazanım diye sayılmadı.
- Sözlükte bulunmayan adların ekrandaki hece sayısı yazım tahminidir. Ailelerin fonem tabanlı filtresiyle farklı çıkabilir; bu tahminler insan değerlendirmesi veya kesin telaffuz değildir.
- Önceki 12 brief ve ara sonuçlar geliştirmede görüldü. Son karşılaştırma bir regresyon kaydıdır; dokunulmamış bir kalite testi değildir.

## Doğrulama ve kayıtlar

- **225 Rust testi** geçti. WASM yeniden üretildi; TypeScript ve üretim build geçti. Mevcut paket boyutu uyarıları sürüyor.
- **44 koşul**, 44 birebir tekrar, 44 dışlama içeren devam sayfası, yedi olumsuz/sınır kontrolü geçti.
- **48 Auto**, 48 shared-pool, 33 brief-intent, 30 operation-object, 54 meaning-first ve 30 önceki product-frame kaydı yeniden üretildi. Süre alanları dışında havuz, kanıt, izler ve finalistler eşleşti.
- Mevcut altı Auto, held-out, cold, taste, mode-taste ve shortlist kontrolü son motorla aynı eşiklerle geçti.
- Tarayıcıda seçenek, açıklamalar, devam isteğinin korunması, dışa aktarım, boş sonuçlar, mobil görünüm, kaydedilmiş tercihlere dokunulmaması ve `recover` briefinin ürün/destek ayrımı doğrulandı. Sonuç ekranları görsel olarak incelendi.
- `artifacts/`, `artifacts-v2/`, `artifacts-v3/` ayrı tutuldu. İlk iki kayıt sonuca göre üzerine yazılmadı. Son motor kaydından sonra yalnızca Lab açıklamasında anlam bağlantısı ile gerçek birleşim ifadesini ayıran bir metin düzeltmesi yapıldı; TypeScript/build ve UI yeniden kontrol edildi.

Özgün insan başarı kapısı değiştirilmedi: 8/12 galibiyet, en az altı kullanılabilir brief ve Auto’ya göre en az üç brief artış, 3/4 tekrar tutarlılığı. Bu revizyon için insan yanıtı toplanmadı; kalite artışı ilan edilmedi. Önceden hazırlanmış kör form önceki adayları ölçer, bu revizyonun değerlendirmesi sayılmaz.

Son kaynak/veri/WASM hashleri ve doğrulama özeti [delivery.json](artifacts-v3/delivery.json) içinde; sayısal karşılaştırma [analysis.json](artifacts-v3/analysis.json) içinde bulunur. Kullanıcının önceden değiştirdiği `concept_bridges.tsv` ve `story_kb.tsv` korunmuştur.
