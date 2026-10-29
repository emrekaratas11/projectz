package repo

import (
	"database/sql"
	"fmt"
	"strings"
)

// SQLiteShareLinkRepo implements ShareLinkRepository.
// Tracks who shared a link or QR code, to whom, when, and every open/join event.
type SQLiteShareLinkRepo struct {
	db             *sql.DB
	stmtInsert     *sql.Stmt
	stmtByID       *sql.Stmt
	stmtByWedding  *sql.Stmt
	stmtRecordOpen *sql.Stmt
	stmtRecordJoin *sql.Stmt
	stmtRevoke     *sql.Stmt
}

func NewShareLinkRepo(db *sql.DB) (*SQLiteShareLinkRepo, error) {
	r := &SQLiteShareLinkRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO share_links
		       (id, wedding_id, wedding_code, share_type, channel, shared_by_name, shared_by_role, shared_to_name)
		VALUES (?,  ?,          ?,            ?,          ?,       ?,              ?,              ?)`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare insert: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT id, wedding_id, wedding_code, COALESCE(share_type,'link'), COALESCE(channel,'direkt'),
		       COALESCE(shared_by_name,''), COALESCE(shared_by_role,'owner'), COALESCE(shared_to_name,''),
		       COALESCE(shared_at,''), COALESCE(open_count,0), COALESCE(join_count,0),
		       COALESCE(last_opened_at,''), COALESCE(last_opened_by,''), COALESCE(is_revoked,0)
		FROM   share_links
		WHERE  id = ?`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare byID: %w", err)
	}

	r.stmtByWedding, err = db.Prepare(`
		SELECT id, wedding_id, wedding_code, COALESCE(share_type,'link'), COALESCE(channel,'direkt'),
		       COALESCE(shared_by_name,''), COALESCE(shared_by_role,'owner'), COALESCE(shared_to_name,''),
		       COALESCE(shared_at,''), COALESCE(open_count,0), COALESCE(join_count,0),
		       COALESCE(last_opened_at,''), COALESCE(last_opened_by,''), COALESCE(is_revoked,0)
		FROM   share_links
		WHERE  wedding_id = ?
		ORDER  BY shared_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare byWedding: %w", err)
	}

	r.stmtRecordOpen, err = db.Prepare(`
		UPDATE share_links
		SET    open_count     = open_count + 1,
		       last_opened_at = CURRENT_TIMESTAMP,
		       last_opened_by = CASE WHEN ? != '' THEN ? ELSE last_opened_by END
		WHERE  id = ? AND is_revoked = 0`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare recordOpen: %w", err)
	}

	r.stmtRecordJoin, err = db.Prepare(`
		UPDATE share_links
		SET    join_count     = join_count + 1,
		       last_opened_at = CURRENT_TIMESTAMP,
		       last_opened_by = ?
		WHERE  id = ? AND is_revoked = 0`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare recordJoin: %w", err)
	}

	r.stmtRevoke, err = db.Prepare(`
		UPDATE share_links
		SET    is_revoked = 1
		WHERE  id = ?`)
	if err != nil {
		return nil, fmt.Errorf("share_links prepare revoke: %w", err)
	}

	return r, nil
}

func (r *SQLiteShareLinkRepo) Close() {
	r.stmtInsert.Close()
	r.stmtByID.Close()
	r.stmtByWedding.Close()
	r.stmtRecordOpen.Close()
	r.stmtRecordJoin.Close()
	r.stmtRevoke.Close()
}

func (r *SQLiteShareLinkRepo) Create(s *ShareLink) error {
	shareType := strings.TrimSpace(s.ShareType)
	if shareType == "" {
		shareType = "link"
	}
	channel := strings.TrimSpace(s.Channel)
	if channel == "" {
		channel = "direkt"
	}
	role := strings.TrimSpace(s.SharedByRole)
	if role == "" {
		role = "owner"
	}
	_, err := r.stmtInsert.Exec(
		s.ID, s.WeddingID, s.WeddingCode,
		shareType, channel,
		strings.TrimSpace(s.SharedByName),
		role,
		strings.TrimSpace(s.SharedToName),
	)
	if err != nil {
		return fmt.Errorf("create share_link: %w", err)
	}
	return nil
}

func (r *SQLiteShareLinkRepo) GetByID(id string) (*ShareLink, error) {
	return scanShareLink(r.stmtByID.QueryRow(id))
}

func (r *SQLiteShareLinkRepo) ListByWedding(weddingID string) ([]ShareLink, error) {
	rows, err := r.stmtByWedding.Query(weddingID)
	if err != nil {
		return nil, fmt.Errorf("list share_links: %w", err)
	}
	defer rows.Close()

	var list []ShareLink
	for rows.Next() {
		s, err := scanShareLinkRow(rows)
		if err != nil {
			continue
		}
		list = append(list, *s)
	}
	return list, rows.Err()
}

func (r *SQLiteShareLinkRepo) RecordOpen(id, openedBy string) error {
	name := strings.TrimSpace(openedBy)
	_, err := r.stmtRecordOpen.Exec(name, name, id)
	return err
}

func (r *SQLiteShareLinkRepo) RecordJoin(id, joinedBy string) error {
	_, err := r.stmtRecordJoin.Exec(strings.TrimSpace(joinedBy), id)
	return err
}

func (r *SQLiteShareLinkRepo) Revoke(id string) error {
	_, err := r.stmtRevoke.Exec(id)
	return err
}

func scanShareLink(row *sql.Row) (*ShareLink, error) {
	s := &ShareLink{}
	var revoked int
	err := row.Scan(
		&s.ID, &s.WeddingID, &s.WeddingCode, &s.ShareType, &s.Channel,
		&s.SharedByName, &s.SharedByRole, &s.SharedToName,
		&s.SharedAt, &s.OpenCount, &s.JoinCount,
		&s.LastOpenedAt, &s.LastOpenedBy, &revoked,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan share_link: %w", err)
	}
	s.IsRevoked = revoked == 1
	return s, nil
}

func scanShareLinkRow(rows *sql.Rows) (*ShareLink, error) {
	s := &ShareLink{}
	var revoked int
	err := rows.Scan(
		&s.ID, &s.WeddingID, &s.WeddingCode, &s.ShareType, &s.Channel,
		&s.SharedByName, &s.SharedByRole, &s.SharedToName,
		&s.SharedAt, &s.OpenCount, &s.JoinCount,
		&s.LastOpenedAt, &s.LastOpenedBy, &revoked,
	)
	if err != nil {
		return nil, err
	}
	s.IsRevoked = revoked == 1
	return s, nil
}

