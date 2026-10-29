package db

import (
	"database/sql"
	"fmt"
	"strings"
)

// Migrate runs all DDL statements in order.
// Safe to call multiple times (IF NOT EXISTS).
func Migrate(db *sql.DB) error {
	statements := []string{
		// ─── Fotoğrafçılar ───────────────────────────────────
		`CREATE TABLE IF NOT EXISTS photographers (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			email         TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
			is_active     INTEGER DEFAULT 1
		)`,

		// Varsayılan sistem yöneticisi (fotoğrafçı hesabı olmadan kurulan düğünler için FK uyumluluğu)
		`INSERT OR IGNORE INTO photographers (id, name, email, password_hash, is_active)
		 VALUES ('default-photographer', 'Sistem Yönetici', 'admin@fotoyonetim.local', 'system', 1)`,

		// ─── Düğünler ─────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS weddings (
			id                TEXT PRIMARY KEY,
			photographer_id   TEXT NOT NULL DEFAULT 'default-photographer' REFERENCES photographers(id),
			code              TEXT NOT NULL UNIQUE,
			name              TEXT NOT NULL,
			date              TEXT DEFAULT '',
			owner_name        TEXT DEFAULT '',
			owner_role        TEXT DEFAULT 'owner',
			owner_passcode    TEXT DEFAULT '1234',
			guest_passcode    TEXT DEFAULT '1234',
			created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
			is_active         INTEGER DEFAULT 1,
			photo_limit       INTEGER DEFAULT 5000
		)`,

		// ─── Davetliler ───────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS guests (
			id             TEXT PRIMARY KEY,
			wedding_id     TEXT NOT NULL REFERENCES weddings(id),
			name           TEXT DEFAULT '',
			phone          TEXT DEFAULT '',
			ref            TEXT DEFAULT '',
			shared_by      TEXT DEFAULT '',
			share_token_id TEXT DEFAULT '',
			joined_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
			consent_given  INTEGER DEFAULT 0
		)`,

		// ─── Düğün Görev, Rol & Sorumluluk Tablosu (RBAC / Wedding Members) ───
		// Düğündeki her bireyin (Gelin, Damat, Sağdıç, Fotoğrafçı, Moderatör Üye veya Davetli)
		// kişisel adını (ör. "Emre" veya "Ayşe" ayrı ayrı), görevini ve granüler yetkilerini tutar.
		`CREATE TABLE IF NOT EXISTS wedding_members (
			id                  TEXT PRIMARY KEY,
			wedding_id          TEXT NOT NULL REFERENCES weddings(id),
			wedding_code        TEXT NOT NULL,
			person_name         TEXT NOT NULL,
			nick                TEXT NOT NULL DEFAULT '',
			phone               TEXT DEFAULT '',
			role                TEXT NOT NULL DEFAULT 'guest',
			role_title          TEXT NOT NULL DEFAULT 'Davetli Üye',
			passcode_hash       TEXT DEFAULT '',
			can_manage_settings INTEGER NOT NULL DEFAULT 0,
			can_assign_roles    INTEGER NOT NULL DEFAULT 0,
			can_moderate_photos INTEGER NOT NULL DEFAULT 0,
			can_share_links     INTEGER NOT NULL DEFAULT 0,
			can_print_export    INTEGER NOT NULL DEFAULT 0,
			can_upload          INTEGER NOT NULL DEFAULT 1,
			assigned_by         TEXT DEFAULT '',
			created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
			is_active           INTEGER NOT NULL DEFAULT 1
		)`,

		// ─── Bağlantı & QR Paylaşım Defteri (Link & QR Share Ledger) ───
		// Kim, kime, hangi kanaldan, ne zaman verdi ve kimin tarafından ne zaman açıldı?
		`CREATE TABLE IF NOT EXISTS share_links (
			id             TEXT PRIMARY KEY,
			wedding_id     TEXT NOT NULL REFERENCES weddings(id),
			wedding_code   TEXT NOT NULL,
			share_type     TEXT NOT NULL DEFAULT 'link',
			channel        TEXT NOT NULL DEFAULT 'direkt',
			shared_by_name TEXT NOT NULL DEFAULT '',
			shared_by_role TEXT NOT NULL DEFAULT 'owner',
			shared_to_name TEXT DEFAULT '',
			shared_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
			open_count     INTEGER DEFAULT 0,
			join_count     INTEGER DEFAULT 0,
			last_opened_at DATETIME,
			last_opened_by TEXT DEFAULT '',
			is_revoked     INTEGER DEFAULT 0
		)`,

		// ─── Fotoğraflar ──────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS photos (
			id          TEXT PRIMARY KEY,
			wedding_id  TEXT NOT NULL REFERENCES weddings(id),
			guest_id    TEXT REFERENCES guests(id),
			filename    TEXT NOT NULL,
			full_path   TEXT NOT NULL,
			thumb_path  TEXT NOT NULL,
			cloud_url   TEXT,
			mime_type   TEXT DEFAULT 'image/jpeg',
			file_size   INTEGER,
			width       INTEGER,
			height      INTEGER,
			status      TEXT DEFAULT 'pending',
			is_deleted  INTEGER DEFAULT 0,
			deleted_by  TEXT DEFAULT '',
			uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			synced_at   DATETIME,
			deleted_at  DATETIME
		)`,

		// ─── Etiketler ────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS photo_tags (
			id       TEXT PRIMARY KEY,
			photo_id TEXT NOT NULL REFERENCES photos(id),
			tag      TEXT NOT NULL,
			added_by TEXT,
			added_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// ─── Kişiler ──────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS persons (
			id           TEXT PRIMARY KEY,
			wedding_id   TEXT NOT NULL REFERENCES weddings(id),
			guest_id     TEXT REFERENCES guests(id),
			display_name TEXT,
			created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// ─── Yüz Gömme Vektörleri ─────────────────────────────
		`CREATE TABLE IF NOT EXISTS face_embeddings (
			id          TEXT PRIMARY KEY,
			photo_id    TEXT NOT NULL REFERENCES photos(id),
			person_id   TEXT REFERENCES persons(id),
			embedding   BLOB NOT NULL,
			bbox_x      REAL,
			bbox_y      REAL,
			bbox_w      REAL,
			bbox_h      REAL,
			confidence  REAL,
			detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// ─── Bildirimler ──────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS notifications (
			id       TEXT PRIMARY KEY,
			guest_id TEXT NOT NULL REFERENCES guests(id),
			type     TEXT NOT NULL,
			channel  TEXT DEFAULT 'sms',
			payload  TEXT,
			sent_at  DATETIME,
			read_at  DATETIME,
			status   TEXT DEFAULT 'queued'
		)`,

		// ─── Analitik ─────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS analytics_events (
			id         TEXT PRIMARY KEY,
			wedding_id TEXT REFERENCES weddings(id),
			event_type TEXT NOT NULL,
			guest_id   TEXT REFERENCES guests(id),
			ref        TEXT,
			ip_hash    TEXT,
			user_agent TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// ─── Engellenen IP'ler ────────────────────────────────
		`CREATE TABLE IF NOT EXISTS blocked_ips (
			ip_hash    TEXT PRIMARY KEY,
			reason     TEXT,
			blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME
		)`,

		// ─── Paketler ─────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS packages (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL,
			max_weddings INTEGER,
			max_photos   INTEGER,
			storage_gb   REAL,
			price_try    REAL,
			is_active    INTEGER DEFAULT 1
		)`,

		// ─── Abonelikler ──────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS photographer_subscriptions (
			id              TEXT PRIMARY KEY,
			photographer_id TEXT NOT NULL REFERENCES photographers(id),
			package_id      TEXT NOT NULL REFERENCES packages(id),
			started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
			expires_at      DATETIME,
			is_active       INTEGER DEFAULT 1
		)`,

		// ─── KVKK Onayları ────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS consent_records (
			id       TEXT PRIMARY KEY,
			guest_id TEXT NOT NULL REFERENCES guests(id),
			version  TEXT NOT NULL,
			given_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			ip_hash  TEXT
		)`,

		// ─── İndeksler ────────────────────────────────────────
		`CREATE INDEX IF NOT EXISTS idx_photos_wedding     ON photos(wedding_id, is_deleted, status)`,
		`CREATE INDEX IF NOT EXISTS idx_photos_guest       ON photos(guest_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guests_wedding     ON guests(wedding_id)`,
		`CREATE INDEX IF NOT EXISTS idx_share_links_wedding ON share_links(wedding_id, shared_at)`,
		`CREATE INDEX IF NOT EXISTS idx_photos_wedding       ON photos(wedding_id, is_deleted, status)`,
		`CREATE INDEX IF NOT EXISTS idx_photos_guest         ON photos(guest_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guests_wedding       ON guests(wedding_id)`,
		`CREATE INDEX IF NOT EXISTS idx_members_wedding      ON wedding_members(wedding_id, role, is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_members_wedding_code ON wedding_members(wedding_code, is_active)`,
		`CREATE INDEX IF NOT EXISTS idx_share_links_wedding  ON share_links(wedding_id, shared_at)`,
		`CREATE INDEX IF NOT EXISTS idx_tags_photo         ON photo_tags(photo_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tags_tag           ON photo_tags(tag)`,
		`CREATE INDEX IF NOT EXISTS idx_faces_photo        ON face_embeddings(photo_id)`,
		`CREATE INDEX IF NOT EXISTS idx_analytics_wedding  ON analytics_events(wedding_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_notif_guest        ON notifications(guest_id, status)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate: %w\nSQL: %s", err, stmt)
		}
	}

	// Safe column migrations for existing databases
	alterStatements := []string{
		`ALTER TABLE weddings ADD COLUMN owner_name TEXT DEFAULT ''`,
		`ALTER TABLE weddings ADD COLUMN owner_role TEXT DEFAULT 'owner'`,
		`ALTER TABLE weddings ADD COLUMN owner_passcode TEXT DEFAULT '1234'`,
		`ALTER TABLE weddings ADD COLUMN guest_passcode TEXT DEFAULT '1234'`,
		`ALTER TABLE guests ADD COLUMN shared_by TEXT DEFAULT ''`,
		`ALTER TABLE guests ADD COLUMN share_token_id TEXT DEFAULT ''`,
		`ALTER TABLE photos ADD COLUMN deleted_by TEXT DEFAULT ''`,
	}
	for _, stmt := range alterStatements {
		if _, err := db.Exec(stmt); err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
				return fmt.Errorf("migrate alter: %w\nSQL: %s", err, stmt)
			}
		}
	}

	return nil
}
