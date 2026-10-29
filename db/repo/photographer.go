package repo

import (
	"database/sql"
	"fmt"
	"strings"
)

// SQLitePhotographerRepo implements PhotographerRepository.
// All statements are compiled (Prepare) once at construction time.
type SQLitePhotographerRepo struct {
	db          *sql.DB
	stmtInsert  *sql.Stmt // INSERT INTO photographers
	stmtByID    *sql.Stmt // SELECT … WHERE id = ?
	stmtByEmail *sql.Stmt // SELECT … WHERE LOWER(email) = LOWER(?)
}

// NewPhotographerRepo prepares all SQL statements.
// Returns error if any statement fails to compile — catches SQL typos at startup.
func NewPhotographerRepo(db *sql.DB) (*SQLitePhotographerRepo, error) {
	r := &SQLitePhotographerRepo{db: db}

	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO photographers (id, name, email, password_hash)
		VALUES (?, ?, ?, ?)`)
	if err != nil {
		return nil, fmt.Errorf("photographers prepare insert: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT id, name, email, password_hash, created_at, is_active
		FROM   photographers
		WHERE  id = ? AND is_active = 1`)
	if err != nil {
		return nil, fmt.Errorf("photographers prepare byID: %w", err)
	}

	r.stmtByEmail, err = db.Prepare(`
		SELECT id, name, email, password_hash, created_at, is_active
		FROM   photographers
		WHERE  LOWER(email) = LOWER(?) AND is_active = 1`)
	if err != nil {
		return nil, fmt.Errorf("photographers prepare byEmail: %w", err)
	}

	return r, nil
}

// Close releases all compiled statements.
func (r *SQLitePhotographerRepo) Close() {
	r.stmtInsert.Close()
	r.stmtByID.Close()
	r.stmtByEmail.Close()
}

func (r *SQLitePhotographerRepo) Create(p *Photographer) error {
	_, err := r.stmtInsert.Exec(p.ID, strings.TrimSpace(p.Name), strings.ToLower(strings.TrimSpace(p.Email)), p.PasswordHash)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return fmt.Errorf("email_exists")
		}
		return fmt.Errorf("create photographer: %w", err)
	}
	return nil
}

func (r *SQLitePhotographerRepo) GetByID(id string) (*Photographer, error) {
	return scanPhotographer(r.stmtByID.QueryRow(id))
}

func (r *SQLitePhotographerRepo) GetByEmail(email string) (*Photographer, error) {
	return scanPhotographer(r.stmtByEmail.QueryRow(strings.TrimSpace(email)))
}

func scanPhotographer(row *sql.Row) (*Photographer, error) {
	p := &Photographer{}
	var isActive int
	err := row.Scan(&p.ID, &p.Name, &p.Email, &p.PasswordHash, &p.CreatedAt, &isActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan photographer: %w", err)
	}
	p.IsActive = isActive == 1
	return p, nil
}
