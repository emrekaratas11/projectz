# Ekranlar, User Story / Use-Case Katalogu ve UI/UX Önceliklendirme Planı (`screens.md`)

Bu doküman, **FotoYönetim** uygulamasındaki her bir ekranı, o ekranda gerçekleşen **User Story ve Use-Case'leri (`UC-1` – `UC-43`)** ve her bir işlevin **Öncelik Numarasını (`P0` – `P3`)** tanımlar.

Bir özelliğin ekrandaki **büyüklüğü, konumu ve ulaşım kolaylığı (kaç tıklama uzağa konacağı)** keyfi olarak değil, doğrudan yanındaki **Öncelik Numarası (`P0` – `P3`)** ile belirlenir.

---

## 0. UI/UX Önceliklendirme Kuralları (Boyut ve Ulaşım Kolaylığı Ölçeği)

| Öncelik | Tanım ve Kullanım Sıklığı | Ekrandaki Büyüklüğü ve Konumu | Ulaşım Kolaylığı |
| :--- | :--- | :--- | :--- |
| **`P0` (Kritik / Merkez)** | Kullanıcının o ekrana girme sebebi. Düğün boyunca yüzlerce kez kullanılır. | **En Büyük & Tam Merkezde:** Ekranın %70'ini kaplar, birincil kontrast buton (`btn-primary`) veya ana ızgaradır. | **0 Tık (Doğrudan Açık):** Ekran açıldığı anda gözün ilk gördüğü ve başparmağın en rahat ulaştığı yerdedir. |
| **`P1` (Birincil / Sık)** | Ana akışı doğrudan tamamlayan sık eylemler (filtreleme, seçim, arama, paylaşım). | **Orta Boyut & Üst/Alt Bar:** İnce sekme (`tab`), arama çubuğu veya seçim yapıldığında alttan çıkan yüzer çubuk (`selection-bar`). | **1 Tık:** Ana ekranı kalabalıklaştırmaz ama tek dokunuşla tetiklenir. |
| **`P2` (İkincil / Ayarlar)** | Düğün boyunca sadece 1 veya 2 kez kullanılan yönetim ve yapılandırma araçları. | **Küçük / Ana Ekranda Görünmez:** Sağ üstteki **`ayarlar`** veya **`detay`** butonu içindeki çekmecede (`Bottom Sheet` / `Modal`) yaşar. | **2 Tık (`Ayarlar → İşlem`):** Ana ekranda **asla** yer kaplamaz. |
| **`P3` (Arka Plan / Otomatik)** | Kullanıcının görmesine gerek olmayan veya sadece istendiğinde (`ⓘ`) açılan sistem/analitik işlevleri. | **Sıfır Piksel veya Mikro İkon (`ⓘ`):** Arka planda sessizce çalışır veya küçücük bir bilgi ikonu altındadır. | **Otomatik veya 2+ Tık:** Kullanıcıyı asla yormaz. |

---

## EKRAN 1: `ROLE_SELECT` — Karşılama ve Giriş Ekranı (`LandingView.js`)

**Ekranın Amacı:** Gelen kişinin kim olduğunu (Davetli mi, Gelin/Damat/Sağdıç mı, Fotoğrafçı mı) ve hangi bağlantı ile geldiğini anlayıp **en az girdiyle** doğru panele sokmak.

### A. Davetli Giriş Senaryoları (Use-Case & Story Listesi)

- **`[P0]` [UC-38 / UC-39 / UC-11] Özel Link veya Masa QR ile Gelen Davetli Girişi**
  - **Story:** *"Davetli olarak, WhatsApp'tan gelen gelin/damat linkine tıkladığımda veya masadaki QR kodu okuttuğumda düğün kodunu tekrar yazmak istemiyorum; sadece adımı ve düğün şifresini girip tek tıkla fotoğraf yüklemeye başlamak istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Düğün adı (`Ayşe & Mehmet`) ve referans bilgisi (`gelin davetiyesi`) üstte zarif bir bant olarak hazır gelir.
    - **"Düğün Kodu" inputu tamamen gizlenir** (çünkü linkten zaten okundu).
    - Ekranda sadece büyük **Ad Soyad** alanı, **Düğün Şifresi** ve tam genişlikte siyah **`Düğüne Katıl ve Fotoğraf Yükle`** butonu (`P0`) yer alır.

