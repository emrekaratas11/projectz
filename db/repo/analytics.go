package repo

import (
	"database/sql"
	"fmt"
)

// SQLiteAnalyticsRepo implements AnalyticsRepository.
// Fire-and-forget writes; optimized for high-frequency inserts.
type SQLiteAnalyticsRepo struct {
	db         *sql.DB
	stmtInsert *sql.Stmt
}

func NewAnalyticsRepo(db *sql.DB) (*SQLiteAnalyticsRepo, error) {
	r := &SQLiteAnalyticsRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO analytics_events
		       (id, wedding_id, event_type, guest_id, ref, ip_hash, user_agent)
		VALUES (?,  ?,          ?,          ?,        ?,   ?,       ?)`)
	if err != nil {
		return nil, fmt.Errorf("analytics prepare insert: %w", err)
	}

	return r, nil
}

func (r *SQLiteAnalyticsRepo) Close() {
	r.stmtInsert.Close()
}

func (r *SQLiteAnalyticsRepo) Track(e *AnalyticsEvent) error {
	_, err := r.stmtInsert.Exec(
		e.ID,
		nullableStr(e.WeddingID),
		e.EventType,
		nullableStr(e.GuestID),
		nullableStr(e.Ref),
		nullableStr(e.IPHash),
		nullableStr(e.UserAgent),
	)
	if err != nil {
		return fmt.Errorf("track event: %w", err)
	}
	return nil
}
