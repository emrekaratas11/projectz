package repo

import (
	"database/sql"
	"fmt"
	"strings"
)

// SQLiteWeddingRepo implements WeddingRepository.
type SQLiteWeddingRepo struct {
	db                  *sql.DB
	stmtInsert          *sql.Stmt
	stmtByCode          *sql.Stmt
	stmtByID            *sql.Stmt
	stmtListByPhoto     *sql.Stmt // list by photographer
	stmtDeactivate      *sql.Stmt
	stmtUpdatePasscode  *sql.Stmt
	stmtUpdatePasscodes *sql.Stmt
}

func NewWeddingRepo(db *sql.DB) (*SQLiteWeddingRepo, error) {
	r := &SQLiteWeddingRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO weddings (id, photographer_id, code, name, date, owner_name, owner_role, owner_passcode, guest_passcode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare insert: %w", err)
	}

	// Public & Manager lookup — matches exact code, slug prefix (e.g. 'ayse-mehmet' matches 'ayse-mehmet-2026-a1b2'), or wedding name
	r.stmtByCode, err = db.Prepare(`
		SELECT w.id, w.photographer_id, w.code, w.name, COALESCE(w.date, ''),
		       COALESCE(w.owner_name, ''), COALESCE(w.owner_role, 'owner'),
		       COALESCE(w.owner_passcode, '1234'), COALESCE(w.guest_passcode, '1234'),
		       w.is_active, COALESCE(w.created_at, ''),
		       (SELECT COUNT(*) FROM photos p
		        WHERE p.wedding_id = w.id AND p.is_deleted = 0 AND p.status = 'approved') AS photo_count,
		       (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id)                  AS guest_count
		FROM   weddings w
		WHERE  LOWER(w.code) = LOWER(?)
		   OR  LOWER(w.code) LIKE LOWER(?) || '-%'
		   OR  LOWER(w.name) = LOWER(?)
		ORDER  BY w.created_at DESC
		LIMIT  1`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare byCode: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT w.id, w.photographer_id, w.code, w.name, COALESCE(w.date, ''),
		       COALESCE(w.owner_name, ''), COALESCE(w.owner_role, 'owner'),
		       COALESCE(w.owner_passcode, '1234'), COALESCE(w.guest_passcode, '1234'),
		       w.is_active, COALESCE(w.created_at, ''),
		       (SELECT COUNT(*) FROM photos  p WHERE p.wedding_id = w.id AND p.is_deleted = 0) AS photo_count,
		       (SELECT COUNT(*) FROM guests  g WHERE g.wedding_id = w.id)                       AS guest_count
		FROM   weddings w
		WHERE  w.id = ?`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare byID: %w", err)
	}

	r.stmtListByPhoto, err = db.Prepare(`
		SELECT w.id, w.photographer_id, w.code, w.name, COALESCE(w.date, ''),
		       COALESCE(w.owner_name, ''), COALESCE(w.owner_role, 'owner'),
		       COALESCE(w.owner_passcode, '1234'), COALESCE(w.guest_passcode, '1234'),
		       w.is_active, COALESCE(w.created_at, ''),
		       (SELECT COUNT(*) FROM photos p WHERE p.wedding_id = w.id AND p.is_deleted = 0) AS photo_count,
		       (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id)                       AS guest_count
		FROM   weddings w
		WHERE  w.photographer_id = ?
		ORDER  BY w.created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare listByPhoto: %w", err)
	}

	r.stmtDeactivate, err = db.Prepare(`
		UPDATE weddings
		SET    is_active = 0
		WHERE  id = ? AND photographer_id = ?`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare deactivate: %w", err)
	}

	r.stmtUpdatePasscode, err = db.Prepare(`
		UPDATE weddings
		SET    owner_passcode = ?
		WHERE  id = ? OR code = ?`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare updatePasscode: %w", err)
	}

	r.stmtUpdatePasscodes, err = db.Prepare(`
		UPDATE weddings
		SET    owner_passcode = ?, guest_passcode = ?
		WHERE  id = ? OR code = ?`)
	if err != nil {
		return nil, fmt.Errorf("weddings prepare updatePasscodes: %w", err)
	}

	return r, nil
}

