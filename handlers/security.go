package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"

	"fotoyonetim/db/repo"
)

// ─── Signed RBAC Token Engine (HMAC-SHA256, Tamper-Proof) ───────

type MemberTokenClaims struct {
	MemberID          string `json:"mid"`
	WeddingID         string `json:"wid"`
	WeddingCode       string `json:"wcode"`
	PersonName        string `json:"name"`
	Nick              string `json:"nick"`
	Role              string `json:"role"`
	RoleTitle         string `json:"title"`
	CanManageSettings bool   `json:"cm"`
	CanAssignRoles    bool   `json:"ca"`
	CanModeratePhotos bool   `json:"cmod"`
	CanShareLinks     bool   `json:"cs"`
	CanPrintExport    bool   `json:"cp"`
	CanUpload         bool   `json:"cu"`
	IssuedAt          int64  `json:"iat"`
	ExpiresAt         int64  `json:"exp"`
}

func tokenSecret() []byte {
	sec := os.Getenv("FY_HMAC_SECRET")
	if sec == "" {
		sec = "fy-hardened-rbac-secret-2026-v1-do-not-expose"
	}
	return []byte(sec)
}

// SignMemberToken produces a tamper-proof HMAC-SHA256 signed token for a WeddingMember.
func SignMemberToken(m *repo.WeddingMember) string {
	now := time.Now().Unix()
	claims := MemberTokenClaims{
		MemberID:          m.ID,
		WeddingID:         m.WeddingID,
		WeddingCode:       m.WeddingCode,
		PersonName:        m.PersonName,
		Nick:              m.Nick,
		Role:              m.Role,
		RoleTitle:         m.RoleTitle,
		CanManageSettings: m.CanManageSettings,
		CanAssignRoles:    m.CanAssignRoles,
		CanModeratePhotos: m.CanModeratePhotos,
		CanShareLinks:     m.CanShareLinks,
		CanPrintExport:    m.CanPrintExport,
		CanUpload:         m.CanUpload,
		IssuedAt:          now,
		ExpiresAt:         now + 86400*30,
	}
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, tokenSecret())
	mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

// VerifyMemberToken validates the HMAC-SHA256 signature and expiration in constant time.
func VerifyMemberToken(token string) (*MemberTokenClaims, bool) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, false
	}
	mac := hmac.New(sha256.New, tokenSecret())
	mac.Write([]byte(parts[0]))
	expectedSig := mac.Sum(nil)

	providedSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(expectedSig, providedSig) {
		return nil, false
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, false
	}
	var claims MemberTokenClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		return nil, false
	}
	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return nil, false
	}
	return &claims, true
}

func setMemberSessionCookie(c echo.Context, token string) {
	ck := new(http.Cookie)
	ck.Name = "fy_member_token"
	ck.Value = token
	ck.HttpOnly = true
	ck.SameSite = http.SameSiteLaxMode
	ck.Path = "/"
	ck.MaxAge = 86400 * 30
	c.SetCookie(ck)
}

func extractMemberToken(c echo.Context) string {
	if h := c.Request().Header.Get("X-Member-Token"); h != "" {
		return strings.TrimSpace(h)
	}
	auth := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(auth, "Member ") {
		return strings.TrimSpace(strings.TrimPrefix(auth, "Member "))
	}
	if strings.HasPrefix(auth, "Bearer ") {
		cand := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if strings.Contains(cand, ".") {
			return cand
		}
	}
	if ck, err := c.Cookie("fy_member_token"); err == nil && ck.Value != "" {
		return ck.Value
	}
	return ""
}

// ─── 1. Anti-Hack / WAF / Brute-Force Shield Middleware ────────

type ipStrikeState struct {
	strikes      int
	authFailures int
	blockedUntil time.Time
	lastReason   string
}

var (
	wafMu     sync.Mutex
	wafIpMap  = make(map[string]*ipStrikeState)
	wafPayloads = []string{
		"<script", "javascript:", "onerror=", "onload=",
		"union select", "drop table", "insert into ", "delete from ", "update weddings set",
		"' or '1'='1", "\" or \"1\"=\"1", "1=1--", "../", "..\\", "/etc/passwd", "cmd.exe", "powershell",
	}
)

