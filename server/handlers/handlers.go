package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"fotoyonetim/db/repo"
)

// ─── Deps & Handler ──────────────────────────────────────────

// Deps carries repository interfaces — allows swapping mocks in tests.
type Deps struct {
	Photographers repo.PhotographerRepository
	Weddings      repo.WeddingRepository
	Guests        repo.GuestRepository
	Members       repo.WeddingMemberRepository
	ShareLinks    repo.ShareLinkRepository
	Photos        repo.PhotoRepository
	Analytics     repo.AnalyticsRepository
}

type Handler struct{ deps Deps }

func New(d Deps) *Handler { return &Handler{deps: d} }

// ─── Auth Middleware ──────────────────────────────────────────

func (h *Handler) AuthPhotographer(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		token := strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer ")
		if token == "" {
			if cookie, err := c.Cookie("ph_session"); err == nil {
				token = cookie.Value
			}
		}
		if token == "" {
			return c.JSON(http.StatusUnauthorized, echo.Map{"error": "oturum açınız"})
		}
		ph, err := h.deps.Photographers.GetByID(token)
		if err != nil || ph == nil {
			return c.JSON(http.StatusUnauthorized, echo.Map{"error": "geçersiz oturum"})
		}
		c.Set("photographer_id", ph.ID)
		return next(c)
	}
}

// ─── Photographer: Register ───────────────────────────────────

func (h *Handler) RegisterPhotographer(c echo.Context) error {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "geçersiz istek"})
	}
	if req.Name == "" || req.Email == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "tüm alanlar zorunlu"})
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), 12)

	p := &repo.Photographer{
		ID:           uuid.NewString(),
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: string(hash),
	}
	if err := h.deps.Photographers.Create(p); err != nil {
		if strings.Contains(err.Error(), "email_exists") {
			return c.JSON(http.StatusConflict, echo.Map{"error": "bu e-posta ile kayıt var"})
		}
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "kayıt başarısız"})
	}

	setSession(c, p.ID)
	return c.JSON(http.StatusCreated, echo.Map{
		"id": p.ID, "name": p.Name, "email": p.Email, "token": p.ID,
	})
}

// ─── Photographer: Login ──────────────────────────────────────

func (h *Handler) LoginPhotographer(c echo.Context) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	c.Bind(&req)

	p, err := h.deps.Photographers.GetByEmail(req.Email)
	if err != nil || p == nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "e-posta veya şifre hatalı"})
	}
	if err := bcrypt.CompareHashAndPassword([]byte(p.PasswordHash), []byte(req.Password)); err != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "e-posta veya şifre hatalı"})
	}

	setSession(c, p.ID)
	return c.JSON(http.StatusOK, echo.Map{
		"id": p.ID, "name": p.Name, "email": p.Email, "token": p.ID,
	})
}

// ─── Wedding: Create (Photographer Auth) ──────────────────────

func (h *Handler) CreateWedding(c echo.Context) error {
	phID := c.Get("photographer_id").(string)
	var req struct {
		Name          string `json:"name"`
		Date          string `json:"date"`
		OwnerName     string `json:"owner_name"`
		OwnerRole     string `json:"owner_role"`
		OwnerPasscode string `json:"owner_passcode"`
		GuestPasscode string `json:"guest_passcode"`
	}
	c.Bind(&req)
	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "düğün adı zorunlu"})
	}

	ownerPass := req.OwnerPasscode
	if ownerPass == "" {
		ownerPass = randomShort(6)
	}
	guestPass := req.GuestPasscode
	if guestPass == "" {
		guestPass = ownerPass
	}

	w := &repo.Wedding{
		ID:             uuid.NewString(),
		PhotographerID: phID,
		Code:           generateCode(req.Name),
		Name:           req.Name,
		Date:           req.Date,
		OwnerName:      req.OwnerName,
		OwnerRole:      req.OwnerRole,
		OwnerPasscode:  ownerPass,
		GuestPasscode:  guestPass,
		IsActive:       true,
	}

	if err := h.deps.Weddings.Create(w); err != nil {
		w.Code = generateCode(req.Name)
		if err := h.deps.Weddings.Create(w); err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "düğün oluşturulamadı"})
		}
	}

	h.trackAsync(w.ID, "", "wedding_created", "", c)
	return c.JSON(http.StatusCreated, echo.Map{
		"id":             w.ID,
		"code":           w.Code,
		"name":           w.Name,
		"date":           w.Date,
		"owner_name":     w.OwnerName,
		"owner_role":     w.OwnerRole,
		"passcode":       w.OwnerPasscode,
		"owner_passcode": w.OwnerPasscode,
		"guest_passcode": w.GuestPasscode,
		"link":           "dugun.fotoyonetim.com/" + w.Code,
	})
}

