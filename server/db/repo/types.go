package repo

import "time"

// ─── Domain Models ────────────────────────────────────────────
// Tek yer: handler ve repo aynı tipi kullanır.

type Photographer struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	IsActive     bool      `json:"is_active"`
}

type Wedding struct {
	ID             string `json:"id"`
	PhotographerID string `json:"photographer_id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	Date           string `json:"date"`
	OwnerName      string `json:"owner_name,omitempty"`
	OwnerRole      string `json:"owner_role,omitempty"`
	OwnerPasscode  string `json:"owner_passcode,omitempty"`
	GuestPasscode  string `json:"guest_passcode,omitempty"`
	PhotoCount     int    `json:"photo_count,omitempty"`
	GuestCount     int    `json:"guest_count,omitempty"`
	IsActive       bool   `json:"is_active"`
	CreatedAt      string `json:"created_at"`
}

type Guest struct {
	ID           string `json:"id"`
	WeddingID    string `json:"wedding_id"`
	Name         string `json:"name"`
	Phone        string `json:"phone,omitempty"`
	Ref          string `json:"ref,omitempty"`
	SharedBy     string `json:"shared_by,omitempty"`
	ShareTokenID string `json:"share_token_id,omitempty"`
	ConsentGiven bool   `json:"consent_given"`
	JoinedAt     string `json:"joined_at"`
}

// WeddingMember represents an individual person's role and granular responsibilities in a wedding.
// Roles: 'bride_owner' (Gelin), 'groom_owner' (Damat), 'owner' (Düğün Sahibi),
// 'photographer' (Fotoğrafçı), 'bestman' (Sağdıç / Nedime), 'member_manager' (Yetkili Üye), 'guest' (Davetli Üye).
type WeddingMember struct {
	ID                string `json:"id"`
	WeddingID         string `json:"wedding_id"`
	WeddingCode       string `json:"wedding_code"`
	PersonName        string `json:"person_name"`
	Nick              string `json:"nick"`
	Phone             string `json:"phone,omitempty"`
	Role              string `json:"role"`
	RoleTitle         string `json:"role_title"`
	PasscodeHash      string `json:"-"`
	CanManageSettings bool   `json:"can_manage_settings"`
	CanAssignRoles    bool   `json:"can_assign_roles"`
	CanModeratePhotos bool   `json:"can_moderate_photos"`
	CanShareLinks     bool   `json:"can_share_links"`
	CanPrintExport    bool   `json:"can_print_export"`
	CanUpload         bool   `json:"can_upload"`
	AssignedBy        string `json:"assigned_by,omitempty"`
	CreatedAt         string `json:"created_at"`
	IsActive          bool   `json:"is_active"`
}

// ShareLink tracks who generated/shared a link or QR code, to whom, and when it was opened/joined.
type ShareLink struct {
	ID           string `json:"id"`
	WeddingID    string `json:"wedding_id"`
	WeddingCode  string `json:"wedding_code"`
	ShareType    string `json:"share_type"`     // 'link' | 'qr'
	Channel      string `json:"channel"`        // 'gelin' | 'damat' | 'masa-qr' | 'owner' | 'fotografci'
	SharedByName string `json:"shared_by_name"` // Who gave it (e.g. "Emre Yılmaz")
	SharedByRole string `json:"shared_by_role"` // 'owner' | 'bestman' | 'photographer' | 'guest'
	SharedToName string `json:"shared_to_name"` // To whom it was given (e.g. "Ahmet Yılmaz" or "Masa 4")
	SharedAt     string `json:"shared_at"`      // When it was created/shared
	OpenCount    int    `json:"open_count"`     // How many times it was opened
	JoinCount    int    `json:"join_count"`     // How many guests joined through it
	LastOpenedAt string `json:"last_opened_at"` // When it was last opened/joined
	LastOpenedBy string `json:"last_opened_by"` // Who last opened/joined with this token
	IsRevoked    bool   `json:"is_revoked"`
}

type Photo struct {
	ID         string   `json:"id"`
	WeddingID  string   `json:"wedding_id"`
	GuestID    string   `json:"guest_id,omitempty"`
	Filename   string   `json:"filename"`
	FullPath   string   `json:"-"`
	ThumbPath  string   `json:"-"`
	ThumbURL   string   `json:"thumb_url"`
	FullURL    string   `json:"full_url,omitempty"`
	MimeType   string   `json:"mime_type"`
	FileSize   int64    `json:"file_size"`
	Status     string   `json:"status"`
	Tags       []string `json:"tags,omitempty"`
	IsDeleted  bool     `json:"-"`
	DeletedBy  string   `json:"deleted_by,omitempty"`
	UploadedAt string   `json:"uploaded_at"`
}

type PhotoTag struct {
	ID      string `json:"id"`
	PhotoID string `json:"photo_id"`
	Tag     string `json:"tag"`
	AddedBy string `json:"added_by,omitempty"`
	AddedAt string `json:"added_at"`
}

type AnalyticsEvent struct {
	ID        string `json:"id"`
	WeddingID string `json:"wedding_id,omitempty"`
	EventType string `json:"event_type"`
	GuestID   string `json:"guest_id,omitempty"`
	Ref       string `json:"ref,omitempty"`
	IPHash    string `json:"-"`
	UserAgent string `json:"user_agent,omitempty"`
	CreatedAt string `json:"created_at"`
}

// ─── Repository Interfaces ────────────────────────────────────
// Her domain bağımsız interface; mock implementasyonu kolaylaşır.

type PhotographerRepository interface {
	Create(p *Photographer) error
	GetByEmail(email string) (*Photographer, error)
	GetByID(id string) (*Photographer, error)
}

type WeddingRepository interface {
	Create(w *Wedding) error
	GetByCode(code string) (*Wedding, error)
	GetByID(id string) (*Wedding, error)
	ListByPhotographer(photographerID string) ([]Wedding, error)
	Deactivate(id, photographerID string) error
	UpdatePasscode(idOrCode, passcode string) error
	UpdatePasscodes(idOrCode, ownerPasscode, guestPasscode string) error
}

type GuestRepository interface {
	Create(g *Guest) error
	GetByID(id string) (*Guest, error)
	ListByWedding(weddingID string) ([]Guest, error)
}

type WeddingMemberRepository interface {
	Upsert(m *WeddingMember) error
	GetByID(id string) (*WeddingMember, error)
	GetByNameOrNick(weddingID, query string) (*WeddingMember, error)
	ListByWedding(weddingID string) ([]WeddingMember, error)
	UpdateRoleAndPermissions(id, role, roleTitle, assignedBy string, canManage, canAssign, canModerate, canShare, canPrint, canUpload bool) error
	Deactivate(id string) error
}

type ShareLinkRepository interface {
	Create(s *ShareLink) error
	GetByID(id string) (*ShareLink, error)
	ListByWedding(weddingID string) ([]ShareLink, error)
	RecordOpen(id, openedBy string) error
	RecordJoin(id, joinedBy string) error
	Revoke(id string) error
}

type PhotoRepository interface {
	Create(p *Photo) error
	GetByID(id string) (*Photo, error)
	ListByWedding(weddingID string) ([]Photo, error)
	ListByGuest(weddingID, guestID string) ([]Photo, error)
	ListArchivedByWedding(weddingID string) ([]Photo, error)
	SearchByTagOrQuery(weddingID, query string) ([]Photo, error)
	AddTag(photoID, tag, addedBy string) error
	ListTags(photoID string) ([]string, error)
	SoftDelete(id, photographerID string) error
	Restore(id, photographerID string) error
}

type AnalyticsRepository interface {
	Track(e *AnalyticsEvent) error
}