// RecordAuthFailure increments brute-force failure counter for an IP; auto-blocks after 8 failed PIN attempts.
func (h *Handler) RecordAuthFailure(c echo.Context, reason string) {
	ipHash := hashIP(c.RealIP())
	wafMu.Lock()
	st, ok := wafIpMap[ipHash]
	if !ok {
		st = &ipStrikeState{}
		wafIpMap[ipHash] = st
	}
	st.authFailures++
	st.lastReason = reason
	if st.authFailures >= 8 {
		st.blockedUntil = time.Now().Add(15 * time.Minute)
	}
	wafMu.Unlock()
	h.trackAsync("", "", "security_auth_failure", reason, c)
}

// RecordSecurityStrike logs an exploit/tampering attempt and immediately blocks repeat offenders.
func (h *Handler) RecordSecurityStrike(c echo.Context, reason string) {
	ipHash := hashIP(c.RealIP())
	wafMu.Lock()
	st, ok := wafIpMap[ipHash]
	if !ok {
		st = &ipStrikeState{}
		wafIpMap[ipHash] = st
	}
	st.strikes++
	st.lastReason = reason
	if st.strikes >= 2 {
		st.blockedUntil = time.Now().Add(30 * time.Minute)
	}
	wafMu.Unlock()
	h.trackAsync("", "", "security_waf_strike", reason, c)
}

// AntiHackMiddleware inspects headers, URL, query params, and JSON payloads for injection,
// path traversal, token forgery, and brute-force lockouts, and sets hardened security headers.
func (h *Handler) AntiHackMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Hardened HTTP Security Headers
		resH := c.Response().Header()
		resH.Set("X-Content-Type-Options", "nosniff")
		resH.Set("X-Frame-Options", "DENY")
		resH.Set("X-XSS-Protection", "1; mode=block")
		resH.Set("Referrer-Policy", "strict-origin-when-cross-origin")

		ipHash := hashIP(c.RealIP())

		// 1. Check active IP quarantine
		wafMu.Lock()
		st := wafIpMap[ipHash]
		if st != nil && time.Now().Before(st.blockedUntil) {
			reason := st.lastReason
			wafMu.Unlock()
			return c.JSON(http.StatusTooManyRequests, echo.Map{
				"error":   "güvenlik kalkanı: çok fazla şüpheli deneme nedeniyle erişiminiz geçici olarak kısıtlandı",
				"blocked": true,
				"reason":  reason,
			})
		}
		wafMu.Unlock()

		// 2. Inspect URL Path & Query String for SQLi / XSS / Traversal
		rawTarget := strings.ToLower(c.Request().URL.Path + "?" + c.Request().URL.RawQuery)
		for _, bad := range wafPayloads {
			if strings.Contains(rawTarget, bad) {
				h.RecordSecurityStrike(c, "malicious_url_payload:"+bad)
				return c.JSON(http.StatusForbidden, echo.Map{
					"error":   "güvenlik duvarı (WAF): zararlı istek paterni engellendi",
					"blocked": true,
				})
			}
		}

		// 3. Inspect JSON Body (if application/json) without consuming the stream
		ct := strings.ToLower(c.Request().Header.Get("Content-Type"))
		if strings.Contains(ct, "application/json") && c.Request().Body != nil {
			bodyBytes, err := io.ReadAll(io.LimitReader(c.Request().Body, 1024*1024))
			if err == nil {
				c.Request().Body = io.NopCloser(strings.NewReader(string(bodyBytes)))
				lowerBody := strings.ToLower(string(bodyBytes))
				for _, bad := range wafPayloads {
					if strings.Contains(lowerBody, bad) {
						h.RecordSecurityStrike(c, "malicious_body_payload:"+bad)
						return c.JSON(http.StatusForbidden, echo.Map{
							"error":   "güvenlik duvarı (WAF): zararlı veri içeriği engellendi",
							"blocked": true,
						})
					}
				}
			}
		}

		// 4. Detect forged X-Member-Token if supplied
		if rawTok := c.Request().Header.Get("X-Member-Token"); rawTok != "" {
			if _, valid := VerifyMemberToken(rawTok); !valid {
				h.RecordSecurityStrike(c, "forged_member_token")
				return c.JSON(http.StatusUnauthorized, echo.Map{
					"error":   "güvenlik ihlali: geçersiz veya değiştirilmiş yetki imzası engellendi",
					"blocked": true,
				})
			}
		}

		return next(c)
	}
}

