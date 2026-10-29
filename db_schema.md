# Database Schema — fotoyönetim
## Kaynak: Senaryo İsim / Fiil / Sıfat Analizi

### Senaryolardan çıkarılan terimler

| Kategori | Terimler |
|----------|----------|
| **İsimler (Tablolar)** | fotoğrafçı, düğün, davetli, fotoğraf, thumbnail, etiket, bildirim, yüz, kişi, yüz gömme vektörü, sağdıç, analitik olay, engellenen IP, paket, kota, KVKK onayı |
| **Fiiller (Eylemler / API)** | kayıt ol, giriş yap, oluştur, yükle, sil, indir, etiketle, ara, bildir, senkronize et, tespit et, eşleştir, gizle, onayla |
| **Sıfatlar (Durum alanları)** | onaylı/flagged/pending, silinmiş, senkronize edilmiş, aktif/pasif, kişiselleştirilmiş, referanslı |

---

## SQLite Schema (LiteDB / go-sqlite3)

```sql
-- ─── Fotoğrafçılar ───────────────────────────────────────
CREATE TABLE photographers (
    id          TEXT PRIMARY KEY,          -- uuid
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active   INTEGER DEFAULT 1
);

-- ─── Düğünler ────────────────────────────────────────────
CREATE TABLE weddings (
    id            TEXT PRIMARY KEY,        -- uuid
    photographer_id TEXT NOT NULL REFERENCES photographers(id),
    code          TEXT NOT NULL UNIQUE,    -- "ayse-mehmet-2026-ab3f"
    name          TEXT NOT NULL,           -- "Ayşe & Mehmet"
    date          TEXT,                    -- "2026-11-15"
    owner_passcode TEXT,                   -- kısa şifre (gelin/damat için)
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active     INTEGER DEFAULT 1,
    photo_limit   INTEGER DEFAULT 5000,
    FOREIGN KEY (photographer_id) REFERENCES photographers(id)
);

-- ─── Sağdıçlar (yönetici davetliler) ─────────────────────
CREATE TABLE wedding_managers (
    id          TEXT PRIMARY KEY,
    wedding_id  TEXT NOT NULL REFERENCES weddings(id),
    phone       TEXT,
    role        TEXT DEFAULT 'sagdic',    -- 'sagdic' | 'owner'
    invited_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    joined_at   DATETIME
);

-- ─── Davetliler ──────────────────────────────────────────
CREATE TABLE guests (
    id          TEXT PRIMARY KEY,          -- uuid
    wedding_id  TEXT NOT NULL REFERENCES weddings(id),
    name        TEXT,                      -- "Ahmet Yılmaz" (nullable → misafir)
    phone       TEXT,                      -- isteğe bağlı (bildirim için)
    ref         TEXT,                      -- hangi referanstan geldi
    joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    consent_given INTEGER DEFAULT 0,       -- KVKK onayı
    FOREIGN KEY (wedding_id) REFERENCES weddings(id)
);

-- ─── Fotoğraflar ─────────────────────────────────────────
CREATE TABLE photos (
    id            TEXT PRIMARY KEY,        -- uuid
    wedding_id    TEXT NOT NULL REFERENCES weddings(id),
    guest_id      TEXT REFERENCES guests(id),  -- nullable (fotoğrafçı yükledi ise)
    filename      TEXT NOT NULL,
    full_path     TEXT NOT NULL,           -- SSD yolu: uploads/{wedding_id}/{uuid}.jpg
    thumb_path    TEXT NOT NULL,           -- thumbnails/{wedding_id}/{uuid}_480.jpg
    cloud_url     TEXT,                    -- S3/cloud URL (sync sonrası)
    mime_type     TEXT DEFAULT 'image/jpeg',
    file_size     INTEGER,                 -- bytes
    width         INTEGER,
    height        INTEGER,
    status        TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'flagged'
    is_deleted    INTEGER DEFAULT 0,       -- soft-delete
    uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_at     DATETIME,
    deleted_at    DATETIME,
    FOREIGN KEY (wedding_id) REFERENCES weddings(id),
    FOREIGN KEY (guest_id) REFERENCES guests(id)
);

-- ─── Etiketler ───────────────────────────────────────────
CREATE TABLE photo_tags (
    id          TEXT PRIMARY KEY,
    photo_id    TEXT NOT NULL REFERENCES photos(id),
    tag         TEXT NOT NULL,             -- "çocuklar", "aile", "dans"
    added_by    TEXT,                      -- guest_id veya photographer_id
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES photos(id)
);

-- ─── Yüz Gömme Vektörleri (Face Embeddings) ─────────────
CREATE TABLE face_embeddings (
    id          TEXT PRIMARY KEY,
    photo_id    TEXT NOT NULL REFERENCES photos(id),
    person_id   TEXT REFERENCES persons(id),   -- eşleştirilmişse
    embedding   BLOB NOT NULL,             -- float32[] binary
    bbox_x      REAL,                      -- bounding box
    bbox_y      REAL,
    bbox_w      REAL,
    bbox_h      REAL,
    confidence  REAL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (photo_id) REFERENCES photos(id)
);

-- ─── Kişiler (yüz tanıma eşleşme tablosu) ────────────────
CREATE TABLE persons (
    id          TEXT PRIMARY KEY,
    wedding_id  TEXT NOT NULL REFERENCES weddings(id),
    guest_id    TEXT REFERENCES guests(id),  -- bağlıysa
    display_name TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wedding_id) REFERENCES weddings(id)
);

-- ─── Bildirimler ──────────────────────────────────────────
CREATE TABLE notifications (
    id          TEXT PRIMARY KEY,
    guest_id    TEXT NOT NULL REFERENCES guests(id),
    type        TEXT NOT NULL,             -- 'photos_ready' | 'welcome' | 'reminder'
    channel     TEXT DEFAULT 'sms',        -- 'sms' | 'push' | 'in_app'
    payload     TEXT,                      -- JSON: { "photo_ids": [...] }
    sent_at     DATETIME,
    read_at     DATETIME,
    status      TEXT DEFAULT 'queued',     -- 'queued' | 'sent' | 'failed'
    FOREIGN KEY (guest_id) REFERENCES guests(id)
);

-- ─── Analitik Olaylar ─────────────────────────────────────
CREATE TABLE analytics_events (
    id          TEXT PRIMARY KEY,
    wedding_id  TEXT REFERENCES weddings(id),
    event_type  TEXT NOT NULL,             -- 'link_visit' | 'photo_upload' | 'download'
    guest_id    TEXT REFERENCES guests(id),
    ref         TEXT,                      -- referans kodu
    ip_hash     TEXT,                      -- SHA256(ip) — KVKK uyumu
    user_agent  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Engellenen IP'ler ────────────────────────────────────
CREATE TABLE blocked_ips (
    ip_hash     TEXT PRIMARY KEY,
    reason      TEXT,
    blocked_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME
);

-- ─── Paket / Kota ─────────────────────────────────────────
CREATE TABLE packages (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,         -- 'starter' | 'pro' | 'enterprise'
    max_weddings    INTEGER,
    max_photos      INTEGER,
    storage_gb      REAL,
    price_try       REAL,
    is_active       INTEGER DEFAULT 1
);

CREATE TABLE photographer_subscriptions (
    id              TEXT PRIMARY KEY,
    photographer_id TEXT NOT NULL REFERENCES photographers(id),
    package_id      TEXT NOT NULL REFERENCES packages(id),
    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME,
    is_active       INTEGER DEFAULT 1
);

-- ─── KVKK Onayları ────────────────────────────────────────
CREATE TABLE consent_records (
    id          TEXT PRIMARY KEY,
    guest_id    TEXT NOT NULL REFERENCES guests(id),
    version     TEXT NOT NULL,             -- "1.0", "1.1"
    given_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_hash     TEXT
);

-- ─── İndeksler ────────────────────────────────────────────
CREATE INDEX idx_photos_wedding    ON photos(wedding_id, is_deleted, status);
CREATE INDEX idx_photos_guest      ON photos(guest_id);
CREATE INDEX idx_guests_wedding    ON guests(wedding_id);
CREATE INDEX idx_tags_photo        ON photo_tags(photo_id);
CREATE INDEX idx_tags_tag          ON photo_tags(tag);
CREATE INDEX idx_faces_photo       ON face_embeddings(photo_id);
CREATE INDEX idx_faces_person      ON face_embeddings(person_id);
CREATE INDEX idx_analytics_wedding ON analytics_events(wedding_id, created_at);
CREATE INDEX idx_notif_guest       ON notifications(guest_id, status);
```

---

## Entity İlişki Özeti

```
photographers ──< weddings ──< guests ──< photos
                     │                     │
                     │                 photo_tags
                     │                     │
                  wedding_managers    face_embeddings ──> persons
                                           
guests ──< notifications
guests ──< analytics_events
guests ──< consent_records
photographers ──< photographer_subscriptions ──> packages
```

---

## Önemli Kararlar

| Konu | Karar | Gerekçe |
|------|-------|---------|
| **DB** | SQLite (`modernc.org/sqlite`) | Kurulum gerektirmez, tek dosya, Go ile uyumlu |
| **ID türü** | UUID string | Dağıtık eklemede çakışma riski yok |
| **Soft-delete** | `is_deleted + deleted_at` | KVKK silme talebi + geri alma penceresi |
| **Embedding** | BLOB olarak sakla | Phase 2'de pgvector'a taşınabilir |
| **IP** | SHA256 hash | KVKK — ham IP saklanmaz |
| **Şifre** | bcrypt hash | Düz metin saklanmaz |
