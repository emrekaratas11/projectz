package repo

import (
	"database/sql"
	"fmt"
)

// SQLiteGuestRepo implements GuestRepository.
type SQLiteGuestRepo struct {
	db            *sql.DB
	stmtInsert    *sql.Stmt
	stmtByID      *sql.Stmt
	stmtByWedding *sql.Stmt
}

func NewGuestRepo(db *sql.DB) (*SQLiteGuestRepo, error) {
	r := &SQLiteGuestRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO guests (id, wedding_id, name, phone, ref, shared_by, share_token_id, consent_given)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("guests prepare insert: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT id, wedding_id, COALESCE(name,'Misafir'), COALESCE(phone,''), COALESCE(ref,''),
		       COALESCE(shared_by,''), COALESCE(share_token_id,''), consent_given, COALESCE(joined_at,'')
		FROM   guests
		WHERE  id = ?`)
	if err != nil {
		return nil, fmt.Errorf("guests prepare byID: %w", err)
	}

	// Ordered by join time; includes attribution fields (ref, shared_by, share_token_id)
	r.stmtByWedding, err = db.Prepare(`
		SELECT g.id, g.wedding_id, COALESCE(g.name,'Misafir'), COALESCE(g.phone,''), COALESCE(g.ref,''),
		       COALESCE(g.shared_by,''), COALESCE(g.share_token_id,''), g.consent_given, COALESCE(g.joined_at,'')
		FROM   guests g
		WHERE  g.wedding_id = ?
		ORDER  BY g.joined_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("guests prepare byWedding: %w", err)
	}

	return r, nil
}

func (r *SQLiteGuestRepo) Close() {
	r.stmtInsert.Close()
	r.stmtByID.Close()
	r.stmtByWedding.Close()
}

func (r *SQLiteGuestRepo) Create(g *Guest) error {
	_, err := r.stmtInsert.Exec(
		g.ID, g.WeddingID, nullableStr(g.Name),
		nullableStr(g.Phone), nullableStr(g.Ref),
		nullableStr(g.SharedBy), nullableStr(g.ShareTokenID),
		boolInt(g.ConsentGiven),
	)
	if err != nil {
		return fmt.Errorf("create guest: %w", err)
	}
	return nil
}

func (r *SQLiteGuestRepo) GetByID(id string) (*Guest, error) {
	g := &Guest{}
	var consent int
	err := r.stmtByID.QueryRow(id).Scan(
		&g.ID, &g.WeddingID, &g.Name, &g.Phone, &g.Ref,
		&g.SharedBy, &g.ShareTokenID, &consent, &g.JoinedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get guest: %w", err)
	}
	g.ConsentGiven = consent == 1
	return g, nil
}

func (r *SQLiteGuestRepo) ListByWedding(weddingID string) ([]Guest, error) {
	rows, err := r.stmtByWedding.Query(weddingID)
	if err != nil {
		return nil, fmt.Errorf("list guests: %w", err)
	}
	defer rows.Close()

	var guests []Guest
	for rows.Next() {
		g := Guest{}
		var consent int
		if err := rows.Scan(
			&g.ID, &g.WeddingID, &g.Name, &g.Phone, &g.Ref,
			&g.SharedBy, &g.ShareTokenID, &consent, &g.JoinedAt,
		); err != nil {
			continue
		}
		g.ConsentGiven = consent == 1
		guests = append(guests, g)
	}
	return guests, nil
}

// ─── Small helpers (private to repo package) ──────────────────

func nullableStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
