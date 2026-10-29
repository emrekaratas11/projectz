# Epics — fotoyönetim

## E1 · Fotoğrafçı hesabı ve düğün oluşturma
*UC14, UC15, UC16, UC17*

### User Stories
- **US-E1-1** — Fotoğrafçı olarak sisteme kayıt olmak istiyorum, bu sayede düğün oluşturabileyim.
- **US-E1-2** — Fotoğrafçı olarak yeni bir düğün oluşturmak istiyorum, bu sayede davetlilere özel bir link verebileyim.
- **US-E1-3** — Fotoğrafçı olarak sağdıç/yakın aile üyesini yönetici olarak atamak istiyorum, bu sayede tüm süreci kendim yönetmek zorunda kalmayayım.
- **US-E1-4** — Fotoğrafçı olarak gelin ve damata onay kodu/şifresi göndermek istiyorum, bu sayede sadece onlar galeriye erişebilsin.

### Senaryolar (UC14 — Kayıt)
**Ana Senaryo:**
1. Fotoğrafçı kayıt ekranını açar.
2. Ad-soyad, e-posta, şifre bilgilerini girer.
3. Sisteme kayıt olur.
4. Fotoğrafçı paneline yönlendirilir.

**Alternatif Senaryo A — E-posta zaten kayıtlı:**
1. Sistem "bu e-posta ile hesap zaten mevcut" uyarısı verir.
2. Fotoğrafçı giriş ekranına yönlendirilir.

---

### Senaryolar (UC15 — Düğün oluşturma)
**Ana Senaryo:**
1. Fotoğrafçı panelinde "Yeni Düğün" butonuna basar.
2. Düğün adı ve tarihi girer.
3. Sistem benzersiz bir `dugun-kodu` üretir.
4. Davetli linki ve QR kod hazırlanır, fotoğrafçıya gösterilir.

**Alternatif Senaryo A — Aynı isimde düğün var:**
1. Sistem otomatik olarak sonuna `{yıl}` ekleyerek benzersiz kodu oluşturur.

---

### Senaryolar (UC16 — Sağdıç yönetici atama)
**Ana Senaryo:**
1. Fotoğrafçı düğün detayından "Sağdıç Ekle" bölümüne gider.
2. Sağdıcın telefon numarasını girer.
3. Sistem sağdıca SMS ile giriş bağlantısı gönderir.
4. Sağdıç linke tıklayarak düğün yönetim paneline girer.

---

### Senaryolar (UC17 — Gelin/Damat erişimi)
**Ana Senaryo:**
1. Fotoğrafçı düğün detayından gelin ve damata özel kısa şifreyi görür.
2. SMS ile paylaşır (ya da sağdıçtan alırlar).
3. Gelin/Damat giriş ekranında düğün kodunu ve şifreyi girerek sisteme girer.

**Alternatif Senaryo A — Şifreyi unuttular:**
1. Fotoğrafçı yeni şifre üretebilir veya SMS yeniden gönderebilir.

---

## E2 · Davetli yükleme deneyimi
*UC11, UC18, UC19, UC23–27, UC38, UC39, UC42*

### User Stories
- **US-E2-1** — Davetli olarak bana verilen linke tıklayarak sisteme girmek istiyorum, uygulama indirmeden.
- **US-E2-2** — Davetli olarak adımı girdikten sonra fotoğraf yükleyebilmek istiyorum.
- **US-E2-3** — Davetli olarak galeriden birden fazla fotoğraf seçip tek seferde yükleyebilmek istiyorum.
- **US-E2-4** — Davetli olarak yanlış fotoğraf seçtiğimde, yüklemeden önce iptal edebilmek istiyorum.
- **US-E2-5** — Davetli olarak yüklediğim fotoğrafları kendi mini galerimde görmek istiyorum.

### Senaryolar (UC38 — Link ile giriş)
**Ana Senaryo:**
1. Davetli telefona gelen SMS'teki veya QR koddaki linke tıklar.
2. Link `dugun.fotoyonetim.com/{dugun-kodu}` formatındadır.
3. Sistem düğün kodunu URL'den okur.
4. Kullanıcıya **isim popup'u** gösterilir (rol seçme ekranı atlanır).
5. Davetli adını ve soyadını girer.
6. Davetli paneli açılır.

**Alternatif Senaryo A — Link geçersiz/süresi dolmuş:**
1. Sistem "bu link geçersiz veya aktif değil" mesajı gösterir.
2. Davetli fotoğrafçısına danışması için yönlendirme metni gösterilir.

**Alternatif Senaryo B — Davetli isim girmek istemez:**
1. "Atla" seçeneğine basar.
2. Sistem geçici bir `Misafir-{uuid}` kimliği atar.
3. Davetli yine de fotoğraf yükleyebilir; yüz tanıma aşamasında kimlik güncellenir.