// ─── 2. Granular RBAC Permission Middleware ────────────────────

// RequireWeddingPermission enforces that the caller holds a valid, cryptographically signed
// member token (or photographer session) AND has the specific permission flag in the database.
func (h *Handler) RequireWeddingPermission(perm string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// A. Check if authenticated via Photographer Bearer/Cookie token
			phToken := strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer ")
			if phToken != "" && !strings.Contains(phToken, ".") {
				if ph, err := h.deps.Photographers.GetByID(phToken); err == nil && ph != nil {
					c.Set("photographer_id", ph.ID)
					return next(c)
				}
			}
			if ck, err := c.Cookie("ph_session"); err == nil && ck.Value != "" {
				if ph, err := h.deps.Photographers.GetByID(ck.Value); err == nil && ph != nil {
					c.Set("photographer_id", ph.ID)
					return next(c)
				}
			}

			// B. Check signed Member RBAC Token
			rawTok := extractMemberToken(c)
			if rawTok == "" {
				return c.JSON(http.StatusUnauthorized, echo.Map{
					"error": "bu işlem için yetkili oturum imzası gereklidir",
				})
			}

			claims, ok := VerifyMemberToken(rawTok)
			if !ok {
				h.RecordSecurityStrike(c, "invalid_rbac_signature")
				return c.JSON(http.StatusUnauthorized, echo.Map{
					"error": "geçersiz veya süresi dolmuş yetki imzası",
				})
			}

			// Re-verify live permissions from wedding_members table if repo is wired
			hasPerm := checkClaimPermission(claims, perm)
			if h.deps.Members != nil && claims.MemberID != "" {
				if liveMember, err := h.deps.Members.GetByID(claims.MemberID); err == nil && liveMember != nil {
					if !liveMember.IsActive {
						return c.JSON(http.StatusForbidden, echo.Map{"error": "bu düğündeki göreviniz iptal edilmiş"})
					}
					hasPerm = checkMemberPermission(liveMember, perm)
				}
			}

			if !hasPerm {
				h.RecordSecurityStrike(c, "unauthorized_permission_attempt:"+perm)
				return c.JSON(http.StatusForbidden, echo.Map{
					"error": "bu işlem için görev ve sorumluluk yetkiniz bulunmuyor (" + perm + ")",
				})
			}

			c.Set("member_claims", claims)
			return next(c)
		}
	}
}

func checkClaimPermission(cl *MemberTokenClaims, perm string) bool {
	switch perm {
	case "can_manage_settings":
		return cl.CanManageSettings
	case "can_assign_roles":
		return cl.CanAssignRoles
	case "can_moderate_photos":
		return cl.CanModeratePhotos
	case "can_share_links":
		return cl.CanShareLinks
	case "can_print_export":
		return cl.CanPrintExport
	case "can_upload":
		return cl.CanUpload
	default:
		return false
	}
}

func checkMemberPermission(m *repo.WeddingMember, perm string) bool {
	switch perm {
	case "can_manage_settings":
		return m.CanManageSettings
	case "can_assign_roles":
		return m.CanAssignRoles
	case "can_moderate_photos":
		return m.CanModeratePhotos
	case "can_share_links":
		return m.CanShareLinks
	case "can_print_export":
		return m.CanPrintExport
	case "can_upload":
		return m.CanUpload
	default:
		return false
	}
}

// Helper to hash member PINs
func hashPin(pin string) string {
	clean := strings.TrimSpace(pin)
	if clean == "" {
		return ""
	}
	sum := sha256.Sum256([]byte("fy_pin_salt::" + clean))
	return hex.EncodeToString(sum[:16])
}