func (r *SQLiteWeddingRepo) Close() {
	r.stmtInsert.Close()
	r.stmtByCode.Close()
	r.stmtByID.Close()
	r.stmtListByPhoto.Close()
	r.stmtDeactivate.Close()
	r.stmtUpdatePasscode.Close()
	r.stmtUpdatePasscodes.Close()
}

func (r *SQLiteWeddingRepo) Create(w *Wedding) error {
	phID := w.PhotographerID
	if phID == "" {
		phID = "default-photographer"
	}
	ownerRole := w.OwnerRole
	if ownerRole == "" {
		ownerRole = "owner"
	}
	ownerPass := w.OwnerPasscode
	if ownerPass == "" {
		ownerPass = "1234"
	}
	guestPass := w.GuestPasscode
	if guestPass == "" {
		guestPass = ownerPass
	}
	_, err := r.stmtInsert.Exec(
		w.ID, phID, w.Code, w.Name, w.Date,
		w.OwnerName, ownerRole, ownerPass, guestPass,
	)
	if err != nil {
		return fmt.Errorf("create wedding: %w", err)
	}
	return nil
}

func (r *SQLiteWeddingRepo) GetByCode(code string) (*Wedding, error) {
	q := strings.TrimSpace(code)
	return scanWedding(r.stmtByCode.QueryRow(q, q, q))
}

func (r *SQLiteWeddingRepo) GetByID(id string) (*Wedding, error) {
	return scanWedding(r.stmtByID.QueryRow(id))
}

func (r *SQLiteWeddingRepo) ListByPhotographer(phID string) ([]Wedding, error) {
	rows, err := r.stmtListByPhoto.Query(phID)
	if err != nil {
		return nil, fmt.Errorf("list weddings: %w", err)
	}
	defer rows.Close()

	var weddings []Wedding
	for rows.Next() {
		w, err := scanWeddingRow(rows)
		if err != nil {
			continue
		}
		weddings = append(weddings, *w)
	}
	return weddings, nil
}

func (r *SQLiteWeddingRepo) Deactivate(id, photographerID string) error {
	_, err := r.stmtDeactivate.Exec(id, photographerID)
	return err
}

func (r *SQLiteWeddingRepo) UpdatePasscode(idOrCode, passcode string) error {
	_, err := r.stmtUpdatePasscode.Exec(passcode, idOrCode, idOrCode)
	return err
}

func (r *SQLiteWeddingRepo) UpdatePasscodes(idOrCode, ownerPasscode, guestPasscode string) error {
	_, err := r.stmtUpdatePasscodes.Exec(ownerPasscode, guestPasscode, idOrCode, idOrCode)
	return err
}

// ─── Scan helpers ─────────────────────────────────────────────

func scanWedding(row *sql.Row) (*Wedding, error) {
	w := &Wedding{}
	var isActive int
	err := row.Scan(
		&w.ID, &w.PhotographerID, &w.Code, &w.Name, &w.Date,
		&w.OwnerName, &w.OwnerRole, &w.OwnerPasscode, &w.GuestPasscode,
		&isActive, &w.CreatedAt,
		&w.PhotoCount, &w.GuestCount,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan wedding: %w", err)
	}
	w.IsActive = isActive == 1
	return w, nil
}

func scanWeddingRow(rows *sql.Rows) (*Wedding, error) {
	w := &Wedding{}
	var isActive int
	err := rows.Scan(
		&w.ID, &w.PhotographerID, &w.Code, &w.Name, &w.Date,
		&w.OwnerName, &w.OwnerRole, &w.OwnerPasscode, &w.GuestPasscode,
		&isActive, &w.CreatedAt,
		&w.PhotoCount, &w.GuestCount,
	)
	if err != nil {
		return nil, err
	}
	w.IsActive = isActive == 1
	return w, nil
}
