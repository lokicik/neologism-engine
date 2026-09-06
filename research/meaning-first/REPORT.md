# Anlam öncelikli isim seçimi — 2026-09-05

**İstenen mimari düzeltmeler uygulandı ve doğrulandı.** İsimler artık bu deneyde ürünün işlemine ve nesnesine ait yapılandırılmış kanıtla sıralanıyor; çeşitlilik sınırları sonra uygulanıyor. Bilinen sözcüklerde hece hesabı düzeltildi. Önceden havuzda kaybolan Metrack, Terazi ve Kiyas gibi adaylar görünür oldu.

**Kalite tamamen çözülmüş değil.** Benim 12 yeni brief'in ilk sabit tohumu üzerindeki editoryal karşılaştırmam: **5 yeni, 0 Auto, 3 eşit, 4 ikisi de değil**. Kaynakları gördüm; bu kör veya insan değerlendirmesi değil. İnsan geçiş eşiği olan 8/12 galibiyetin karşılandığı söylenemez. Varsayılan Auto değişmedi.

## Kullanım

**Create → Brief intent · Lab → Prioritize product meaning on next Generate → Generate.** Seçenek başlangıçta kapalı. Önceki katı işlem–nesne seçeneğiyle aynı anda açılmıyor. Kutuyu veya taslak brief'i değiştirmek mevcut sonuçların **Next finalists** davranışını değiştirmiyor; seçenek sonraki ana Generate isteğinde uygulanıyor.

Kartlarda nesnenin hangi terimlerinin desteklendiği, hangilerinin eksik olduğu ve hece bilgisinin kaynağı görünüyor. Metrack için gerçek üretim malzemesi `track + memory` gösteriliyor; yapısal önek yorumu anlam açıklaması yerine kullanılmıyor. Yapısal puanlar dışa aktarılan teşhiste korunuyor; bu seçenekte kartın başlığında kalite yıldızı gibi gösterilmiyor. Beğeniler yalnızca oturumda kalıyor.

## Uygulanan dört değişiklik

1. **Anlam uygunluğu, ardından çeşitlilik.** Adaylar işlem + bütün nesne terimleri, işlem + bazı nesne terimleri, doğrudan işlem metaforu sırasıyla değerlendirilir. Sonra mevcut aile sırası, tohumla belirlenen eşitlik sırası ve yazım kullanılır. Aynı aileden iki, aynı üç harfli başlangıçtan bir, toplamda en fazla dört isim sınırı korunur. Eksik kanıt veya zayıf adaylarla sayı tamamlanmaz. Açıklama metni ve yapısal puanlar sıralama girdisi değildir.
2. **Roller ve birleşik nesne korunur.** `memory usage`, `dependency licenses` gibi öbekler özgün metin aralıklarıyla bütündür. Reason içinde işlemden gelen aday, koşuldan/bağlamdan gelen adaydan önce sıralanır. Altı terimlik bütçe nesne öbeğine yetmezse sözcük sessizce düşürülmez; açıkça çözümlenemedi sonucu verilir. Üreticilere temel işlem/nesne terimleri gider; koşul ve bağlam ayrı kayıtta kalır.
3. **Kaynaklı telaffuz.** Mevcut sözlükte tam sözcük veya kayıtlı malzemenin tam birleşimi varsa hece sayısı bununla hesaplanır. CompareSize, CheckLicense, TrackUsage ve GroupMessage bileşen toplamıyla üç; VerifyFile dört hecedir. Üç hece sınırı kaldırılmadı. Bilinmeyen veya birden fazla yorumu olan coinage için harf tahmini ve belirsizlik korunur. Filtre, sonuç, açıklama ve hatırlanabilirlik teşhisi aynı kapsam içindeki sayıyı kullanır.
4. **Estetik iddiası ayrıldı.** Anlam kanıtının bulunması iyi marka garantisi sayılmaz. Doğrudan, coined olmayan Reason metaforları kabul edilebilir; palet veya anlamsal komşuluk tek başına eşdeğerlik kanıtı sayılmaz. Gerçek seam-blend kaynakları kaydedilir; harf parçaları sonradan anlamlıymış gibi yorumlanmaz. Özgün insan eşikleri ve ayrı kör değerlendirme korunur.

