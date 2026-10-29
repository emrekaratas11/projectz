# fotoyönetim — README

## Proje Yapısı

```
fotoyonetim/
├── index.html          ← SPA (davetli / fotoğrafçı / düğün sahibi)
├── style.css           ← Design system (Cormorant + Caveat)
├── app.js              ← FSM router + tüm UI mantığı
├── epics.md            ← Epic → User Story → Senaryo → Alternatif Senaryo
├── plan.md             ← Ham use-case notları (kaynak)
├── screens.md          ← Ekran listesi + FSM geçiş tablosu notu
├── db_schema.md        ← SQLite şema + tasarım kararları
└── server/
    ├── main.go         ← Echo server bootstrap
    ├── go.mod          ← Go modülü
    ├── db/
    │   └── migrate.go  ← SQLite migration (tüm tablolar)
    └── handlers/
        └── handlers.go ← Tüm API endpoint handler'ları
```

## Versiyon

`v0.1_backup` → `fotoyonetim_v0.1_backup/` klasöründe saklandı.

## Frontend: Çalıştırma

Herhangi bir HTTP sunucusuyla açın:

```powershell
# Python varsa:
python -m http.server 3000
# Daha sonra: http://localhost:3000
```

Ya da `index.html` dosyasına çift tıklayın (file:// üzerinden).

## Cloud & Backend: Çalıştırma

Uygulamayı hem yerel makinede hem de bulut ortamlarında (Cloud Run, Fly.io, Railway, Heroku, Docker) doğrudan kök dizinden çalıştırabilirsiniz:

```powershell
# Kök dizinde:
go run .

# veya derleyip çalıştırmak için:
go build -o fotoyonetim .
./fotoyonetim
```

### Ortam Değişkenleri (Cloud Ready)
- `PORT`: HTTP sunucusunun dinleyeceği port (Varsayılan: `8080`, dinleme adresi: `0.0.0.0:$PORT`)
- `DB_PATH`: SQLite veritabanı dosya yolu (Varsayılan: `./fotoyonetim.db`)
- `STORAGE_DIR`: Kalıcı SSD/depolama klasörü (Varsayılan: `./storage`)

### Testleri Çalıştırma
```powershell
go test -v ./...
```

### API Özeti

| Method | Path | Açıklama |
|--------|------|----------|
| POST | /api/v1/photographers/register | Fotoğrafçı kayıt |
| POST | /api/v1/photographers/login | Giriş |
| POST | /api/v1/weddings | Düğün oluştur (auth) |
| GET  | /api/v1/weddings | Düğünleri listele (auth) |
| GET  | /api/v1/weddings/:code | Düğün detay (public) |
| POST | /api/v1/weddings/:code/guests | Davetli oluştur (public) |
| POST | /api/v1/weddings/:code/photos | Fotoğraf yükle (public) |
| GET  | /api/v1/weddings/:code/photos | Fotoğraf listesi |
| DELETE | /api/v1/photos/:id | Fotoğraf sil (soft) |
| GET  | /api/v1/weddings/:code/download | İndirme URL listesi |
| POST | /api/v1/analytics | Olay kaydı |

## Davetli Linki Formatı

```
https://dugun.fotoyonetim.com/{dugun-kodu}
https://dugun.fotoyonetim.com/{dugun-kodu}?ref=ahmet-yilmaz
```

Link URL'de düğün kodu varsa `rol seçme ekranı atlanır` — direkt isim sorulur.

## Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Vanilla HTML/CSS/JS · Cormorant Garamond + Caveat |
| Backend | Go 1.22 + Echo v4 |
| Veritabanı | SQLite (`modernc.org/sqlite` — CGO gerekmez) |
| Depolama | Yerel dosya sistemi (Phase 2: S3) |
