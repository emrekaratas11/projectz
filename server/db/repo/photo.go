package repo

import (
	"database/sql"
	"fmt"
	"strings"
)

// SQLitePhotoRepo implements PhotoRepository.
type SQLitePhotoRepo struct {
	db               *sql.DB
	stmtInsert       *sql.Stmt
	stmtByID         *sql.Stmt
	stmtByWedding    *sql.Stmt // all approved, non-deleted
	stmtByGuest      *sql.Stmt // guest's own uploads
	stmtListArchived *sql.Stmt // soft-deleted photos
	stmtSearch       *sql.Stmt // UC-8 / UC-10 tag or guest name search
	stmtInsertTag    *sql.Stmt // UC-8 add tag
	stmtListTags     *sql.Stmt // UC-8 list tags for photo
	stmtSoftDelete   *sql.Stmt // marks is_deleted=1 + deleted_at
	stmtRestore      *sql.Stmt // marks is_deleted=0 + clears deleted_at
}

func NewPhotoRepo(db *sql.DB) (*SQLitePhotoRepo, error) {
	r := &SQLitePhotoRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO photos
		       (id, wedding_id, guest_id, filename, full_path, thumb_path,
		        mime_type, file_size, status)
		VALUES (?,  ?,          ?,        ?,         ?,         ?,
		        ?,         ?,         ?)`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare insert: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT id, wedding_id, COALESCE(guest_id,''), filename,
		       full_path, thumb_path, COALESCE(mime_type,'image/jpeg'), COALESCE(file_size,0), COALESCE(status,'approved'),
		       is_deleted, COALESCE(deleted_by,''), COALESCE(uploaded_at,'')
		FROM   photos
		WHERE  id = ?`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare byID: %w", err)
	}

	// Galeri listesi: sadece approved + silinmemiş; thumbnail yeterli
	r.stmtByWedding, err = db.Prepare(`
		SELECT id, wedding_id, COALESCE(guest_id,''), filename,
		       full_path, thumb_path, COALESCE(mime_type,'image/jpeg'), COALESCE(file_size,0), COALESCE(status,'approved'),
		       is_deleted, COALESCE(deleted_by,''), COALESCE(uploaded_at,'')
		FROM   photos
		WHERE  wedding_id = ?
		  AND  is_deleted = 0
		  AND  status     = 'approved'
		ORDER  BY uploaded_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare byWedding: %w", err)
	}

	// Davetlinin kendi yüklemeleri (status fark etmez — kendisi görebilir)
	r.stmtByGuest, err = db.Prepare(`
		SELECT id, wedding_id, COALESCE(guest_id,''), filename,
		       full_path, thumb_path, COALESCE(mime_type,'image/jpeg'), COALESCE(file_size,0), COALESCE(status,'approved'),
		       is_deleted, COALESCE(deleted_by,''), COALESCE(uploaded_at,'')
		FROM   photos
		WHERE  wedding_id = ?
		  AND  guest_id   = ?
		  AND  is_deleted = 0
		ORDER  BY uploaded_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare byGuest: %w", err)
	}

	// Soft-delete: ownership check via JOIN ensures photographer owns the wedding
	r.stmtSoftDelete, err = db.Prepare(`
		UPDATE photos
		SET    is_deleted = 1,
		       deleted_at = CURRENT_TIMESTAMP
		WHERE  id = ?
		  AND  wedding_id IN (
		           SELECT id FROM weddings WHERE photographer_id = ?
		       )
		  AND  is_deleted = 0`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare softDelete: %w", err)
	}

	// Restore soft-deleted photo
	r.stmtRestore, err = db.Prepare(`
		UPDATE photos
		SET    is_deleted = 0,
		       deleted_at = NULL
		WHERE  id = ?
		  AND  wedding_id IN (
		           SELECT id FROM weddings WHERE photographer_id = ?
		       )
		  AND  is_deleted = 1`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare restore: %w", err)
	}

	// List soft-deleted photos for archive view
	r.stmtListArchived, err = db.Prepare(`
		SELECT id, wedding_id, COALESCE(guest_id,''), filename,
		       full_path, thumb_path, COALESCE(mime_type,'image/jpeg'), COALESCE(file_size,0), COALESCE(status,'approved'),
		       is_deleted, COALESCE(deleted_by,''), COALESCE(uploaded_at,'')
		FROM   photos
		WHERE  wedding_id = ?
		  AND  is_deleted = 1
		ORDER  BY uploaded_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare listArchived: %w", err)
	}

	// Search by tag, filename, or guest name (UC-8, UC-10)
	r.stmtSearch, err = db.Prepare(`
		SELECT DISTINCT p.id, p.wedding_id, COALESCE(p.guest_id,''), p.filename,
		       p.full_path, p.thumb_path, COALESCE(p.mime_type,'image/jpeg'), COALESCE(p.file_size,0), COALESCE(p.status,'approved'),
		       p.is_deleted, COALESCE(p.deleted_by,''), COALESCE(p.uploaded_at,'')
		FROM   photos p
		LEFT JOIN photo_tags pt ON pt.photo_id = p.id
		LEFT JOIN guests g ON g.id = p.guest_id
		WHERE  p.wedding_id = ?
		  AND  p.is_deleted = 0
		  AND  p.status     = 'approved'
		  AND  (
		       LOWER(pt.tag) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(p.filename) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(COALESCE(g.name, '')) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER  BY p.uploaded_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare search: %w", err)
	}

	r.stmtInsertTag, err = db.Prepare(`
		INSERT INTO photo_tags (id, photo_id, tag, added_by)
		VALUES (?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare insertTag: %w", err)
	}

	r.stmtListTags, err = db.Prepare(`
		SELECT tag FROM photo_tags WHERE photo_id = ? ORDER BY added_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("photos prepare listTags: %w", err)
	}

	return r, nil
}

