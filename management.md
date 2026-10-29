# FotoYönetim — State Management & SaaS Mimari Raporu (Zustand + React)

Bu doküman, uygulamanın monolitik JavaScript yapısından **React + Zustand** ve **Repository Pattern** tabanlı, SaaS güvenlik standartlarına tam uyumlu modern mimariye dönüşümünü açıklar.

---

## 1. SaaS Güvenlik ve Veri Modeli İlkeleri
1. **İstemcide Asla Ham Veritabanı veya Şifre Saklanmaz (Zero Client DB Dump):**
   - Eski yaklaşımda tarayıcı hafızasında (`window` veya açık `localStorage` objelerinde) düğünlerin ham şifreleri, veritabanı tabloları veya yetkisiz erişim sağlayabilecek nesneler bulunuyordu.
   - Yeni mimaride istemci yalnızca bir **İstemci Katmanı (Client Layer)** olarak çalışır; tüm işlemler **Repository Pattern (Veri Erişim Katmanı)** ve arka plandaki Go REST API üzerinden token / session doğrulamalı olarak yürütülür.
2. **Kalıcı Kimlik & Rol Güvenliği (Google Account Tarzı):**
   - Kullanıcının cihazında sadece kriptografik oturum token'ı ve aktif rol kimliği saklanır (`HttpOnly` / `SameSite=Lax` çerez veya güvenli şifrelenmiş session deposu).
   - Yetkisiz hiçbir davetli, istemci tarafındaki değişkenleri değiştirerek düğün sahibi (`owner`) yetkilerine sıçrayamaz; API ve Repository katmanındaki her mutasyon `photographer_id` ve sahiplik kontrolüyle korunur.

---

## 2. Zustand Store Mimarisi (`src/store/index.js`)

Zustand, hafifliği (< 1KB), boilerplate gerektirmemesi ve bileşen dışından da erişilebilir olması nedeniyle tercih edilmiştir. Mağaza (store) 5 bağımsız dilime (slice) ayrılmıştır:

```text
┌──────────────────────────────────────────────────────────────────┐
│                           useAppStore                            │
├───────────────┬────────────────┬───────────────┬────────────────┤
│   authSlice   │  weddingSlice  │ gallerySlice  │ trackingSlice  │
├───────────────┴────────────────┴───────────────┴────────────────┤
│                            uiSlice                              │
└──────────────────────────────────────────────────────────────────┘
```

### 1. `authSlice` (Kimlik & Oturum)
- `account`: `{ name, nick, role: 'guest'|'owner'|'bestman'|'photographer', token, status }`
- `loginGuest(name, pin, weddingCode)`: Davetli girişi
- `loginManager(code, pass, role)`: Düğün sahibi / sağdıç doğrulaması
- `logout()`: Oturumu sonlandırma ve çerezi temizleme

### 2. `weddingSlice` (Düğün & Vanity Linkler)
- `currentWedding`: Aktif düğün bilgileri (ad, tarih, kod, slug)
- `incomingRef`: Linkten gelen referans (`gelin`, `damat`, `masa-qr`, `fotografci`)
- `getWeddingLinks()`: Özel isimli vanity link üretimi (`fotoyonetim.com/#/ayse-mehmet?ref=gelin`)
- `createWedding(data)`: Yeni düğün kaydı

### 3. `gallerySlice` (Fotoğraf & Yükleme Yönetimi)
- `photos`: Aktif düğüne ait fotoğraflar (soft delete olanlar filtrelenmiş)
- `selectedPhotos`: Toplu indirme/silme için seçilen ID kümesi (`Set`)
- `uploadPhotos(files)`: 50 fotoğraf sınırı ve magic-byte kontrollü yükleme (UC-18)
- `softDeleteSelected()`: Fotoğrafları arşivde tutarak genel yayından kaldırma (UC-7, UC-12)

### 4. `trackingSlice` (Ziyaretçi & Referans Takibi)
- `visitors`: Düğüne katılan davetliler listesi
- `stats`: Gelin tarafı, damat tarafı, masa QR dağılımı (UC-20)
- `filter`: 'all' | 'gelin' | 'damat' | 'masa-qr'

### 5. `uiSlice` (Ekran, Modal & Bildirimler)
- `activeScreen`: SPLASH, ROLE_SELECT, INVITEE_PANEL, OWNER_PANEL, LINK_SHARE
- `toasts`: Bildirim kuyruğu
- `isAuthModalOpen`, `isLegalModalOpen`: Modal görünürlükleri

---

## 3. İstemci Repository Pattern (`src/services/repositories.js`)

İstemci bileşenleri hiçbir zaman doğrudan veri tabanına veya depolama alanına erişmez; tüm işlemler sözleşmeli repository arayüzleri üzerinden yürütülür:

- **`WeddingRepository`**: `getBySlug(slug)`, `create(payload)`, `verifyPin(code, pin)`
- **`PhotoRepository`**: `listByWedding(code)`, `upload(files, meta)`, `softDelete(photoId)`
- **`AttendanceRepository`**: `trackEntry(meta)`, `getAttendees(code)`

---

## 4. UI Sadeleştirme & Editoryal Tasarım İlkeleri
- **Sıfır Emoji (Zero Emojis):** Tüm emoji simgeleri (`💍`, `👰`, `🤵`, vb.) kaldırılmış; yerlerine zarif tipografik etiketler (`gelin davetlisi`, `damat davetlisi`, `masa qr`) ve ince ayırıcı noktalar (`·`) getirilmiştir.
- **Form Karmaşasının Temizlenmesi:** Kullanıcının zaten anladığı bariz açıklama paragrafları ve gereksiz yardımcı metinler kaldırılmış; formlar saf ve minimal hale getirilmiştir.
- **Gereksiz Sekmelerin Birleştirilmesi:** 3 sekmeli yapı yerine 2 ana giriş alanı sunulur:
  1. `Davetli Girişi` (Misafirler için odaklı, hızlı giriş)
  2. `Yönetim` (Altında "Mevcut Düğün Girişi" ve "Yeni Düğün Oluştur" seçeneklerini barındırır).

