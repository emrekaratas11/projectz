package repo

import (
	"database/sql"
	"fmt"
	"strings"
)

// RoleMatrix returns the default RoleTitle and granular permission flags for a given role code.
func RoleMatrix(role string) (title string, canManage, canAssign, canModerate, canShare, canPrint, canUpload bool) {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "bride_owner":
		return "Düğün Sahibi · Gelin", true, true, true, true, true, true
	case "groom_owner":
		return "Düğün Sahibi · Damat", true, true, true, true, true, true
	case "owner":
		return "Düğün Sahibi", true, true, true, true, true, true
	case "photographer":
		return "Düğün Fotoğrafçısı · Organizasyon", false, false, true, true, true, true
	case "bestman":
		return "Sağdıç / Nedime · Yardımcı Yönetici", false, false, true, true, true, true
	case "member_manager":
		return "Yetkili Üye · Galeri Moderatörü", false, false, true, true, false, true
	default:
		return "Davetli Üye", false, false, false, false, false, true
	}
}

// SQLiteWeddingMemberRepo implements WeddingMemberRepository.
type SQLiteWeddingMemberRepo struct {
	db              *sql.DB
	stmtInsert      *sql.Stmt
	stmtUpdate      *sql.Stmt
	stmtByID        *sql.Stmt
	stmtByNameNick  *sql.Stmt
	stmtByWedding   *sql.Stmt
	stmtUpdatePerms *sql.Stmt
	stmtDeactivate  *sql.Stmt
}

func NewWeddingMemberRepo(db *sql.DB) (*SQLiteWeddingMemberRepo, error) {
	r := &SQLiteWeddingMemberRepo{db: db}
	var err error

	r.stmtInsert, err = db.Prepare(`
		INSERT INTO wedding_members (
			id, wedding_id, wedding_code, person_name, nick, phone,
			role, role_title, passcode_hash,
			can_manage_settings, can_assign_roles, can_moderate_photos,
			can_share_links, can_print_export, can_upload,
			assigned_by, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare insert: %w", err)
	}

	r.stmtUpdate, err = db.Prepare(`
		UPDATE wedding_members
		SET person_name = ?, nick = ?, phone = ?, role = ?, role_title = ?,
		    passcode_hash = CASE WHEN ? != '' THEN ? ELSE passcode_hash END,
		    can_manage_settings = ?, can_assign_roles = ?, can_moderate_photos = ?,
		    can_share_links = ?, can_print_export = ?, can_upload = ?,
		    assigned_by = CASE WHEN ? != '' THEN ? ELSE assigned_by END,
		    is_active = 1
		WHERE id = ?`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare update: %w", err)
	}

	r.stmtByID, err = db.Prepare(`
		SELECT id, wedding_id, wedding_code, person_name, nick, COALESCE(phone,''),
		       role, role_title, COALESCE(passcode_hash,''),
		       can_manage_settings, can_assign_roles, can_moderate_photos,
		       can_share_links, can_print_export, can_upload,
		       COALESCE(assigned_by,''), COALESCE(created_at,''), is_active
		FROM wedding_members
		WHERE id = ?`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare byID: %w", err)
	}

	r.stmtByNameNick, err = db.Prepare(`
		SELECT id, wedding_id, wedding_code, person_name, nick, COALESCE(phone,''),
		       role, role_title, COALESCE(passcode_hash,''),
		       can_manage_settings, can_assign_roles, can_moderate_photos,
		       can_share_links, can_print_export, can_upload,
		       COALESCE(assigned_by,''), COALESCE(created_at,''), is_active
		FROM wedding_members
		WHERE wedding_id = ? AND is_active = 1
		  AND (LOWER(person_name) = LOWER(?) OR LOWER(nick) = LOWER(?))
		ORDER BY created_at ASC
		LIMIT 1`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare byNameNick: %w", err)
	}

	r.stmtByWedding, err = db.Prepare(`
		SELECT id, wedding_id, wedding_code, person_name, nick, COALESCE(phone,''),
		       role, role_title, COALESCE(passcode_hash,''),
		       can_manage_settings, can_assign_roles, can_moderate_photos,
		       can_share_links, can_print_export, can_upload,
		       COALESCE(assigned_by,''), COALESCE(created_at,''), is_active
		FROM wedding_members
		WHERE wedding_id = ? AND is_active = 1
		ORDER BY
			CASE role
				WHEN 'bride_owner' THEN 1
				WHEN 'groom_owner' THEN 2
				WHEN 'owner' THEN 3
				WHEN 'photographer' THEN 4
				WHEN 'bestman' THEN 5
				WHEN 'member_manager' THEN 6
				ELSE 7
			END ASC,
			created_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare byWedding: %w", err)
	}

	r.stmtUpdatePerms, err = db.Prepare(`
		UPDATE wedding_members
		SET role = ?, role_title = ?, assigned_by = ?,
		    can_manage_settings = ?, can_assign_roles = ?, can_moderate_photos = ?,
		    can_share_links = ?, can_print_export = ?, can_upload = ?
		WHERE id = ?`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare updatePerms: %w", err)
	}

	r.stmtDeactivate, err = db.Prepare(`
		UPDATE wedding_members SET is_active = 0 WHERE id = ?`)
	if err != nil {
		return nil, fmt.Errorf("wedding_members prepare deactivate: %w", err)
	}

	return r, nil
}