---

### Senaryolar (UC11 — İsim girişi)
**Ana Senaryo:**
1. Sistem davetliye "Adınız nedir?" popup'ı gösterir.
2. Davetli ad ve soyadını girer, "devam" butonuna basar.
3. Sistem davetliyi `guests` tablosuna kaydeder: `{id, wedding_id, name, joined_at}`.
4. Davetli paneli açılır.

---

### Senaryolar (UC23–25 — Fotoğraf yükleme)
**Ana Senaryo:**
1. Davetli "Fotoğraf Ekle" alanına basar.
2. Telefon galerisi açılır; birden fazla fotoğraf seçilir.
3. "Ekle" butonuna basılır.
4. Sistem her fotoğraf için şunları yapar:
   - Düşük çözünürlüklü thumbnail üretir.
   - Yüksek çözünürlüklü orijinali saklar.
   - `photos` tablosuna kaydeder: `{id, wedding_id, guest_id, filename, thumb_path, full_path, uploaded_at, status}`.
5. Yükleme çubuğu gösterilir; tamamlandığında toast mesajı çıkar.

**Alternatif Senaryo A — 50 fotoğraf limiti aşıldı:**
1. Sistem 50'yi aşan dosyaları kabul etmez.
2. "En fazla 50 fotoğraf yükleyebilirsiniz" uyarısı gösterilir.

**Alternatif Senaryo B — Dosya formatı desteklenmiyor:**
1. Sistem sadece `image/*` kabul eder; video dosyaları reddedilir.

---

### Senaryolar (UC26–27 — Seçim iptali)
**Ana Senaryo A — Tekil iptal:**
1. Davetli seçili fotoğrafa tekrar dokunur.
2. Seçim kaldırılır.

**Ana Senaryo B — Toplu iptal:**
1. Davetli "İptal" butonuna basar.
2. Tüm seçimler temizlenir; galeri başlangıç durumuna döner.

---

## E3 · Fotoğrafçı toplu aktarım (kameradan sisteme)

### User Stories
- **US-E3-1** — Fotoğrafçı olarak kameramı USB ile bilgisayara bağladığımda fotoğrafların otomatik olarak sisteme aktarılmasını istiyorum.
- **US-E3-2** — Fotoğrafçı olarak SD kartı bilgisayara taktığımda toplu yükleme başlasın istiyorum.

### Senaryolar
**Ana Senaryo — SD Kart / USB aktarım:**
1. Fotoğrafçı masaüstü uygulaması (ya da CLI aracı) aracılığıyla bir klasör seçer.
2. Sistem o klasördeki tüm `.jpg/.raw/.cr2` dosyalarını sırayla yükler.
3. Her dosya için thumbnail + full-res depolama yapılır.
4. İlerleme çubuğu gösterilir.

*Not: Bu epic MVP sonrası; Phase 2 kapsamında masaüstü yardımcı uygulaması olarak geliştirilecek.*

---

## E4 · Depolama ve medya pipeline'ı
*UC1, UC2, UC3, UC10*

### User Stories
- **US-E4-1** — Sistem olarak yüklenen her fotoğrafı hem SSD'ye hem buluta kaydetmek istiyorum; böylece hiçbir fotoğraf kaybolmasın.
- **US-E4-2** — Sistem olarak düşük çözünürlüklü thumbnail üretmek istiyorum; böylece galeri listesi hızlı yüklensin.
- **US-E4-3** — Sistem olarak tüm depolama işlemlerini veritabanına kaydetmek istiyorum; böylece ne nerede saklandığını bileyim.

### Senaryolar (UC1 — SSD kayıt)
**Ana Senaryo:**
1. Fotoğraf yükleme isteği gelir.
2. Sistem dosyayı `uploads/{wedding_id}/{date}/{uuid}.jpg` yoluna yazar.
3. Yolu `photos.full_path` alanına kaydeder.

### Senaryolar (UC2 — Cloud yedekleme)
**Ana Senaryo:**
1. SSD yazımı başarılı olunca arka plan görevi cloud senkronizasyonu başlatır.
2. Fotoğraf S3-uyumlu depolamaya yüklenir.
3. `photos.cloud_url` güncellenir, `photos.synced_at` kaydedilir.

### Senaryolar (UC9/UC10 — Thumbnail + hızlı arama)
**Ana Senaryo:**
1. Yükleme sırasında sistem orijinali saklar ve `480px` thumbnail üretir.
2. Arama sorgularında önce thumbnail listesi döner (hızlı).
3. Kullanıcı bir fotoğrafa tıkladığında full-res yüklenir.

---

## E5 · İçerik moderasyonu
*UC4, UC7*

