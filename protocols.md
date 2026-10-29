# FotoYönetim — Sistem Protokolleri & Use Case Uygulama Notları

Bu doküman, `plan.md` ve `epics.md` içinde tanımlanan Use Case'lerin (UC-1 – UC-43) mimari ve teknik karşılıklarını belgeler.

---

## 1. Depolama & Dosya Yönetim Protokolü (UC-1, UC-2, UC-3)
* **Amaç:** Fotoğrafçı ve davetlilerden gelen tüm fotoğrafların yerel NVMe/SSD diskte organize edilmesi, aynı zamanda asenkron olarak bulut yedeklemesine hazırlanması.
* **Klasör Mimarisi:**
  ```text
  storage/
  ├── photos/
  │   └── {wedding_slug_or_id}/
  │       ├── full/            (Orijinal yüksek çözünürlüklü fotoğraflar - UC-9)
  │       │   └── {photo_id}.jpg
  │       └── thumbs/          (Web ve mobil için hızlı 480px önizleme - UC-9/10)
  │           └── {photo_id}_thumb.jpg
  └── manifest.json            (Fotoğraf mülkiyeti, düğün kodu, silinme durumu)
  ```
* **Manifest & Veritabanı Kayıt Formatı:**
  Her fotoğraf aşağıdaki meta verilerle takip edilir:
  - `photo_id`: Benzersiz UUID
  - `wedding_code`: Bağlı olduğu düğün kodu/slug
  - `uploader_name`: Fotoğrafı yükleyen davetli veya yöneticinin adı
  - `uploader_nick`: Otomatik üretilen kullanıcı adı (`@isim_soyisim_12`)
  - `uploader_phone`: İsteğe bağlı telefon numarası (UC-19)
  - `file_path`: Orijinal disk yolu (`full/{photo_id}.jpg`)
  - `thumb_path`: Düşük çözünürlüklü önizleme yolu (`thumbs/{photo_id}_thumb.jpg`)
  - `is_deleted`: Soft-delete bayrağı (0 = Aktif, 1 = Silindi / Gizlendi - UC-7)
  - `deleted_by`: Silme işlemini yapan yetkili (Gelin, Damat, Sağdıç, Fotoğrafçı - UC-12, UC-37)
  - `deleted_at`: Silinme zaman damgası
  - `uploaded_at`: Yükleme zaman damgası
  - `file_size`, `mime_type`, `width`, `height`

---

## 2. Fotoğraf Silme & Arşiv Protokolü (Soft Delete Retention) (UC-7, UC-12, UC-37)
* **Kural:** Düğün sahibi (gelin/damat), sağdıç veya otokontrol tarafından silinen hiçbir fotoğraf fiziksel diskten anında kalıcı olarak silinmez.
* **İşleyiş:**
  1. Kullanıcı galeriden fotoğrafı siler.
  2. Veritabanında `is_deleted = 1` ve `deleted_at = CURRENT_TIMESTAMP` işaretlenir.
  3. Genel davetli galerisinden (`ListByWedding`) ve davetlinin kendi listesinden anında kaldırılır (erişim kesilir).
  4. Fotoğrafçı yönetim paneli ve yasal saklama katmanında fotoğraf kanıt ve arşiv niteliğinde muhafaza edilmeye devam eder.

---

## 3. Çift Çözünürlük (Dual Quality) & Performans Protokolü (UC-9, UC-10)
* **Kural:** Bant genişliği tasarrufu ve saniyeler içinde binlerce fotoğrafı listeleyebilmek için:
  - Galeri akışında ve mobil listelerde sadece hafif `thumbs/` (480px) servis edilir.
  - İndirme (`downloadSelected`), yazdırma (`UC-13 Print`) veya tam ekran incelemede orijinal yüksek çözünürlüklü `full/` dosya sunulur.

---

## 4. Yükleme Limiti & Güvenlik Protokolü (UC-18)
* **Kural:** Kötü niyetli yüklemeleri ve sunucu bellek taşmalarını önlemek için davetliler tek bir seferde en fazla **50 fotoğraf** seçebilir (`MAX = 50`).
* **Format Doğrulama:** Sadece dosya uzantısı değil, dosyanın ilk 12 baytındaki Magic Byte imzası (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `52 49 46 46`) doğrulanır.

---

## 5. Dinamik Link & Referans Takip Protokolü (UC-20)
* **Kural:** Düğüne giren herkesin hangi kanal ve referansla geldiği kayıt altına alınır:
  - `ref=gelin`: Gelin davetiyesi linkinden gelenler
  - `ref=damat`: Damat davetiyesi linkinden gelenler
  - `ref=masa-qr`: Masa üzerindeki QR kartını okutanlar
  - `ref=fotografci`: Fotoğrafçı yönetim linki
  - `ref=direkt`: Kodu doğrudan yazarak girenler
* **Yönetici Paneli:** Gelen kişiler tablosunda her davetlinin yanında kimin referansıyla geldiği rozet olarak listelenir.

---

## 6. Yüz Tanıma & Yapay Zeka Hazırlık Protokolü (UC-5, UC-6, UC-11.1, UC-40, UC-41)
* **Kural:** Yüklenen her fotoğraf için `photo_tags` tablosunda yüz vektörleri ve etiketler saklanabilir.
* Davetli kendi fotoğrafını yüklediğinde yüz vektörü eşleştirilerek galerideki diğer fotoğrafları kendisine filtrelenebilir.

