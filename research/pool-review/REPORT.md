# Bütün havuzun editoryal incelemesi

**Sonuç:** Seçimde kayıp var, fakat mevcut havuzda büyük bir gizli kalite sıçraması bulamadım. 12 briefteki 170 uygun adayın tamamından seçtiğim 21 ismin 17'si zaten finalistlerde. Dört briefte birer alternatif aşağıda kalıyor. Bunlar asistan tercihleri; insan beğenisi, 11 başarılı ürün adı veya kalite kazanımı değildir.

[İnteraktif inceleme ve bütün adaylar](artifacts/index.html) · [Makinece okunur sonuç](artifacts/analysis.json).

## Nerede kayboluyorlar?

| Brief | Finalistlerden örnek | Havuzda tercih ettiğim alternatif | Kayıtlı neden |
| --- | --- | --- | --- |
| Manifest hash doğrulama | Macheck | Maniseal | Seamblend sıra 4; dört finalist sınırı |
| Sorgu gecikmesini ölçme | Anemometer, Seismograph | Mizan | Reason sıra 3; aileden iki finalist sınırı |
| İşlem faaliyetini kaydetme | Seismograph, Ostraka | Skald | Reason sıra 3; aileden iki finalist sınırı |
| Test hatalarını gruplama | ShelfTest, ThreadTest | Failthread | Seamblend sıra 6; dört finalist sınırı |

Diğer brieflerin kısa listesi sayfada. Editör oturumlarını geri getirmede yalnızca Reprise'ı seçtim. Token güvenliğinde hiçbirini seçmedim; önceki kaynak-görünür Lantoken önerimi geri çektim. Bu kararın eski öneriyle farkı açıklanmış durumda. Auto'da da bulunan Portolan yeni kazanım sayılmadı.

48 mevcut finalist yerinin 17'si benim bu incelemedeki kısa listeme giriyor. Kalan 31 yerin tümü objektif olarak kötü ilan edilmedi: açıklayıcı yedekler, zayıf metaforlar, belirsiz kırpmalar ve başka okumaya kayan adlar ayrı kategorilerde. Kullanılabilirliğin insan ölçümü yapılmadı. Ortak havuzda elenen kaynaklar ve üretici içinde dönmeyen isimlerin izleri ayrı alanlarda saklandı; bunlara editoryal etiket verilmedi. İnceleme kapsamı 170 uygun yazımdır.

## Somut mekanizma

`core/src/seamblend.rs::splice_fusions` fonetik hece sınırlarından kesiyor ve iki harflik öneklere izin veriyor. `semantic::record_construction` kabul edilen ismin tam kaynak kelimelerini saklıyor. `semantic::evidence` ise bunları anlam kanıtına alıyor; kaynak kelimenin ne kadarının son isimde kaldığı bu kanıttan anlaşılmıyor.

Örneğin Macheck için kaynak `manifest + check`; görünen olası kesim `ma + check`. Totinel için kaynak `token + sentinel`; `to + tinel`. Bu kayıtlar üretim soyunu kanıtlar. Kullanıcının manifest veya sentinel'i tanıyacağını kanıtlamaz. Ters yönde Acticord iki kırpılmış kelimeden oluşmasına rağmen benim kısa listemde: tek bir harf eşiği bu ayrımı çözmüyor.

Reason tarafında Mizan ve Skald, aile sırası 3 olduğu için daha önce gelen iki genel metaforun arkasında kalıyor. Bu nedenle yalnızca birleşim filtresi eklemek dört kaybın ikisine hiç dokunamaz.

## Denenen iki değişiklik

Önce `review.json` içindeki isim tercihleri ve `protocol.json` içindeki iki kural yazıldı. Sonra bu kurallar 44 eski sabit havuza uygulandı; üreticiler yeniden çalıştırılmadı, eşikler sonuçlara göre taranmadı. Sonraki düzenlemeler yalnızca raporlama ve doğrulama içindi. Mevcut TypeScript seçici kaynak kodu doğrudan kullanıldı ve 44 özgün finalist listesi birebir yeniden üretildi.