- **`[P0]` [UC-11] Kayıtlı Oturumu Olan Kullanıcının Tek Tıkla Devam Etmesi (Google Account Deneyimi)**
  - **Story:** *"Davetli veya Yönetici olarak, sayfayı yenilediğimde ya da ertesi gün tekrar girdiğimde tekrar isim ve şifre yazmak istemiyorum; sistem beni çerezden tanısın ve tek tıkla içeri alsın."*
  - **Büyüklük & Ulaşım:**
    - Eğer çerezde aktif oturum varsa formun en üstünde belirgin bir **`"@ahmet_yilmaz olarak Ayşe & Mehmet düğününe devam et →"`** kartı (`P0`) çıkar; tek dokunuşla içeridedir.

- **`[P1]` [UC-38 Alternatif] Manuel Düğün Kodu ile Giriş & Yanlış Bağlantıyı İptal Etme**
  - **Story:** *"Davetli olarak, link olmadan doğrudan siteye geldiysem düğün kodunu/adını kendim yazabilmeliyim; eğer yanlış bir davet bağlantısına tıkladıysam bağlantıyı iptal edip doğru kodu girebilmeliyim."*
  - **Büyüklük & Ulaşım:**
    - Link yoksa **Düğün Kodu veya Çift Adı** inputu (`P1`) görünür.
    - Link varsa, düğün bandının sağında küçük altı çizili **`bağlantıyı iptal et`** (`P1` — 1 tık) butonu yer alır; basıldığında URL temizlenir ve manuel kod alanı açılır.

- **`[P2]` [UC-19] Telefon Numarası Bırakma (İsteğe Bağlı)**
  - **Story:** *"Davetli olarak, içinde bulunduğum fotoğraflar hazır olduğunda bana SMS gelmesini istiyorsam telefon numaramı bırakabilmeliyim ama zorunlu olmamalı."*
  - **Büyüklük & Ulaşım:**
    - Giriş ekranını uzatmamak için küçük/opsiyonel tutulur veya davetli içeride fotoğraf yükledikten sonra (`INVITEE_PANEL` içinde) sorulur.

- **`[P2]` [E13 / KVKK & 5651] Hukuki Onay ve Sorumluluk Beyanı**
  - **Story:** *"Sistem sahibi olarak, yüklenen fotoğrafların telif ve KVKK sorumluluğunun yükleyen kişiye ait olduğunu onaylatmak istiyorum ama bu metinler ekranı boğmamalı."*
  - **Büyüklük & Ulaşım:**
    - Butonun hemen üstünde kompakt onay kutusu; metinlerin tamamı tıklanınca açılan `LegalModal` (`P2` — 2 tık) içindedir.

### B. Yönetici & Fotoğrafçı Giriş / Kurulum Senaryoları

- **`[P1]` [UC-17] Mevcut Düğüne Yönetici (Gelin / Damat / Sağdıç / Fotoğrafçı) Girişi**
  - **Story:** *"Düğün sahibi veya sağdıç olarak, düğün kodumu ve yönetici şifremi girerek yönetim paneline ulaşmak istiyorum. Kayıtlı yönetici ismim varsa tekrar isim yazmak zorunda kalmayayım."*
  - **Büyüklük & Ulaşım:**
    - `Yönetim` sekmesi (`P1` — 1 tık) altında yer alır. Sadece **Düğün Kodu/Adı** ve **Yönetici Şifresi** zorunludur; yönetici adı veritabanından otomatik çekilir.

- **`[P1]` [UC-14 / UC-15] Sıfırdan Yönetici Kaydı ve Yeni Düğün Kurulumu ("Kayıt Ol · Düğün Kur")**
  - **Story:** *"Uygulamayı ilk kez açan düğün sahibi veya fotoğrafçı olarak, kendi adımı, rolümü, çiftin adını ve şifreleri belirleyerek sıfırdan kayıt olup düğünü başlatmak istiyorum."*
  - **Büyüklük & Ulaşım:**
    - `Yönetim` sekmesi altındaki **`Kayıt Ol · Düğün Kur`** (`P1`) geçişindedir. Kayıt tamamlandığında oturum otomatik açılır ve doğrudan `OWNER_PANEL`'e geçilir.

---

## EKRAN 2: `INVITEE_PANEL` — Davetli Fotoğraf Yükleme ve Galeri Ekranı (`InviteeView.js`)