// ─── Wedding: Setup (Zero-To-One Manager Registration + Wedding Creation) ───

func (h *Handler) SetupWedding(c echo.Context) error {
	var req struct {
		Code          string `json:"code"`
		Name          string `json:"name"`
		Date          string `json:"date"`
		OwnerName     string `json:"owner_name"`
		OwnerRole     string `json:"owner_role"`
		OwnerPasscode string `json:"owner_passcode"`
		GuestPasscode string `json:"guest_passcode"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "geçersiz istek"})
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.OwnerName) == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "yönetici adı ve düğün adı zorunludur"})
	}

	ownerPass := strings.TrimSpace(req.OwnerPasscode)
	if ownerPass == "" {
		ownerPass = "1234"
	}
	guestPass := strings.TrimSpace(req.GuestPasscode)
	if guestPass == "" {
		guestPass = ownerPass
	}
	role := strings.TrimSpace(req.OwnerRole)
	if role == "" {
		role = "owner"
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		code = generateCode(req.Name)
	}

	w := &repo.Wedding{
		ID:             uuid.NewString(),
		PhotographerID: "default-photographer",
		Code:           code,
		Name:           strings.TrimSpace(req.Name),
		Date:           strings.TrimSpace(req.Date),
		OwnerName:      strings.TrimSpace(req.OwnerName),
		OwnerRole:      role,
		OwnerPasscode:  ownerPass,
		GuestPasscode:  guestPass,
		IsActive:       true,
	}

	if err := h.deps.Weddings.Create(w); err != nil {
		w.Code = generateCode(req.Name)
		if err := h.deps.Weddings.Create(w); err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "düğün kurulamadı"})
		}
	}

	// Register individual creator in wedding_members RBAC table and issue signed token
	var memberToken string
	var creatorMember *repo.WeddingMember
	if h.deps.Members != nil {
		title, cm, ca, cmod, cs, cp, cu := repo.RoleMatrix(role)
		creatorMember = &repo.WeddingMember{
			ID:                uuid.NewString(),
			WeddingID:         w.ID,
			WeddingCode:       w.Code,
			PersonName:        w.OwnerName,
			Nick:              generateNick(w.OwnerName),
			Role:              role,
			RoleTitle:         title,
			PasscodeHash:      hashPin(ownerPass),
			CanManageSettings: cm,
			CanAssignRoles:    ca,
			CanModeratePhotos: cmod,
			CanShareLinks:     cs,
			CanPrintExport:    cp,
			CanUpload:         cu,
			AssignedBy:        "Kurucu",
			IsActive:          true,
		}
		_ = h.deps.Members.Upsert(creatorMember)
		memberToken = SignMemberToken(creatorMember)
		setMemberSessionCookie(c, memberToken)
	}

	h.trackAsync(w.ID, "", "wedding_setup", role, c)
	return c.JSON(http.StatusCreated, echo.Map{
		"id":             w.ID,
		"code":           w.Code,
		"name":           w.Name,
		"date":           w.Date,
		"owner_name":     w.OwnerName,
		"owner_role":     w.OwnerRole,
		"owner_passcode": w.OwnerPasscode,
		"guest_passcode": w.GuestPasscode,
		"member":         creatorMember,
		"member_token":   memberToken,
		"link":           "dugun.fotoyonetim.com/" + w.Code,
	})
}

// ─── Wedding: Login Manager / Authorized Member (RBAC) ────────

func (h *Handler) LoginWeddingManager(c echo.Context) error {
	var req struct {
		Passcode string `json:"passcode"`
		Name     string `json:"name"`
		Role     string `json:"role"`
	}
	_ = c.Bind(&req)

	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	if !w.IsActive {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "bu düğün aktif değil"})
	}

	cleanPass := strings.TrimSpace(req.Passcode)
	if cleanPass == "" {
		h.RecordAuthFailure(c, "empty_passcode")
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "şifre zorunludur"})
	}

	managerName := strings.TrimSpace(req.Name)
	managerRole := strings.TrimSpace(req.Role)

	// 1. Check if this person is an authorized member in wedding_members (e.g. a guest promoted to manager/moderator)
	var matchedMember *repo.WeddingMember
	if h.deps.Members != nil && managerName != "" {
		matchedMember, _ = h.deps.Members.GetByNameOrNick(w.ID, managerName)
	}

	isOwnerPinMatch := cleanPass == strings.TrimSpace(w.OwnerPasscode)
	isMemberPinMatch := matchedMember != nil && matchedMember.IsActive && (
		(matchedMember.PasscodeHash != "" && matchedMember.PasscodeHash == hashPin(cleanPass)) ||
		(cleanPass == strings.TrimSpace(w.GuestPasscode) && (matchedMember.CanModeratePhotos || matchedMember.CanShareLinks || matchedMember.CanManageSettings)))

	if !isOwnerPinMatch && !isMemberPinMatch {
		h.RecordAuthFailure(c, "invalid_manager_passcode")
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "hatalı yönetici şifresi veya yetkisiz kullanıcı"})
	}

	if managerName == "" {
		if matchedMember != nil {
			managerName = matchedMember.PersonName
		} else if w.OwnerName != "" {
			managerName = w.OwnerName
		} else {
			managerName = "Yönetici"
		}
	}
	if managerRole == "" {
		if matchedMember != nil && matchedMember.Role != "" && matchedMember.Role != "guest" {
			managerRole = matchedMember.Role
		} else if w.OwnerRole != "" {
			managerRole = w.OwnerRole
		} else {
			managerRole = "owner"
		}
	}

	title, cm, ca, cmod, cs, cp, cu := repo.RoleMatrix(managerRole)
	if matchedMember != nil && isMemberPinMatch && !isOwnerPinMatch {
		// Preserve exact member permissions assigned to this promoted member
		managerRole = matchedMember.Role
		title = matchedMember.RoleTitle
		cm = matchedMember.CanManageSettings
		ca = matchedMember.CanAssignRoles
		cmod = matchedMember.CanModeratePhotos
		cs = matchedMember.CanShareLinks
		cp = matchedMember.CanPrintExport
		cu = matchedMember.CanUpload
	}

	memberObj := &repo.WeddingMember{
		ID:                uuid.NewString(),
		WeddingID:         w.ID,
		WeddingCode:       w.Code,
		PersonName:        managerName,
		Nick:              generateNick(managerName),
		Role:              managerRole,
		RoleTitle:         title,
		PasscodeHash:      hashPin(cleanPass),
		CanManageSettings: cm,
		CanAssignRoles:    ca,
		CanModeratePhotos: cmod,
		CanShareLinks:     cs,
		CanPrintExport:    cp,
		CanUpload:         cu,
		IsActive:          true,
	}
	if h.deps.Members != nil {
		_ = h.deps.Members.Upsert(memberObj)
	}
	memberToken := SignMemberToken(memberObj)
	setMemberSessionCookie(c, memberToken)

	return c.JSON(http.StatusOK, echo.Map{
		"id":             w.ID,
		"code":           w.Code,
		"name":           w.Name,
		"date":           w.Date,
		"owner_name":     managerName,
		"owner_role":     managerRole,
		"owner_passcode": w.OwnerPasscode,
		"guest_passcode": w.GuestPasscode,
		"member":         memberObj,
		"member_token":   memberToken,
	})
}

// ─── Wedding Members & Responsibilities Table Endpoints (RBAC) ───

func (h *Handler) ListWeddingMembers(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	if h.deps.Members == nil {
		return c.JSON(http.StatusOK, []repo.WeddingMember{})
	}
	members, err := h.deps.Members.ListByWedding(w.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "görev tablosu alınamadı"})
	}
	if members == nil {
		members = []repo.WeddingMember{}
	}
	return c.JSON(http.StatusOK, members)
}

func (h *Handler) UpsertWeddingMemberRole(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil || !w.IsActive {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	if h.deps.Members == nil {
		return c.JSON(http.StatusServiceUnavailable, echo.Map{"error": "görev servisi aktif değil"})
	}

	var req struct {
		ID                string `json:"id"`
		PersonName        string `json:"person_name"`
		Nick              string `json:"nick"`
		Phone             string `json:"phone"`
		Role              string `json:"role"`
		RoleTitle         string `json:"role_title"`
		Passcode          string `json:"passcode"`
		CanManageSettings *bool  `json:"can_manage_settings"`
		CanAssignRoles    *bool  `json:"can_assign_roles"`
		CanModeratePhotos *bool  `json:"can_moderate_photos"`
		CanShareLinks     *bool  `json:"can_share_links"`
		CanPrintExport    *bool  `json:"can_print_export"`
		CanUpload         *bool  `json:"can_upload"`
		AssignedBy        string `json:"assigned_by"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.PersonName) == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "kişi adı zorunludur"})
	}

	role := strings.TrimSpace(req.Role)
	if role == "" {
		role = "member_manager"
	}
	title, cm, ca, cmod, cs, cp, cu := repo.RoleMatrix(role)
	if strings.TrimSpace(req.RoleTitle) != "" {
		title = strings.TrimSpace(req.RoleTitle)
	}
	if req.CanManageSettings != nil {
		cm = *req.CanManageSettings
	}
	if req.CanAssignRoles != nil {
		ca = *req.CanAssignRoles
	}
	if req.CanModeratePhotos != nil {
		cmod = *req.CanModeratePhotos
	}
	if req.CanShareLinks != nil {
		cs = *req.CanShareLinks
	}
	if req.CanPrintExport != nil {
		cp = *req.CanPrintExport
	}
	if req.CanUpload != nil {
		cu = *req.CanUpload
	}

	assignedBy := strings.TrimSpace(req.AssignedBy)
	if claims, ok := c.Get("member_claims").(*MemberTokenClaims); ok && claims != nil && assignedBy == "" {
		assignedBy = claims.PersonName
	}

	memberID := strings.TrimSpace(req.ID)
	if memberID == "" {
		memberID = uuid.NewString()
	}
	nick := strings.TrimSpace(req.Nick)
	if nick == "" {
		nick = generateNick(req.PersonName)
	}

	m := &repo.WeddingMember{
		ID:                memberID,
		WeddingID:         w.ID,
		WeddingCode:       w.Code,
		PersonName:        strings.TrimSpace(req.PersonName),
		Nick:              nick,
		Phone:             strings.TrimSpace(req.Phone),
		Role:              role,
		RoleTitle:         title,
		PasscodeHash:      hashPin(req.Passcode),
		CanManageSettings: cm,
		CanAssignRoles:    ca,
		CanModeratePhotos: cmod,
		CanShareLinks:     cs,
		CanPrintExport:    cp,
		CanUpload:         cu,
		AssignedBy:        assignedBy,
		IsActive:          true,
	}

	if err := h.deps.Members.Upsert(m); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "görev kaydedilemedi"})
	}
	h.trackAsync(w.ID, m.ID, "member_role_assigned", m.Role, c)
	return c.JSON(http.StatusOK, m)
}