func (r *SQLitePhotoRepo) Close() {
	r.stmtInsert.Close()
	r.stmtByID.Close()
	r.stmtByWedding.Close()
	r.stmtByGuest.Close()
	r.stmtListArchived.Close()
	r.stmtSearch.Close()
	r.stmtInsertTag.Close()
	r.stmtListTags.Close()
	r.stmtSoftDelete.Close()
	r.stmtRestore.Close()
}

func (r *SQLitePhotoRepo) Create(p *Photo) error {
	status := p.Status
	if status == "" {
		status = "approved"
	}
	_, err := r.stmtInsert.Exec(
		p.ID, p.WeddingID, nullableStr(p.GuestID), p.Filename,
		p.FullPath, p.ThumbPath, p.MimeType, p.FileSize, status,
	)
	if err != nil {
		return fmt.Errorf("create photo: %w", err)
	}
	return nil
}

func (r *SQLitePhotoRepo) GetByID(id string) (*Photo, error) {
	row := r.stmtByID.QueryRow(id)
	p, err := scanPhoto(row)
	if err != nil || p == nil {
		return p, err
	}
	p.Tags, _ = r.ListTags(p.ID)
	return p, nil
}

func (r *SQLitePhotoRepo) ListByWedding(weddingID string) ([]Photo, error) {
	rows, err := r.stmtByWedding.Query(weddingID)
	if err != nil {
		return nil, fmt.Errorf("list photos by wedding: %w", err)
	}
	defer rows.Close()
	photos, err := scanPhotos(rows)
	for i := range photos {
		photos[i].Tags, _ = r.ListTags(photos[i].ID)
	}
	return photos, err
}

func (r *SQLitePhotoRepo) ListByGuest(weddingID, guestID string) ([]Photo, error) {
	rows, err := r.stmtByGuest.Query(weddingID, guestID)
	if err != nil {
		return nil, fmt.Errorf("list photos by guest: %w", err)
	}
	defer rows.Close()
	photos, err := scanPhotos(rows)
	for i := range photos {
		photos[i].Tags, _ = r.ListTags(photos[i].ID)
	}
	return photos, err
}

func (r *SQLitePhotoRepo) SoftDelete(id, photographerID string) error {
	res, err := r.stmtSoftDelete.Exec(id, photographerID)
	if err != nil {
		return fmt.Errorf("soft delete photo: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("not_found_or_unauthorized")
	}
	return nil
}

func (r *SQLitePhotoRepo) Restore(id, photographerID string) error {
	res, err := r.stmtRestore.Exec(id, photographerID)
	if err != nil {
		return fmt.Errorf("restore photo: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("not_found_or_unauthorized")
	}
	return nil
}

func (r *SQLitePhotoRepo) ListArchivedByWedding(weddingID string) ([]Photo, error) {
	rows, err := r.stmtListArchived.Query(weddingID)
	if err != nil {
		return nil, fmt.Errorf("list archived photos: %w", err)
	}
	defer rows.Close()
	return scanPhotos(rows)
}

func (r *SQLitePhotoRepo) SearchByTagOrQuery(weddingID, query string) ([]Photo, error) {
	q := strings.TrimPrefix(strings.TrimSpace(query), "#")
	rows, err := r.stmtSearch.Query(weddingID, q, q, q)
	if err != nil {
		return nil, fmt.Errorf("search photos: %w", err)
	}
	defer rows.Close()
	photos, err := scanPhotos(rows)
	for i := range photos {
		photos[i].Tags, _ = r.ListTags(photos[i].ID)
	}
	return photos, err
}

func (r *SQLitePhotoRepo) AddTag(photoID, tag, addedBy string) error {
	clean := strings.TrimPrefix(strings.TrimSpace(tag), "#")
	if clean == "" {
		return nil
	}
	id := fmt.Sprintf("pt-%s-%s", photoID, clean)
	_, err := r.stmtInsertTag.Exec(id, photoID, clean, nullableStr(addedBy))
	return err
}

func (r *SQLitePhotoRepo) ListTags(photoID string) ([]string, error) {
	rows, err := r.stmtListTags.Query(photoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err == nil {
			tags = append(tags, t)
		}
	}
	return tags, nil
}

// ─── Scan helpers ─────────────────────────────────────────────

func scanPhoto(row *sql.Row) (*Photo, error) {
	p := &Photo{}
	var isDeleted int
	err := row.Scan(
		&p.ID, &p.WeddingID, &p.GuestID, &p.Filename,
		&p.FullPath, &p.ThumbPath, &p.MimeType, &p.FileSize, &p.Status,
		&isDeleted, &p.DeletedBy, &p.UploadedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan photo: %w", err)
	}
	p.IsDeleted = isDeleted == 1
	p.ThumbURL = "/static/" + p.ThumbPath
	p.FullURL = "/static/" + p.FullPath
	return p, nil
}

func scanPhotos(rows *sql.Rows) ([]Photo, error) {
	var photos []Photo
	for rows.Next() {
		p := &Photo{}
		var isDeleted int
		if err := rows.Scan(
			&p.ID, &p.WeddingID, &p.GuestID, &p.Filename,
			&p.FullPath, &p.ThumbPath, &p.MimeType, &p.FileSize, &p.Status,
			&isDeleted, &p.DeletedBy, &p.UploadedAt,
		); err != nil {
			continue
		}
		p.IsDeleted = isDeleted == 1
		p.ThumbURL = "/static/" + p.ThumbPath
		p.FullURL = "/static/" + p.FullPath
		photos = append(photos, *p)
	}
	return photos, rows.Err()
}