| Kural | Değişen 12 regresyon listesi | Saklı tercihlerden öne gelen | Kısa listeden havuz dışına çıkan | Karar |
| --- | --- | --- | --- | --- |
| İki kaynak parçadan en az üçer harf | 3 | 0 | 0 | Benimsenmedi |
| Buna ek en az bir kaynak kelime tam | 5 | 0 | Acticord | Benimsenmedi |

İlk kural Macheck yerine Manicheck getiriyor; Maniseal hâlâ aşağıda. İkinci kural Acticord yerine Beaconcess getiriyor. Birkaç zayıf adın kaldırılması genel bir kalite çözümü sayılmadı. Her iki kuralın eşdeğer brief tutarlılığı 16/16; bu mekanik tutarlılıktır. Önceki Metrack örneği de üç harf kuralının karşı örneği olarak kontrol edildi; bu örnek sonuçları iyileştirmek için istisnaya dönüştürülmedi.

Kesimler eski izlerde tam olarak tutulmadığından bu deney kaynak kelimelerden olası prefix+suffix yazımlarını yeniden kurar. Özgün fonetik kesimi ölçtüğü veya insan tanınabilirliğini tahmin ettiği iddia edilmez. Yeterli kaynak yoksa kural çekimser kalır. Bu sınır nedeniyle bir üretici uygulaması olarak değerlendirilmemelidir.

## Karar ve sonraki teknik yön

İki kural da önceden yazılan gerekli koruma kontrolünü geçmedi. Hiçbiri motora veya Lab'a alınmadı. İsim bazlı kara liste, el seçimi sıralama girdisi, ağırlık değişikliği veya başarı eşiği gevşetmesi yapılmadı. Mevcut 131 motor/veri/frontend dosyasının önceki teslimle hash eşitliği doğrulandı.

Bu incelemeye göre sıradaki yararlı mimari yatırım, anlamı tam kaynak kelimeden devralmak yerine **gerçek kesimi kaydetmek ve kullanılan parçayı kendi anlam kanıtıyla değerlendirmek**. Bu, her kısa parçayı yasaklamak demek değil: `acti`, `sig`, `ma` için aynı kanıt varsayılmamalı. Önce gerçek kesim/provenans kaydı ve mevcut fragment envanterinin kapsamı ölçülmeli; ancak destek varsa tanınabilir parça malzemesi genişletilmeli. Bu çalışma burada uygulanmış veya kaliteyi artırdığı kanıtlanmış sayılmaz. Kaynak kelimelerin anlamı yanında bütün adın beğenilmesi hâlâ ayrı ve insan yanıtı gerektiren soru.

Yeni bir uzun değerlendirme kampanyası başlatılmadı. Asistan etiketleri eğitim verisi yapılmadı. Mevcut 12 + dört tekrar insan kapısı değişmedi ve bu inceleme o kapıyı geçirmiş sayılmaz. Runtime değişmediği için Rust/WASM/build tekrarları bu rapor için gerekmedi; mevcut doğrulama önceki teslimde, bu çalışmanın kaynak ve artefakt doğrulaması kendi kayıtlarında tutulur.

## Tekrar çalıştırma

```powershell
node research/pool-review/analyze.mjs
node research/pool-review/render.mjs
node research/pool-review/check-ui.mjs
```

İlk komut eski trace hashlerini, 131 çalışma dosyasını, 170 isimlik editoryal kapsamı, 44 gerçek seçici tekrarını, iki kuralın deterministikliğini ve aile/başlangıç sınırlarını kontrol eder. Karşılaştırmanın tamamı `product-brief/artifacts-v3` üzerine kuruludur; geliştirmeden ayrı yeni bir kalite testi değildir.