func (r *SQLiteWeddingMemberRepo) Close() {
	r.stmtInsert.Close()
	r.stmtUpdate.Close()
	r.stmtByID.Close()
	r.stmtByNameNick.Close()
	r.stmtByWedding.Close()
	r.stmtUpdatePerms.Close()
	r.stmtDeactivate.Close()
}

func (r *SQLiteWeddingMemberRepo) Upsert(m *WeddingMember) error {
	if m.RoleTitle == "" {
		title, cm, ca, cmod, cs, cp, cu := RoleMatrix(m.Role)
		m.RoleTitle = title
		if !m.CanManageSettings && !m.CanAssignRoles && !m.CanModeratePhotos && !m.CanShareLinks && !m.CanPrintExport {
			m.CanManageSettings = cm
			m.CanAssignRoles = ca
			m.CanModeratePhotos = cmod
			m.CanShareLinks = cs
			m.CanPrintExport = cp
			m.CanUpload = cu
		}
	}

	existing, _ := r.GetByNameOrNick(m.WeddingID, m.PersonName)
	if existing == nil && m.Nick != "" {
		existing, _ = r.GetByNameOrNick(m.WeddingID, m.Nick)
	}

	if existing != nil {
		m.ID = existing.ID
		_, err := r.stmtUpdate.Exec(
			m.PersonName, m.Nick, m.Phone, m.Role, m.RoleTitle,
			m.PasscodeHash, m.PasscodeHash,
			boolInt(m.CanManageSettings), boolInt(m.CanAssignRoles), boolInt(m.CanModeratePhotos),
			boolInt(m.CanShareLinks), boolInt(m.CanPrintExport), boolInt(m.CanUpload),
			m.AssignedBy, m.AssignedBy,
			existing.ID,
		)
		return err
	}

	_, err := r.stmtInsert.Exec(
		m.ID, m.WeddingID, m.WeddingCode, m.PersonName, m.Nick, m.Phone,
		m.Role, m.RoleTitle, m.PasscodeHash,
		boolInt(m.CanManageSettings), boolInt(m.CanAssignRoles), boolInt(m.CanModeratePhotos),
		boolInt(m.CanShareLinks), boolInt(m.CanPrintExport), boolInt(m.CanUpload),
		m.AssignedBy,
	)
	return err
}

func (r *SQLiteWeddingMemberRepo) GetByID(id string) (*WeddingMember, error) {
	return scanMemberRow(r.stmtByID.QueryRow(id))
}

func (r *SQLiteWeddingMemberRepo) GetByNameOrNick(weddingID, query string) (*WeddingMember, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return nil, nil
	}
	return scanMemberRow(r.stmtByNameNick.QueryRow(weddingID, q, q))
}

func (r *SQLiteWeddingMemberRepo) ListByWedding(weddingID string) ([]WeddingMember, error) {
	rows, err := r.stmtByWedding.Query(weddingID)
	if err != nil {
		return nil, fmt.Errorf("list wedding_members: %w", err)
	}
	defer rows.Close()

	var list []WeddingMember
	for rows.Next() {
		m := WeddingMember{}
		var cm, ca, cmod, cs, cp, cu, active int
		if err := rows.Scan(
			&m.ID, &m.WeddingID, &m.WeddingCode, &m.PersonName, &m.Nick, &m.Phone,
			&m.Role, &m.RoleTitle, &m.PasscodeHash,
			&cm, &ca, &cmod, &cs, &cp, &cu,
			&m.AssignedBy, &m.CreatedAt, &active,
		); err != nil {
			continue
		}
		m.CanManageSettings = cm == 1
		m.CanAssignRoles = ca == 1
		m.CanModeratePhotos = cmod == 1
		m.CanShareLinks = cs == 1
		m.CanPrintExport = cp == 1
		m.CanUpload = cu == 1
		m.IsActive = active == 1
		list = append(list, m)
	}
	return list, nil
}

func (r *SQLiteWeddingMemberRepo) UpdateRoleAndPermissions(id, role, roleTitle, assignedBy string, canManage, canAssign, canModerate, canShare, canPrint, canUpload bool) error {
	if roleTitle == "" {
		roleTitle, _, _, _, _, _, _ = RoleMatrix(role)
	}
	_, err := r.stmtUpdatePerms.Exec(
		role, roleTitle, assignedBy,
		boolInt(canManage), boolInt(canAssign), boolInt(canModerate),
		boolInt(canShare), boolInt(canPrint), boolInt(canUpload),
		id,
	)
	return err
}

func (r *SQLiteWeddingMemberRepo) Deactivate(id string) error {
	_, err := r.stmtDeactivate.Exec(id)
	return err
}

func scanMemberRow(row *sql.Row) (*WeddingMember, error) {
	m := &WeddingMember{}
	var cm, ca, cmod, cs, cp, cu, active int
	err := row.Scan(
		&m.ID, &m.WeddingID, &m.WeddingCode, &m.PersonName, &m.Nick, &m.Phone,
		&m.Role, &m.RoleTitle, &m.PasscodeHash,
		&cm, &ca, &cmod, &cs, &cp, &cu,
		&m.AssignedBy, &m.CreatedAt, &active,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	m.CanManageSettings = cm == 1
	m.CanAssignRoles = ca == 1
	m.CanModeratePhotos = cmod == 1
	m.CanShareLinks = cs == 1
	m.CanPrintExport = cp == 1
	m.CanUpload = cu == 1
	m.IsActive = active == 1
	return m, nil
}