**Ekranın Amacı:** Davetlinin çektiği fotoğrafları **hata yapmadan (ekle/çıkar önizlemeli)** yüklemesi ve düğün galerisinde hem tüm fotoğrafları hem de kendi fotoğraflarını keyifle incelemesi.

### Use-Case & Story Öncelik Listesi

- **`[P0]` [UC-23 / UC-28] Doğrudan Fotoğraf Ekleme (Tekli veya Toplu Kabul Eder) & 2. Aşama Önerisi**
  - **Story:** *"Davetli veya yönetici olarak, fotoğraf seçtiğimde (ister tek fotoğraf, ister 50 adede kadar toplu fotoğraf) araya önizleme engeli girmeden doğrudan galeriye yüklenmesini; yüklendikten sonra 2. aşamada bana `+ toplu foto ekle` veya `fotoğrafı aç & içine yaz` seçeneğinin sunulmasını istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ekranın en üstünde doğrudan açık yükleme alanı (`P0` — 0 tık). Yükleme bittiğinde altında zarif bir 2. aşama barı belirir: kullanıcı isterse toplu fotoğraf eklemeye devam eder, isterse yüklediği fotoğrafı açıp içine anı yazısı / yorum / etiket yazar.

- **`[P0]` [UC-33 / UC-42] Canlı Düğün Galerisi ve "Benim Yüklediklerim" Ayrımı**
  - **Story:** *"Davetli olarak, hem düğünde çekilen tüm fotoğrafları (`Tüm Galeri`) hem de sadece benim yüklediğim fotoğrafları (`Benim Yüklediklerim`) tek tıkla filtreleyerek görmek istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ekranın ana gövdesi 3 sütunlu fotoğraf ızgarasıdır (`P0`).
    - Hemen üstünde 1 tıklık iki filtre hapı (`P1`) bulunur: **`Tüm Galeri (X)`** | **`Benim Yüklediklerim (Y)`**.

- **`[P1]` [UC-8 / UC-9 / UC-10 / UC-21] Fotoğrafı İzleme (Lightbox), İçine Anı Notu / Yorum Yazma ve Arama**
  - **Story:** *"Davetli veya yönetici olarak, galerideki bir fotoğrafa tıkladığımda onu büyük ekranda izlemek, fotoğrafın altına/içine el yazısı anı başlığı veya yorum yazmak, `#etiket` / kişi eşleştirmek, önceki-sonraki fotoğraflar arasında gezinmek ve indirmek/yazdırmak istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Herhangi bir fotoğrafa 1 tık → **`PhotoLightboxModal` (`P1`)** açılır. İçinde fotoğraf izleme, anı yazısı (`caption`), yorumlar (`comments`), `#etiket` ve kişi eşleştirme yer alır.
    - Galeri başlığının yanında sade bir arama kutusu (`P1`) yer alır.

- **`[P2]` [UC-6 / UC-11.1 / UC-19 / UC-43] "Benim Olduğum Fotoğrafları Bana Gönder" (Bildirim & Yüz Eşleştirme)**
  - **Story:** *"Davetli olarak, başkalarının kamerasında benim de çıktığım fotoğraflar olduğunda haberdar olmak için telefon numaramı bırakıp bildirim/eşleştirme talep etmek istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ana ekranı kalabalıklaştırmaz; üst barda veya filtre satırında **`beni bul / bildirim al`** (`P2` — 1 tıkla açılan küçük çekmece) olarak yer alır.

---

## EKRAN 3: `OWNER_PANEL` — Düğün Sahibi, Sağdıç ve Fotoğrafçı Yönetim Ekranı (`OwnerView.js`)

**Ekranın Amacı:** Düğün sahibinin (Gelin/Damat), Sağdıcın veya Fotoğrafçının **fotoğrafları yönetmesi (ekle, seç, indir, yazdır, gizle, etiketle)** ve **davetli katılımını görmesi**. Şifre değiştirme ve arşiv gibi ayarlar ana ekranı **işgal etmemelidir**.

### A. Ana Ekranda Olması Gerekenler (`P0` ve `P1`)