### User Stories
- **US-E5-1** — Sistem olarak yüklenen fotoğraflardaki çıplaklık içeren görselleri otomatik tespit edip engellemek istiyorum.
- **US-E5-2** — Düğün sahibi olarak istemediğim fotoğrafları silmek istiyorum; silinen fotoğraflar başkalarına görünmesin ama gerçekten silinmesin.

### Senaryolar (UC4 — Otomatik moderasyon)
**Ana Senaryo:**
1. Fotoğraf yüklenir.
2. Sistem moderasyon servisi çağrısı yapar (async).
3. Sonuç `SAFE` → `photos.status = 'approved'` güncellenir; galeri'de görünür.
4. Sonuç `UNSAFE` → `photos.status = 'flagged'`; galeri'den gizlenir; fotoğrafçıya bildirim gider.

**Alternatif Senaryo — Moderasyon servisi yanıt vermez:**
1. Fotoğraf `status = 'pending'` olarak eklenir.
2. Tekrar denenene kadar galeri'de görünmez.

### Senaryolar (UC7 — Soft-delete)
**Ana Senaryo:**
1. Düğün sahibi fotoğrafı siler.
2. `photos.deleted_at` zaman damgası eklenir; `is_deleted = true`.
3. Galeri sorgularında `WHERE is_deleted = false` filtresi uygulanır.
4. Fotoğraf fiziksel olarak silinmez; 30 gün sonra arka plan görevi gerçek silme yapar.

---

## E6 · Yüz tanıma ve kişi eşleme
*UC5, UC5.1, UC6, UC11.1, UC21, UC22, UC40, UC41*

### User Stories
- **US-E6-1** — Sistem olarak yüklenen her fotoğraftaki yüzleri tespit edip kaydetmek istiyorum.
- **US-E6-2** — Davetli olarak kendi yüzümü içeren fotoğrafların bana otomatik iletilmesini istiyorum.
- **US-E6-3** — Gelin olarak kimlerin birlikte çekildiğini etiketleyerek galeriyi zenginleştirmek istiyorum.

### Senaryolar (UC5 — Yüz tespiti)
**Ana Senaryo:**
1. Fotoğraf yüklenir.
2. Yüz tanıma servisi fotoğraftaki tüm yüzleri tespit eder.
3. Her yüz için `face_embeddings` tablosuna kayıt eklenir: `{id, photo_id, person_id, embedding_vector, bbox}`.
4. Bilinen yüzlerle eşleşme aranır.

### Senaryolar (UC6 — Otomatik iletme)
**Ana Senaryo:**
1. Davetli adıyla giriş yapmış ve en az 1 fotoğraf yüklemiş.
2. Sistem davetlinin yüzünü referans olarak alır.
3. Galerideki tüm fotoğraflarda bu yüzü arar.
4. Eşleşen fotoğraflar `notifications` tablosuna eklenir.
5. SMS/bildirim ile davetliye iletilir.

---

## E7 · Etiketleme ve arama
*UC8, UC10*

### User Stories
- **US-E7-1** — Fotoğrafçı olarak fotoğraflara "genç çift", "çocuklar", "aile fotoğrafı" gibi etiketler atamak istiyorum.
- **US-E7-2** — Düğün sahibi olarak etiket veya isimle arama yapabilmek istiyorum.

### Senaryolar (UC8 — Etiketleme)
**Ana Senaryo:**
1. Fotoğrafçı galeri ekranında bir fotoğrafa uzun basar.
2. "Etiket ekle" seçeneğini seçer.
3. Serbest metin veya önerilen etiketlerden birini seçer.
4. `photo_tags` tablosuna eklenir: `{photo_id, tag, added_by}`.

### Senaryolar (UC10 — Arama)
**Ana Senaryo:**
1. Düğün sahibi galeri ekranında arama alanına girer.
2. İsim veya etiket yazar.
3. Sistem `photos JOIN photo_tags JOIN guests` sorgusu çalıştırır.
4. Eşleşen thumbnail'lar listelenir.

---

## E8 · Düğün sahibi galeri yönetimi
*UC12, UC33, UC34, UC35, UC36, UC37*

### User Stories
- **US-E8-1** — Düğün sahibi olarak tüm fotoğrafları görmek istiyorum.
- **US-E8-2** — Seçtiğim fotoğrafları indirmek istiyorum.
- **US-E8-3** — İstemediğim fotoğrafları silmek istiyorum.
- **US-E8-4** — Tüm fotoğrafları tek tıkla seçmek istiyorum.

### Senaryolar (UC33–36 — Galeri gezinme, seçme, indirme)
**Ana Senaryo:**
1. Düğün sahibi galeri ekranını açar (`GET /api/weddings/{id}/photos`).
2. Thumbnail grid yüklenir.
3. Fotoğraflara tek tek tıklayarak seçer; seçili fotoğraflar altın renkli çerçeve ile vurgulanır.
4. "İndir" butonuna basar.
5. Sistem seçili fotoğrafları ZIP olarak paketler; indirme başlar.

