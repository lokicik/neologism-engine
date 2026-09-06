# Product names · Lab — teslim raporu

Yeni motor uygulamaya ayrı **Product names · Lab** seçeneği olarak eklendi. Rust/WASM üzerinde çevrimdışı çalışıyor. Auto varsayılanı, eski üreticiler ve kayıtlı beğeniler korunuyor. İnsan değerlendirmesi henüz yapılmadı; aşağıdaki sonuçlar mekanik doğrulama ve aday örnekleridir.

## Değişen davranış

Doğal ürün ad öbekleri ve fiilli açıklamalar sekiz ürün işi üzerinden dört alana bağlanıyor: veri geçişi/geri alma, arka plan işleri, gözlemlenebilirlik ve doğrulama. Belirsiz, olumsuz veya kapsam dışı açıklamalardan sessizce genel isim üretilmiyor. Kullanıcı ürün yorumunu açıkça düzeltebiliyor.

48 editoryal anlam kaydı, 50 izinli tam biçim içeriyor. İsimler karakter üreticisine geri beslenmiyor. Telaffuz kanıtı ve marka/crate üyeliği ayrı kaydediliyor. Beş biçim bilinen marka kaydı nedeniyle, bir biçim (`Metronome`) telaffuz kanıtı bulunmadığı için eleniyor. Aynı yazımın kaynakları birleştiriliyor. Hiçbir kayıt insan beğenisi etiketi sayılmıyor.

Yeni seçici fayda yönleri arasında dolaşıyor; en fazla dört finalist sunuyor. Kullanıcı bir yöne odaklanabiliyor. Devam sayfaları aynı brief, tohum, katalog ve kısıtları koruyor; görülen isimler tekrarlanmıyor. Havuz bitince sayı tamamlanmıyor. Keep/Pass yalnızca oturumda kalıyor ve dışa aktarılabiliyor.

## Doğrulananlar

- 232 Rust testi, yeniden üretilmiş WASM ve TypeScript/üretim derlemesi geçti.
- Mevcut altı Auto, held-out, cold, taste, mode-taste ve shortlist kontrolü eski eşikleriyle geçti.
- 48 başlangıç Auto sayfası ve yedi eski Lab deneyinin 283 kaydı, yeni motor çalıştırıldıktan sonra aday/kanıt/iz düzeyinde tekrarlandı; süreler dışında aynı kaldı.
- Yeni motorun 24 brief/tohum koşulu tekrarlandı; 78 devam sayfası kontrol edildi. Kısıtlar, aynı kavram/üç harfli başlangıç sınırı, boş havuz ve katalog sürüm kilidi doğrulandı.
- Masaüstü ve mobilde gerçek tıklamalar, finalist açıklamaları, yorum düzeltme, yön seçimi, devam, dışa aktarma, kayıtlı verilerin korunması ve Auto’ya dönüş incelendi.
- Üretim paketinin ilk yüklemesi ve yükleme sonrasında ağ kapalıyken yeni brief’ten üretim doğrulandı. Bu akışta dış servislere istek görülmedi; paket içindeki WASM, dondurulmuş sürümle eşleşti.
- Katalog ve kurallar yeni değerlendirme brief’lerinden önce 139 kaynak kimliğiyle donduruldu. Yeni 12 brief iki çalıştırmada aynı sonuçları verdi.

## Sonuçların sınırı

Mevcut 35 kanonik brief’in yalnızca beşi bu sınırlı ürün kapsamına bağlanıp finalist üretiyor; 14 developer brief’inin dördü destekleniyor. Önceki deneysel `brief_pool` aynı developer alt kümesinde sıfır finalistli brief vermişti. Bu kapsam karşılaştırması Auto regresyonu veya genel isim kalitesi kazanımı değildir.

Sonradan açılan, alan başına üç olmak üzere 12 yeni brief’in tamamı yorumlandı. Bu, **12 kullanılabilir isim bulunduğu anlamına gelmez**.

| Yeni karşılaştırma | Mevcut Auto | Product names |
| --- | ---: | ---: |
| Brief | 12 | 12 |
| Gösterilen finalist kartı | 36 | 48 |
| Farklı finalist ismi | 36 | 23 |
| İnsan tarafından kullanılabilir bulunan brief | Henüz ölçülmedi | Henüz ölçülmedi |

Auto mevcut üç finalist davranışını koruyor; yeni akış dört sunuyor. Karşılaştırma gerçek iki ürün akışını değerlendiriyor, eşit kart sayısıyla yapılmış izole bir estetik testi değil. Yeni katalog aynı ürüne ait farklı açıklamalarda aynı isimleri öneriyor. Bu tekrar ve sınırlı konu kapsamı teslimin önemli kısıtlarıdır; değerlendirme çıktılarına bakarak katalog genişletilmedi veya sıralama değiştirilmedi.

Yapısal puanlar, havuz sayıları, çeşitlilik ve sıcak WASM üretim süreleri [sayısal özette](artifacts/summary.json) yalnızca teşhis olarak tutuluyor. Crate kaydı bir ürün adı için global veto değil; kayıt bulunmaması da güncel müsaitlik değil. Bilinen marka korpusu kapsamlı bir güncel rakip taraması sağlamaz.

## Somut eski/yeni örnekler

| Brief | Auto | Product names |
| --- | --- | --- |
| Database upgrade rehearsal | Ayna, Copyrow, Datalab | Foothold, Waymark, Lifeline, Causeway |
| Worker pool for scheduled tasks | Takvim, Plannova, Tuneflow | Baton, Downbeat, Turnstile, Roundabout |
| Trace viewer grouping exceptions | Falconer, Termia, Toollink | Logbook, Sightline, Daybook, Lookout |
| Signed release manifest checks | Tagora, Pushify, Commitia | Signet, Touchstone, Watermark, Assay |

Bu isimler çıktı örnekleridir; seçilmiş, müsaitliği doğrulanmış veya kullanıcı tarafından onaylanmış öneriler değildir. [On iki eski/yeni çiftin tamamı](artifacts/examples.html) incelenebilir.

## İnsan değerlendirmesi

[Kör karşılaştırma](artifacts/blind-evaluation.html) 12 ana sayfa ve tarafları ters çevrilmiş dört tekrar içeriyor. A/B etiketleri yöntem adlarını saklıyor. Önce isimler, isteğe bağlı olarak açıklama ve aynı biçimde sunulan snapshot kanıtları görülüyor. “İkisi de değil” ve her taraf için gerçekten kullanılabilirlik ayrı kaydediliyor. Tarayıcıda ilerleme saklanıyor; hiçbir yanıt dışarı gönderilmiyor.

Başarı koşulları değişmedi: en az **8/12 kazanım, altı kullanılabilir brief, Auto’ya karşı üç kullanılabilir brief artışı ve 3/4 tekrar uyumu**. Tekrar tercihi taraflara göre normalize ediliyor; kullanılabilirlik tekrar uyumu ayrıca raporlanıyor. Tüm koşullar birlikte gerekiyor. Test yanıtları `synthetic` olarak işaretli; sonuçları insan kanıtı sayılamıyor.

İnsan yanıtı sayısı şu anda **sıfır**. Uygulama hazır; kalite üstünlüğü ve üretime adaylık beklemede.

## Kayıtlar

- [Başlangıç çalışma ağacı ve veri kimlikleri](baseline.json)
- [Dondurulmuş sürüm](artifacts/frozen.json) ve [yeni brief protokolü](protocol.json)
- [Tam karşılaştırma verisi](artifacts/comparison.json)
- [Teslim doğrulaması](artifacts/delivery.json)
- [Tekrar çalıştırma komutları](README.md)