- **`[P0]` [UC-33 / UC-28..32] Ana Fotoğraf Galerisi & Önizlemeli Fotoğraf Ekleme**
  - **Story:** *"Düğün sahibi veya fotoğrafçı olarak, yönetim panelini açtığımda ekranın merkezinde doğrudan fotoğrafları görmek ve `+ Foto Ekle` dediğimde seçtiğim fotoğrafları önizleyip (yanlışları çıkararak — `UC-29..32`) galeriye eklemek istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ekran açılır açılmaz zarif `manager-line` imzasının hemen altında doğrudan **Fotoğraf Izgarası (`P0`)** başlar. Aradaki şifre kartları ve açıklama kutuları kaldırılmıştır.

- **`[P1]` [UC-8 / UC-10] İsim, Rumuz ve Etiket (`#dans`, `#aile`) Arama Çubuğu**
  - **Story:** *"Düğün sahibi veya fotoğrafçı olarak, yüzlerce fotoğraf arasından `Ahmet` yazarak Ahmet'in çektiklerini veya `#aile`, `#pasta`, `#çocuklar` etiketine tıklayarak o kategorideki fotoğrafları anında bulmak istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Galeri ızgarasının hemen üstünde tek satırlık zarif bir **Arama & Hızlı Etiket Çubuğu (`P1`)** bulunur.

- **`[P1]` [UC-12 / UC-13 / UC-34 / UC-35 / UC-36 / UC-37] Çoklu Seçim Çubuğu: İndir, Yazdır (Baskı), Etiketle ve Gizle**
  - **Story:**
    - `UC-34..36`: *"Seçtiğim fotoğrafları veya `Tümünü Seç` diyerek bütün albümü indirmek istiyorum."*
    - `UC-13`: *"Fotoğrafçı olarak seçtiğim fotoğrafın veya fotoğrafların yüksek çözünürlüklü çıktısını almak (`Yazdır`) istiyorum."*
    - `UC-12 / UC-37`: *"Düğün sahibi olarak istemediğim fotoğrafları seçip genel galeriden kaldırmak (`Gizle` — soft delete) istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Normalde gizlidir (0 piksel yer kaplar). Kullanıcı `seç` modunu açıp 1 veya daha fazla fotoğrafa dokunduğunda ekranın altından yüzer **`selection-bar` (`P1`)** çıkar:
      **`[İndir]`** · **`[Yazdır]`** · **`[Etiketle]`** · **`[Gizle]`**

- **`[P1]` [UC-8 / UC-9 / UC-21] Tam Ekran Fotoğraf İnceleme, Etiket Ekleme ve "Bu Kim?" Kişi Eşleştirme (`PhotoLightboxModal`)**
  - **Story:** *"Fotoğrafa tıkladığımda büyük halini görmek, altına `#aile`, `#dans` gibi etiketler eklemek (`UC-8`) veya `Bu karede kim var?` listesinden davetliyi seçip etiketlemek (`UC-21`) istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Seçim modu kapalıyken fotoğrafa 1 tık → Tam ekran **`PhotoLightboxModal` (`P1`)** açılır.

- **`[P1]` [UC-20] Gelen Davetliler Sekmesi & Referans Filtreleri (`Gelin`, `Damat`, `Masa QR`)**
  - **Story:** *"Gelin ve damat olarak düğünümüze kimlerin katıldığını, kimin davetiyesiyle (`gelin`, `damat`, `masa qr`) geldiğini ve kaç fotoğraf yüklediğini görmek, ismine tıkladığımda onun çektiği fotoğraflara gitmek istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ana ekrandaki 2 sekmeden ikincisidir: **`Fotoğraflar (X)`** | **`Davetliler (Y)`** (`P1` — 1 tık).

### B. Ana Ekrandan Kaldırılıp Sağ Üstteki `⚙ Ayarlar` Çekmecesine Taşınacaklar (`P2` ve `P3`)

- **`[P2]` [UC-17] Yönetici ve Davetli Şifrelerini Görme / Değiştirme**
  - **Story:** *"Düğün sahibi olarak şifremi unuttuğumda görmek veya değiştirmek isterim ama bu kutu her dakika fotoğrafların üstünde durmamalı."*
  - **Ulaşım:** Sağ üst bar → **`ayarlar`** (`OwnerSettingsSheet` — 1 tıkla açılır).

- **`[P2]` [UC-7] Gizlenen Fotoğraflar Arşivi ve Geri Yükleme (`Restore`)**
  - **Story:** *"Yanlışlıkla gizlediğim veya sonradan lazım olan fotoğrafların diskten silinmediğinden emin olmak ve gerektiğinde arşive girip tekrar yayına almak istiyorum."*
  - **Ulaşım:** Sağ üst bar → **`ayarlar`** (veya galeri filtre sonu) → **`Gizlenen Arşivi (X)`** (`P2`). Ana ekranı kalabalıklaştırmaz.