**Alternatif Senaryo — "Tümünü Seç":**
1. Topbar'daki "tümünü seç" butonuna basar.
2. Tüm fotoğraflar seçilir; seçim çubuğu güncellenir.

### Senaryolar (UC37 — Silme)
**Ana Senaryo:**
1. Düğün sahibi fotoğrafları seçer.
2. Seçim çubuğundaki "Sil" butonuna basar.
3. Onay bottom sheet çıkar: "Seçilen X fotoğraf gizlenecek. Emin misiniz?"
4. Onaylar → soft-delete uygulanır.

---

## E9 · Baskı
*UC13*

### User Stories
- **US-E9-1** — Fotoğrafçı olarak seçtiğim fotoğrafın yüksek çözünürlüklü çıktısını almak istiyorum.
- **US-E9-2** — Birden fazla fotoğrafı toplu olarak seçip baskıya göndermek istiyorum.

### Senaryolar
**Ana Senaryo:**
1. Fotoğrafçı galeride fotoğrafları seçer.
2. "Baskı" seçeneğini seçer.
3. Baskı boyutu (10x15, A4...) seçilir.
4. Sistem full-res dosyaları bir ZIP'e paketler veya baskı entegrasyonuna iletir.

---

## E10 · Güvenlik, kötüye kullanım ve analitik
*UC4, UC20*

### User Stories
- **US-E10-1** — Sistem olarak kim hangi referanstan geldi bilmek istiyorum.
- **US-E10-2** — Sistem olarak kötü niyetli bot isteklerini tespit etmek istiyorum.

### Senaryolar (UC20 — Dynamic link analitik)
**Ana Senaryo:**
1. Fotoğrafçı her davetli için kişiselleştirilmiş link üretebilir: `/{dugun-kodu}?ref={kisi-adi}`.
2. Davetli linke tıkladığında `analytics_events` tablosuna kayıt düşer: `{wedding_id, ref, ip_hash, user_agent, timestamp}`.
3. Fotoğrafçı panelinde "Kim Geldi?" ekranından referans bazlı istatistikleri görebilir.

**Alternatif Senaryo — Şüpheli istek:**
1. Aynı IP'den kısa sürede fazla istek gelirse `rate_limit` devreye girer.
2. `blocked_ips` tablosuna kayıt düşer.

---

## E11 · Yönetim / Destek Paneli
*Backoffice*

### User Stories
- **US-E11-1** — Yönetici olarak tüm düğünleri ve fotoğrafçıları listeleyebilmek istiyorum.
- **US-E11-2** — Destek ekibi olarak şikayet edilen içerikleri inceleyip onaylayabilmek istiyorum.

---

## E12 · Paket, Ödeme, Kota

### User Stories
- **US-E12-1** — Fotoğrafçı olarak abonelik paketimi seçebilmek istiyorum (depolama + düğün sayısına göre).
- **US-E12-2** — Kota dolduğunda sistem beni uyarsın, yükleme durdurulmadan önce haber versin.

---

## E13 · Gizlilik ve KVKK

### User Stories
- **US-E13-1** — Davetli olarak kişisel verilerimin ne amaçla kullanıldığını açıkça göreyim.
- **US-E13-2** — Davetli olarak verilerimin silinmesini talep edebilmeliyim.

### Senaryolar
**Ana Senaryo:**
1. Davetli isim giriş ekranında "Gizlilik Politikası" linkine tıklar.
2. Verilerinin yalnızca düğün fotoğraf paylaşımı için kullanıldığı açıklanır.
3. Devam etmek için onay kutusunu işaretler.

---

## E14 · Bildirim ve iletişim
*UC19, UC41, UC43*

### User Stories
- **US-E14-1** — Davetli olarak fotoğraflarım hazır olduğunda SMS veya uygulama bildirimi almak istiyorum.
- **US-E14-2** — Fotoğrafçı olarak davetlilere toplu SMS göndererek linki iletmek istiyorum.

### Senaryolar (UC43 — Fotoğraf hazır bildirimi)
**Ana Senaryo:**
1. Yüz tanıma davetlinin bulunduğu fotoğrafları tespit eder.
2. Sistem `notifications` tablosuna kayıt ekler: `{guest_id, type: 'photos_ready', sent_at}`.
3. SMS servisi üzerinden davetliye link gönderilir.
4. Davetli linke tıklayarak kendi galerisini görür.

**Alternatif Senaryo — Telefon numarası verilmemiş:**
1. Bildirim sistemde bekletilir.
2. Davetli bir sonraki girişinde in-app bildirimle gösterilir.