Üretim Config biçimi ve kayıtlı tercih verileri değişmedi. Yeni model, sözlük genişletme, estetik ağırlık ayarı veya ağdan üretim yok. Düzeltmeler Rust/WASM içinde, `semantic_pool` deneyine ait eşzamanlı kapsamda çalışır. Kapsam kapalıyken önceki akışlar aynıdır.

## Önce kaybolan adaylar

Geliştirme brief'leri, tohum **13**. “Önceki” sütunu Brief intent'in eski ortak havuz finalistleridir; Auto ile karıştırılmamalıdır.

| Brief | Önceki finalistler | Yeni finalistler |
|---|---|---|
| Dosya boyutlarını karşılaştırma | Creagen, Commitflow, Multain, PureSiz | CompareSize, Terazi, Kiyas |
| Checksum doğrulama | Verospec, Stacklink, Mihenk, NewByte | Verchecksum, Downver, Mihenk, Sarraf |
| Bağımlılık lisanslarını denetleme | Plasserv, Stacklink, Matbaa, TopSync | Decheck, CheckLicense, Licheck, Plumbline |
| Bellek kullanımını izleme | Codexport, Runsignal, Mihenk, BoldRun | TrackUsage, Metrack, Izci, Fylgja |
| Log mesajlarını gruplama | Vocalex, Scopelink, Halka, BoldBond | Logroup, Megroup, Halka |
| Yapılandırma dosyalarını doğrulama | Verospec, Shipsignal, Mihenk, PureEnv | Confiver, Verfile, Mihenk, Sarraf |

Bu sonuçlar açıklanan seçim kaybının düzeldiğini gösterir. Örneğin checksum için Downver'ın yalnızca `downloadable` tarafına bağlanması veya Decheck'in estetik olarak zayıf durması, kısmi nesne kanıtının hâlâ yetersiz olabileceğini gösterir. Kısmi bağlantı tam anlam başarısı olarak sunulmaz.

## Ayrı sabitlenen 12 brief

Altı bilinen geliştirme brief'ine ek olarak, uygulama çıktıları görülmeden önce 12 yeni developer brief'i ve 13/67/313 tohumları sabitlendi. Toplam **54 koşul**. Aşağıdaki örneklerin hepsi ilk tohum **13**; iyi görünen tohum seçilmedi. Tam İngilizce brief'ler ve bütün listeler `artifacts/comparison.json` içinde.

| Yeni brief | Auto | Anlam öncelikli |
|---|---|---|
| Commit patch'lerinde sızmış kimlik bilgilerini bulma | Termatlas, Detectterm, Leakedterm | DetectLeak, Seismograph, Sarraf |
| Veritabanı migration sürelerini kaydetme | Dataseed, Shiftia, Bridgerow | Seismograph, Ostraka |
| Container izinlerini karşılaştırma | Creatic, Dotnode, Paramia | Terazi, Kiyas |
| Çevrimdışı kurulum öncesi cache doğrulama | Sarraf, Locil, Verme | Artiver, Vercache, Vefacts, Mihenk |
| Socket bağlantılarını izleme | Izci, Termify, Shellio | TrackSocket, Socketrack, Sotrack, Izci |
| Derleyici uyarılarını gruplama | Insula, Moded, Warnad | GroupWarning, Halka |
| Servis bağımlılıklarını haritalama | Harita, Byteseed, Graphora | Portolan, Harita |
| Çeviri anahtarlarını kontrol etme | Aurver, Tagora, Pushify | CheckKey, Plumbline |
| Görüntü sıkıştırma kaybını ölçme | Mizan, Alignix, Ruleora | Measureloss, Seismograph, Mizan |
| Silinen yapılandırma bölümlerini geri getirme | Multain, Paramia, Byteseed | Destore, Constore |
| Yinelenen build teşhislerini filtreleme | Multain, Termora, Promptora | Filterbuild, Valka |
| Crash raporlarını sıralama | Ferman, Compamp, Sodio | SortReport |

Yeni değerlendirme koşullarının **34/36'sında** en az bir finalist var. Boş iki koşul, geri yükleme brief'inin 67 ve 313 tohumları. Bu sayı beğeni veya kullanılabilirlik değildir. Benim editoryal kullanılabilir aday değerlendirmem yeni akışta **8/12**, Auto'da **4/12** brief; gerçek kullanıcı sonucu değildir. Rasyoneller `artifacts/assistant-review.json` içinde, üretimden ayrı tutuluyor.