- **`[P2]` [UC-16] Sağdıç / Yardımcı Yönetici Yetkilendirme**
  - **Story:** *"Fotoğrafçı veya düğün sahibi olarak sağdıca yönetici linki/şifresi vererek süreci onun yönetmesini sağlamak istiyorum."*
  - **Ulaşım:** Sağ üst bar → **`ayarlar`** veya **`bağlantılar`** ekranı (`P2`).

- **`[P3]` [UC-20] Katılım Kaynağı Dağılım Grafiği ve Paylaşım Kayıt Defteri (`share_links`)**
  - **Story:** *"Kaç kişi gelin tarafından, kaç kişi damat tarafından geldi, hangi link kaç kez açıldı detayını merak ettiğimde görmek istiyorum."*
  - **Ulaşım:** Davetliler sekmesindeki **`ⓘ dağılım`** butonu ve `bağlantılar` ekranındaki **`paylaşım defteri`** çekmecesi (`P3`).

---

## EKRAN 4: `LINK_SHARE` — Davet Bağlantısı ve Masa QR Ekranı (`LinkShareView.js`)

**Ekranın Amacı:** Düğün linklerini ve QR kodlarını **1 saniyede kopyalamak veya yazdırmak**; istenirse kişiye/masaya özel takipli link üretmek.

### Use-Case & Story Öncelik Listesi

- **`[P0]` [UC-20 / UC-38 / UC-39] 4 Temel Kanal İçin Tek Tıkla Link Kopyalama & QR Gösterme**
  - **Story:** *"Yönetici olarak Gelin Davetiyesi, Damat Davetiyesi, Masa QR Kartı ve Sağdıç Yönetim linklerini hiç form doldurmadan tek tıkla kopyalamak veya QR kodunu ekranda açıp/yazdırmak istiyorum."*
  - **Büyüklük & Ulaşım:**
    - Ekran açıldığında doğrudan 4 temiz kart (`P0`) görünür: Her kartta **`Link Kopyala`** ve **`QR Göster`** butonu vardır.

- **`[P2]` [UC-20 Detay] Kişiye veya Masaya Özel Takipli Link Üretici ("Kimden → Kime")**
  - **Story:** *"Özel bir davetliye (ör. Ahmet Yılmaz) veya belirli bir masaya (Masa 5) özel link/QR üretip onun ne zaman açtığını takip etmek istediğimde özel üretim aracını açabilmeliyim."*
  - **Büyüklük & Ulaşım:**
    - Ana ekranın üstünü kaplamaz; **`+ kişiye / masaya özel takipli link üret`** (`P2` — 1 tıkla açılır/kapanır) başlığı altında ve geçmiş kayıtlar da **`paylaşım kayıt defteri (X)`** (`P2`) açılır bölümünde yer alır.

---

## 4. Özet Mimari Karar: Ekran Başına Maksimum Öğe Kuralı

1. **Karşılama Ekranı (`LandingView`)**: Aktif oturum varsa **1 kart** (`Devam Et`), özel link varsa **2 input** (`Ad Soyad`, `Şifre`) + **1 buton**.
2. **Davetli Ekranı (`InviteeView`)**: **1 yükleme alanı** (`+ Fotoğraf Ekle`) + **2 filtre sekmesi** (`Tümü` / `Benimkiler`) + **Fotoğraf Izgarası**. (Seçim önizlemesi `UploadStagingSheet` çekmecesinde, tam ekran inceleme `PhotoLightboxModal` içinde).
3. **Yönetici Ekranı (`OwnerView`)**: Üst barda **`bağlantılar`** ve **`ayarlar`**; içerikte **`manager-line`** + **2 ana sekme** (`Fotoğraflar` / `Davetliler`) + **Arama/Etiket çubuğu** + **Fotoğraf Izgarası**. (Şifreler, Arşiv ve Sağdıç ayarları tamamen **`ayarlar`** çekmecesine taşınır).
4. **Bağlantı Ekranı (`LinkShareView`)**: **4 ana kanal kartı** (Gelin, Damat, Masa QR, Yönetici) doğrudan görünür; özel kişi atama ve geçmiş paylaşım kayıtları açılır çekmecede (`P2`) durur.