// ─── Wedding: Update Passcodes ────────────────────────────────

func (h *Handler) UpdateWeddingPasscodes(c echo.Context) error {
	var req struct {
		OwnerPasscode string `json:"owner_passcode"`
		GuestPasscode string `json:"guest_passcode"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "geçersiz istek"})
	}

	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}

	ownerPass := strings.TrimSpace(req.OwnerPasscode)
	if ownerPass == "" {
		ownerPass = w.OwnerPasscode
	}
	guestPass := strings.TrimSpace(req.GuestPasscode)
	if guestPass == "" {
		guestPass = w.GuestPasscode
	}

	if err := h.deps.Weddings.UpdatePasscodes(w.ID, ownerPass, guestPass); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "şifre güncellenemedi"})
	}

	return c.JSON(http.StatusOK, echo.Map{
		"ok":             true,
		"owner_passcode": ownerPass,
		"guest_passcode": guestPass,
	})
}

// ─── Wedding: List ────────────────────────────────────────────

func (h *Handler) ListWeddings(c echo.Context) error {
	phID := c.Get("photographer_id").(string)
	weddings, err := h.deps.Weddings.ListByPhotographer(phID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "liste alınamadı"})
	}
	if weddings == nil {
		weddings = []repo.Wedding{}
	}
	return c.JSON(http.StatusOK, weddings)
}

// ─── Wedding: Get (public + link/QR attribution resolution) ───

func (h *Handler) GetWedding(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	if !w.IsActive {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "bu düğün artık aktif değil"})
	}

	ref := c.QueryParam("ref")
	shareTokenID := c.QueryParam("st")
	var shareRecord *repo.ShareLink
	if shareTokenID != "" && h.deps.ShareLinks != nil {
		if sl, err := h.deps.ShareLinks.GetByID(shareTokenID); err == nil && sl != nil && !sl.IsRevoked {
			_ = h.deps.ShareLinks.RecordOpen(sl.ID, c.QueryParam("viewer"))
			shareRecord, _ = h.deps.ShareLinks.GetByID(sl.ID)
			if ref == "" {
				ref = sl.Channel
			}
		}
	}

	h.trackAsync(w.ID, "", "link_visit", ref, c)
	resp := echo.Map{
		"id":         w.ID,
		"code":       w.Code,
		"name":       w.Name,
		"date":       w.Date,
		"owner_name": w.OwnerName,
		"owner_role": w.OwnerRole,
	}
	if shareRecord != nil {
		resp["share_link"] = shareRecord
	}
	return c.JSON(http.StatusOK, resp)
}

// ─── Wedding: Delete ──────────────────────────────────────────

func (h *Handler) DeleteWedding(c echo.Context) error {
	phID := c.Get("photographer_id").(string)
	if err := h.deps.Weddings.Deactivate(c.Param("id"), phID); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "silinemedi"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// ─── Share Links & QR Tracking: Create, List, Open, Revoke ────

func (h *Handler) CreateShareLink(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil || !w.IsActive {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}

	var req struct {
		ID           string `json:"id"`
		ShareType    string `json:"share_type"`     // 'link' | 'qr'
		Channel      string `json:"channel"`        // 'gelin' | 'damat' | 'masa-qr' | 'owner' | 'fotografci'
		SharedByName string `json:"shared_by_name"` // Who gave it
		SharedByRole string `json:"shared_by_role"` // 'owner' | 'bestman' | 'photographer' | 'guest'
		SharedToName string `json:"shared_to_name"` // To whom it was given
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "geçersiz istek"})
	}

	tokenID := strings.TrimSpace(req.ID)
	if tokenID == "" {
		tokenID = "sl-" + randomShort(8)
	}
	sharedBy := strings.TrimSpace(req.SharedByName)
	if sharedBy == "" {
		sharedBy = w.OwnerName
	}
	if sharedBy == "" {
		sharedBy = "Yönetici"
	}

	s := &repo.ShareLink{
		ID:           tokenID,
		WeddingID:    w.ID,
		WeddingCode:  w.Code,
		ShareType:    req.ShareType,
		Channel:      req.Channel,
		SharedByName: sharedBy,
		SharedByRole: req.SharedByRole,
		SharedToName: req.SharedToName,
	}

	if h.deps.ShareLinks != nil {
		if err := h.deps.ShareLinks.Create(s); err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "paylaşım kaydı oluşturulamadı"})
		}
		if saved, err := h.deps.ShareLinks.GetByID(s.ID); err == nil && saved != nil {
			s = saved
		}
	}

	eventType := "link_shared"
	if s.ShareType == "qr" {
		eventType = "qr_shared"
	}
	h.trackAsync(w.ID, "", eventType, s.Channel, c)

	return c.JSON(http.StatusCreated, s)
}

func (h *Handler) ListShareLinks(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	if h.deps.ShareLinks == nil {
		return c.JSON(http.StatusOK, []repo.ShareLink{})
	}
	list, err := h.deps.ShareLinks.ListByWedding(w.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "paylaşım listesi alınamadı"})
	}
	if list == nil {
		list = []repo.ShareLink{}
	}
	return c.JSON(http.StatusOK, list)
}

func (h *Handler) OpenShareLink(c echo.Context) error {
	tokenID := c.Param("id")
	var req struct {
		OpenedBy string `json:"opened_by"`
	}
	_ = c.Bind(&req)

	if h.deps.ShareLinks == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "paylaşım servisi aktif değil"})
	}
	sl, err := h.deps.ShareLinks.GetByID(tokenID)
	if err != nil || sl == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "paylaşım bağlantısı bulunamadı"})
	}
	if sl.IsRevoked {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "bu davet bağlantısı iptal edilmiş"})
	}

	_ = h.deps.ShareLinks.RecordOpen(sl.ID, req.OpenedBy)
	updated, _ := h.deps.ShareLinks.GetByID(sl.ID)
	h.trackAsync(sl.WeddingID, "", "share_opened", sl.Channel, c)
	return c.JSON(http.StatusOK, updated)
}

func (h *Handler) RevokeShareLink(c echo.Context) error {
	tokenID := c.Param("id")
	if h.deps.ShareLinks == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "paylaşım servisi aktif değil"})
	}
	if err := h.deps.ShareLinks.Revoke(tokenID); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "iptal edilemedi"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true, "id": tokenID})
}

// ─── Guest: Create ────────────────────────────────────────────

func (h *Handler) CreateGuest(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil || !w.IsActive {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}

	var req struct {
		Name         string `json:"name"`
		Phone        string `json:"phone"`
		Ref          string `json:"ref"`
		SharedBy     string `json:"shared_by"`
		ShareTokenID string `json:"share_token_id"`
		ConsentGiven bool   `json:"consent_given"`
	}
	c.Bind(&req)

	sharedBy := strings.TrimSpace(req.SharedBy)
	ref := strings.TrimSpace(req.Ref)
	tokenID := strings.TrimSpace(req.ShareTokenID)

	// If guest joined via a tracked share_link token, resolve who gave the link and record the join
	if tokenID != "" && h.deps.ShareLinks != nil {
		if sl, err := h.deps.ShareLinks.GetByID(tokenID); err == nil && sl != nil && !sl.IsRevoked {
			if sharedBy == "" {
				sharedBy = sl.SharedByName
			}
			if ref == "" {
				ref = sl.Channel
			}
			_ = h.deps.ShareLinks.RecordJoin(sl.ID, req.Name)
		}
	}

	g := &repo.Guest{
		ID:           uuid.NewString(),
		WeddingID:    w.ID,
		Name:         req.Name,
		Phone:        req.Phone,
		Ref:          ref,
		SharedBy:     sharedBy,
		ShareTokenID: tokenID,
		ConsentGiven: req.ConsentGiven,
	}
	if err := h.deps.Guests.Create(g); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "davetli kaydedilemedi"})
	}

	// Register or lookup this guest in wedding_members RBAC table
	// If this guest was already promoted to a manager/moderator role in wedding_members, preserve their elevated permissions!
	var memberObj *repo.WeddingMember
	var memberToken string
	if h.deps.Members != nil {
		existingMember, _ := h.deps.Members.GetByNameOrNick(w.ID, g.Name)
		if existingMember != nil && existingMember.Role != "guest" {
			memberObj = existingMember
		} else {
			title, cm, ca, cmod, cs, cp, cu := repo.RoleMatrix("guest")
			memberObj = &repo.WeddingMember{
				ID:                g.ID,
				WeddingID:         w.ID,
				WeddingCode:       w.Code,
				PersonName:        g.Name,
				Nick:              generateNick(g.Name),
				Phone:             g.Phone,
				Role:              "guest",
				RoleTitle:         title,
				CanManageSettings: cm,
				CanAssignRoles:    ca,
				CanModeratePhotos: cmod,
				CanShareLinks:     cs,
				CanPrintExport:    cp,
				CanUpload:         cu,
				AssignedBy:        sharedBy,
				IsActive:          true,
			}
			_ = h.deps.Members.Upsert(memberObj)
		}
		memberToken = SignMemberToken(memberObj)
		setMemberSessionCookie(c, memberToken)
	}

	h.trackAsync(w.ID, g.ID, "guest_joined", g.Ref, c)
	return c.JSON(http.StatusCreated, echo.Map{
		"id":             g.ID,
		"wedding_id":     g.WeddingID,
		"name":           g.Name,
		"ref":            g.Ref,
		"shared_by":      g.SharedBy,
		"share_token_id": g.ShareTokenID,
		"member":         memberObj,
		"member_token":   memberToken,
	})
}

// ─── Guest: List ──────────────────────────────────────────────

func (h *Handler) ListGuests(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	guests, err := h.deps.Guests.ListByWedding(w.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "liste alınamadı"})
	}
	if guests == nil {
		guests = []repo.Guest{}
	}
	return c.JSON(http.StatusOK, guests)
}

// ─── Photo: Upload (UC-1, UC-9, UC-18: 50 limit & magic byte validation) ───

func (h *Handler) UploadPhoto(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil || !w.IsActive {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}

	guestID := c.FormValue("guest_id")

	// Support both multi-upload ("photos") and single upload ("photo")
	var files []*multipart.FileHeader
	if form, err := c.MultipartForm(); err == nil && form != nil {
		if photosList, ok := form.File["photos"]; ok && len(photosList) > 0 {
			files = photosList
		} else if singleList, ok := form.File["photo"]; ok && len(singleList) > 0 {
			files = singleList
		}
	} else if file, err := c.FormFile("photo"); err == nil && file != nil {
		files = []*multipart.FileHeader{file}
	}

	if len(files) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "fotoğraf bulunamadı"})
	}

	// UC-18: Limit check (max 50 photos per upload batch)
	if len(files) > 50 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "tek seferde en fazla 50 fotoğraf yükleyebilirsiniz"})
	}

	uploadDir := filepath.Join("uploads", w.ID)
	thumbDir := filepath.Join("thumbs", w.ID)
	os.MkdirAll(uploadDir, 0755)
	os.MkdirAll(thumbDir, 0755)

	var uploaded []echo.Map

	for _, file := range files {
		// Validate: only real images (magic bytes — not just Content-Type)
		src, err := file.Open()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "dosya açılamadı"})
		}

		header := make([]byte, 12)
		if _, err := src.Read(header); err != nil {
			src.Close()
			return c.JSON(http.StatusBadRequest, echo.Map{"error": "dosya okunamadı"})
		}
		if !isImageMagic(header) {
			src.Close()
			return c.JSON(http.StatusBadRequest, echo.Map{"error": "sadece fotoğraf yükleyebilirsiniz"})
		}

		// Seek back to beginning
		if seeker, ok := src.(io.Seeker); ok {
			seeker.Seek(0, io.SeekStart)
		} else {
			src.Close()
			src2, _ := file.Open()
			src = src2
		}

		photoID := uuid.NewString()
		ext := filepath.Ext(file.Filename)
		if ext == "" {
			ext = ".jpg"
		}
		ext = strings.ToLower(ext)

		fullPath := filepath.Join(uploadDir, photoID+ext)
		dst, err := os.Create(fullPath)
		if err != nil {
			src.Close()
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "dosya kaydedilemedi"})
		}
		io.Copy(dst, src)
		dst.Close()
		src.Close()

		thumbPath := filepath.Join(thumbDir, photoID+"_480"+ext)

		p := &repo.Photo{
			ID:        photoID,
			WeddingID: w.ID,
			GuestID:   guestID,
			Filename:  file.Filename,
			FullPath:  fullPath,
			ThumbPath: thumbPath,
			MimeType:  file.Header.Get("Content-Type"),
			FileSize:  file.Size,
			Status:    "approved",
		}
		if err := h.deps.Photos.Create(p); err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "veritabanı hatası"})
		}

		uploaded = append(uploaded, echo.Map{
			"id":        photoID,
			"thumb_url": "/static/" + thumbPath,
			"full_url":  "/static/" + fullPath,
		})
	}

	h.trackAsync(w.ID, guestID, "photo_upload", "", c)

	if len(uploaded) == 1 {
		return c.JSON(http.StatusCreated, uploaded[0])
	}
	return c.JSON(http.StatusCreated, echo.Map{
		"uploaded": uploaded,
		"count":    len(uploaded),
	})
}

// ─── Photo: List ──────────────────────────────────────────────

func (h *Handler) ListPhotos(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}

	guestID := c.QueryParam("guest_id")
	archived := c.QueryParam("archived")
	searchQuery := c.QueryParam("q")
	var photos []repo.Photo

	if archived == "1" || archived == "true" {
		photos, err = h.deps.Photos.ListArchivedByWedding(w.ID)
	} else if searchQuery != "" {
		photos, err = h.deps.Photos.SearchByTagOrQuery(w.ID, searchQuery)
	} else if guestID != "" {
		photos, err = h.deps.Photos.ListByGuest(w.ID, guestID)
	} else {
		photos, err = h.deps.Photos.ListByWedding(w.ID)
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "liste alınamadı"})
	}
	if photos == nil {
		photos = []repo.Photo{}
	}
	return c.JSON(http.StatusOK, photos)
}

// ─── Photo: Add Tag (UC-8, UC-21) ─────────────────────────────

func (h *Handler) AddPhotoTag(c echo.Context) error {
	photoID := c.Param("id")
	var req struct {
		Tag     string `json:"tag"`
		AddedBy string `json:"added_by"`
	}
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Tag) == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "etiket gerekli"})
	}
	if err := h.deps.Photos.AddTag(photoID, req.Tag, req.AddedBy); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "etiket eklenemedi"})
	}
	tags, _ := h.deps.Photos.ListTags(photoID)
	return c.JSON(http.StatusCreated, echo.Map{"id": photoID, "tags": tags})
}

// ─── Photo: Delete (Soft Delete) ──────────────────────────────

func (h *Handler) DeletePhoto(c echo.Context) error {
	phID := c.Get("photographer_id").(string)
	if err := h.deps.Photos.SoftDelete(c.Param("id"), phID); err != nil {
		if strings.Contains(err.Error(), "not_found") {
			return c.JSON(http.StatusForbidden, echo.Map{"error": "fotoğraf bulunamadı veya yetki yok"})
		}
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "silinemedi"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// ─── Photo: Restore (Undo Soft Delete) ────────────────────────

func (h *Handler) RestorePhoto(c echo.Context) error {
	phID := c.Get("photographer_id").(string)
	if err := h.deps.Photos.Restore(c.Param("id"), phID); err != nil {
		if strings.Contains(err.Error(), "not_found") {
			return c.JSON(http.StatusForbidden, echo.Map{"error": "fotoğraf bulunamadı veya yetki yok"})
		}
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "geri yüklenemedi"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// ─── Download ─────────────────────────────────────────────────

func (h *Handler) DownloadZip(c echo.Context) error {
	w, err := h.deps.Weddings.GetByCode(c.Param("code"))
	if err != nil || w == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "düğün bulunamadı"})
	}
	ids := c.QueryParam("ids")
	if ids == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "fotoğraf seçiniz"})
	}
	var urls []string
	for _, id := range strings.Split(ids, ",") {
		p, err := h.deps.Photos.GetByID(strings.TrimSpace(id))
		if err == nil && p != nil && !p.IsDeleted {
			urls = append(urls, p.FullURL)
		}
	}
	return c.JSON(http.StatusOK, echo.Map{
		"urls":  urls,
		"count": len(urls),
		"note":  "ZIP streaming Phase 2",
	})
}

// ─── Analytics ────────────────────────────────────────────────

func (h *Handler) TrackEvent(c echo.Context) error {
	var req struct {
		WeddingID string `json:"wedding_id"`
		EventType string `json:"event_type"`
		GuestID   string `json:"guest_id"`
		Ref       string `json:"ref"`
	}
	c.Bind(&req)
	h.trackAsync(req.WeddingID, req.GuestID, req.EventType, req.Ref, c)
	return c.JSON(http.StatusAccepted, echo.Map{"ok": true})
}

// ─── Private Helpers ──────────────────────────────────────────

func (h *Handler) trackAsync(weddingID, guestID, eventType, ref string, c echo.Context) {
	go func() {
		e := &repo.AnalyticsEvent{
			ID:        uuid.NewString(),
			WeddingID: weddingID,
			GuestID:   guestID,
			EventType: eventType,
			Ref:       ref,
			IPHash:    hashIP(c.RealIP()),
			UserAgent: c.Request().UserAgent(),
		}
		h.deps.Analytics.Track(e) //nolint:errcheck — fire-and-forget
	}()
}

func generateCode(name string) string {
	slug := strings.ToLower(name)
	var b strings.Builder
	lastHyphen := false
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastHyphen = false
		case r == ' ', r == '-', r == '_':
			if !lastHyphen && b.Len() > 0 {
				b.WriteRune('-')
				lastHyphen = true
			}
		default:
			tr := map[rune]rune{
				'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
			}
			if v, ok := tr[r]; ok {
				b.WriteRune(v)
				lastHyphen = false
			}
		}
	}
	base := strings.Trim(b.String(), "-")
	year := fmt.Sprintf("%d", time.Now().Year())
	return base + "-" + year + "-" + randomShort(4)
}

func generateNick(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastUnder := false
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnder = false
		case r == ' ', r == '-', r == '_':
			if !lastUnder && b.Len() > 0 {
				b.WriteRune('_')
				lastUnder = true
			}
		default:
			tr := map[rune]rune{
				'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
			}
			if v, ok := tr[r]; ok {
				b.WriteRune(v)
				lastUnder = false
			}
		}
	}
	res := strings.Trim(b.String(), "_")
	if res == "" {
		return "uye"
	}
	return res
}

func randomShort(n int) string {
	buf := make([]byte, n)
	rand.Read(buf)
	return hex.EncodeToString(buf)[:n]
}

func hashIP(ip string) string {
	h := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(h[:16])
}

func setSession(c echo.Context, value string) {
	ck := new(http.Cookie)
	ck.Name = "ph_session"
	ck.Value = value
	ck.HttpOnly = true
	ck.Path = "/"
	ck.MaxAge = 86400 * 30
	c.SetCookie(ck)
}

// isImageMagic checks the first bytes for known image signatures.
func isImageMagic(b []byte) bool {
	switch {
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF: // JPEG
		return true
	case len(b) >= 8 && string(b[1:4]) == "PNG":                        // PNG
		return true
	case len(b) >= 6 && (string(b[:6]) == "GIF87a" || string(b[:6]) == "GIF89a"): // GIF
		return true
	case len(b) >= 4 && string(b[:4]) == "RIFF":                        // WEBP
		return true
	case len(b) >= 4 && b[0] == 0x49 && b[1] == 0x49:                  // TIFF LE
		return true
	case len(b) >= 4 && b[0] == 0x4D && b[1] == 0x4D:                  // TIFF BE
		return true
	}
	return false
}