Süreler aynı tarayıcıdaki teşhisli çalışmalardır: 36 yeni değerlendirme koşulunda medyan yaklaşık **353 ms**, aralık **194–482 ms**; Auto medyanı yaklaşık **43 ms**. Yeni akış dokuz aileyi ve tam izlerini topladığı için daha pahalı. Bunlar tek makinede, veri yüklenmişken ölçülen üretim süreleri; ilk yükleme veya genel cihaz performansı garantisi değildir.

## Doğrulama

- **219 Rust testi geçti.** Beş yeni test nesne öbeği, kapsamın geri yüklenmesi, doğrudan metafor/üretim kanıtı, çakışan harf kanıtı, olumsuz/taşan brief ve telaffuz sınırını kapsıyor.
- WASM yeniden derlendi; TypeScript ve üretim web build'i geçti. WASM yaklaşık **1.13 MB**. Mevcut büyük paket uyarıları sürüyor.
- **48 Auto**, **48 ilk ortak havuz**, **33 önceki Brief intent** ve **30 katı işlem–nesne karşılaştırması** eski kayıtlardan birebir tekrarlandı. Süreler karşılaştırmadan çıkarıldı; aday/iz/finalist verileri çıkarılmadı.
- Yeni **54 koşul** tam havuz ve izleriyle tekrarlandı; 54 devam sayfasında önceki finalistler dışlandı. Nesne sözcükleri, özgün konumlar, kaynak uygunluğu, hece-açıklama tutarlılığı, aile sınırları ve boş sonuçlar kontrol edildi. Sekiz yeni seçici sözleşmesi geçti.
- Altı mevcut **Auto, held-out cold, cold, taste, mode-taste ve shortlist** denetimi geçti. Eşik değişikliği yapılmadı.
- Gerçek tarayıcıda seçeneklerin birbirini kapatması, yalnızca sonraki isteği değiştirmesi, devamın özgün brief'i koruması, oturum içi Keep, JSON dışa aktarımı, havuz incelemesi, çözümlenemeyen brief, mobil taşma ve Auto'ya dönüş doğrulandı. Son masaüstü/mobil ekran görüntüleri incelendi.
- Kör formun 16 sayfası, “ikisi de değil”, hiçbir seçim yapılmadan ilerlemenin engellenmesi, dışa aktarım, kısmi devam, mobil düzen ve ağ isteği üretmemesi sentetik kontrollerle geçti. Sentetik cevaplar insan yanıtı olarak kaydedilmedi.

## İnsan değerlendirmesi ve kalan sınır

[Kör değerlendirme formu](artifacts/blind-evaluation.html) **12 finalist çifti + dört ters çevrilmiş tekrar** içerir. Formda kaynak etiketleri ve yapısal puanlar yoktur. Özgün eşikler: en az 8/12 galibiyet, altı kullanılabilir brief, Auto'ya karşı en az üç kullanılabilir brief artışı ve 3/4 tekrar tutarlılığı. Bunların insan tarafından karşılanması henüz ölçülmedi. Asistan incelemesi farklıdır: tüm ilk tohum örneklerini kaynaklarıyla gördüm; kör formun tohum sırası önceden belirlenen dönüşümlü düzendir.

Kalan sorun somut: **yapılandırılmış köken kanıtı hâlâ bir ismin bıraktığı bütünsel çağrışımı ölçemiyor.** Destore kaynak olarak restore'a bağlı olsa da yıkımı çağrıştırabilir; SortReport ve CheckKey doğru işlevi söyleyip zayıf marka kalabilir. Üretici/filtre/seçim kusurları düzeltildi diye bu sınır kaybolmadı. Bu çalışmanın sonuçlarından özel isim kuralları veya yeni eşikler türetilmedi.

Kaynak/veri/WASM kimlikleri, 54 sıkıştırılmış tam iz, test logları ve karşılaştırmalar `artifacts/` altında. Yeniden çalıştırma yönergesi [README.md](README.md). Mevcut varsayılanı değiştirmeden, önerilen mimari müdahalelerin çalışan ve incelenebilir uygulaması teslim edildi.
