package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"fotoyonetim/db"
)

func TestMainApp_RoutesAndFallback(t *testing.T) {
	conn, err := sql.Open("sqlite", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	defer conn.Close()

	if err := db.Migrate(conn); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	app, err := BuildApp(conn)
	if err != nil {
		t.Fatalf("build app error: %v", err)
	}

	// 1. Health check endpoint -> 200 OK
	{
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for /health, got %d", rec.Code)
		}
	}

	// 2. Root SPA endpoint -> 200 OK (serves index.html)
	{
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for /, got %d", rec.Code)
		}
	}

	// 3. Static ES Module /src/main.js -> 200 OK
	{
		req := httptest.NewRequest(http.MethodGet, "/src/main.js", nil)
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for /src/main.js, got %d", rec.Code)
		}
	}

	// 4. Zero-to-one Wedding Setup & Manager Login -> 201 & 200 OK
	{
		setupBody := `{"name":"Zeynep & Can","date":"2026-11-20","owner_name":"Emre Yılmaz","owner_role":"owner","owner_passcode":"4321","guest_passcode":"1111"}`
		reqSetup := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/setup", strings.NewReader(setupBody))
		reqSetup.Header.Set("Content-Type", "application/json")
		recSetup := httptest.NewRecorder()
		app.ServeHTTP(recSetup, reqSetup)

		if recSetup.Code != http.StatusCreated {
			t.Fatalf("expected 201 for /api/v1/weddings/setup, got %d, body: %s", recSetup.Code, recSetup.Body.String())
		}

		// Manager login by slug prefix "zeynep-can"
		loginBody := `{"passcode":"4321"}`
		reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/login", strings.NewReader(loginBody))
		reqLogin.Header.Set("Content-Type", "application/json")
		recLogin := httptest.NewRecorder()
		app.ServeHTTP(recLogin, reqLogin)

		if recLogin.Code != http.StatusOK {
			t.Fatalf("expected 200 for manager login by slug prefix, got %d, body: %s", recLogin.Code, recLogin.Body.String())
		}
	}

	// 5. Share Link & QR Attribution Ledger ("Who gave to whom, when, open & join")
	{
		shareBody := `{"id":"sl-test-99","share_type":"qr","channel":"masa-qr","shared_by_name":"Emre Yılmaz","shared_by_role":"owner","shared_to_name":"Masa 7"}`
		reqShare := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/shares", strings.NewReader(shareBody))
		reqShare.Header.Set("Content-Type", "application/json")
		recShare := httptest.NewRecorder()
		app.ServeHTTP(recShare, reqShare)

		if recShare.Code != http.StatusCreated {
			t.Fatalf("expected 201 for creating share_link, got %d, body: %s", recShare.Code, recShare.Body.String())
		}

		// Open share link
		openBody := `{"opened_by":"Selin Kaya"}`
		reqOpen := httptest.NewRequest(http.MethodPost, "/api/v1/shares/sl-test-99/open", strings.NewReader(openBody))
		reqOpen.Header.Set("Content-Type", "application/json")
		recOpen := httptest.NewRecorder()
		app.ServeHTTP(recOpen, reqOpen)

		if recOpen.Code != http.StatusOK {
			t.Fatalf("expected 200 for opening share_link, got %d, body: %s", recOpen.Code, recOpen.Body.String())
		}

		// Guest joins using share_token_id -> automatically attributes shared_by & increments join_count
		guestBody := `{"name":"Selin Kaya","share_token_id":"sl-test-99","consent_given":true}`
		reqGuest := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/guests", strings.NewReader(guestBody))
		reqGuest.Header.Set("Content-Type", "application/json")
		recGuest := httptest.NewRecorder()
		app.ServeHTTP(recGuest, reqGuest)

		if recGuest.Code != http.StatusCreated {
			t.Fatalf("expected 201 for guest join via share token, got %d, body: %s", recGuest.Code, recGuest.Body.String())
		}
		if !strings.Contains(recGuest.Body.String(), `"shared_by":"Emre Yılmaz"`) {
			t.Errorf("expected guest response to contain shared_by Emre Yılmaz, got: %s", recGuest.Body.String())
		}
	}

	// 6. SPA client-side route fallback (single and multi-segment) -> 200 OK (serves index.html)
	{
		req := httptest.NewRequest(http.MethodGet, "/elif-can-2026-a1b2", nil)
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for SPA fallback /elif-can-2026-a1b2, got %d", rec.Code)
		}

		reqSub := httptest.NewRequest(http.MethodGet, "/elif-can-2026-a1b2/yonetim", nil)
		recSub := httptest.NewRecorder()
		app.ServeHTTP(recSub, reqSub)

		if recSub.Code != http.StatusOK {
			t.Fatalf("expected 200 for multi-segment SPA fallback /elif-can-2026-a1b2/yonetim, got %d", recSub.Code)
		}

		// Relative ES module & CSS resolution under sub-routes (prevents Splash screen freeze)
		reqSubJs := httptest.NewRequest(http.MethodGet, "/elif-can-2026-a1b2/src/main.js", nil)
		recSubJs := httptest.NewRecorder()
		app.ServeHTTP(recSubJs, reqSubJs)
		if recSubJs.Code != http.StatusOK || !strings.Contains(recSubJs.Body.String(), "bootstrap") {
			t.Fatalf("expected 200 and JS content for /elif-can-2026-a1b2/src/main.js, got %d", recSubJs.Code)
		}

		reqSubCss := httptest.NewRequest(http.MethodGet, "/elif-can-2026-a1b2/style.css", nil)
		recSubCss := httptest.NewRecorder()
		app.ServeHTTP(recSubCss, reqSubCss)
		if recSubCss.Code != http.StatusOK || !strings.Contains(recSubCss.Body.String(), "--gold") {
			t.Fatalf("expected 200 and CSS content for /elif-can-2026-a1b2/style.css, got %d", recSubCss.Code)
		}
	}

	// 7. RBAC Roles & Responsibilities Table + RequireWeddingPermission Middleware + Anti-Hack WAF
	{
		// A. Login as Wedding Owner (Damat) to receive signed HMAC RBAC token
		loginBody := `{"passcode":"4321","name":"Emre Yılmaz","role":"groom_owner"}`
		reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/login", strings.NewReader(loginBody))
		reqLogin.Header.Set("Content-Type", "application/json")
		reqLogin.RemoteAddr = "10.0.0.10:1234"
		recLogin := httptest.NewRecorder()
		app.ServeHTTP(recLogin, reqLogin)
		if recLogin.Code != http.StatusOK {
			t.Fatalf("expected 200 for groom_owner login, got %d: %s", recLogin.Code, recLogin.Body.String())
		}
		// Extract member_token from cookies
		var ownerToken string
		for _, ck := range recLogin.Result().Cookies() {
			if ck.Name == "fy_member_token" {
				ownerToken = ck.Value
			}
		}
		if ownerToken == "" {
			t.Fatalf("expected signed fy_member_token cookie on manager login")
		}

		// B. Owner promotes a guest ("Ahmet Yılmaz") to Yetkili Üye / Moderatör ("member_manager") with PIN "7788"
		promoteBody := `{"person_name":"Ahmet Yılmaz","role":"member_manager","passcode":"7788"}`
		reqPromote := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/members", strings.NewReader(promoteBody))
		reqPromote.Header.Set("Content-Type", "application/json")
		reqPromote.Header.Set("X-Member-Token", ownerToken)
		reqPromote.RemoteAddr = "10.0.0.10:1234"
		recPromote := httptest.NewRecorder()
		app.ServeHTTP(recPromote, reqPromote)
		if recPromote.Code != http.StatusOK {
			t.Fatalf("expected 200 when owner assigns member_manager role, got %d: %s", recPromote.Code, recPromote.Body.String())
		}

		// C. Promoted Member ("Ahmet Yılmaz") logs in with their own PIN ("7788") -> 200 OK + receives member_manager token
		memberLoginBody := `{"passcode":"7788","name":"Ahmet Yılmaz","role":"member_manager"}`
		reqMemLogin := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/login", strings.NewReader(memberLoginBody))
		reqMemLogin.Header.Set("Content-Type", "application/json")
		reqMemLogin.RemoteAddr = "10.0.0.20:1234"
		recMemLogin := httptest.NewRecorder()
		app.ServeHTTP(recMemLogin, reqMemLogin)
		if recMemLogin.Code != http.StatusOK {
			t.Fatalf("expected 200 for promoted member_manager login with PIN 7788, got %d: %s", recMemLogin.Code, recMemLogin.Body.String())
		}
		var memberManagerToken string
		for _, ck := range recMemLogin.Result().Cookies() {
			if ck.Name == "fy_member_token" {
				memberManagerToken = ck.Value
			}
		}

		// D. Promoted member_manager tries to assign roles (can_assign_roles == false) -> blocked 403 Forbidden by RequireWeddingPermission
		reqEscalate := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/members", strings.NewReader(`{"person_name":"Selin Kaya","role":"owner"}`))
		reqEscalate.Header.Set("Content-Type", "application/json")
		reqEscalate.Header.Set("X-Member-Token", memberManagerToken)
		reqEscalate.RemoteAddr = "10.0.0.20:1234"
		recEscalate := httptest.NewRecorder()
		app.ServeHTTP(recEscalate, reqEscalate)
		if recEscalate.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when member_manager attempts privilege escalation, got %d", recEscalate.Code)
		}

		// E. Forged / Tampered X-Member-Token -> blocked 401 Unauthorized by AntiHackMiddleware
		reqForged := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/zeynep-can/members", nil)
		reqForged.Header.Set("X-Member-Token", ownerToken+"tampered")
		reqForged.RemoteAddr = "10.0.0.30:1234"
		recForged := httptest.NewRecorder()
		app.ServeHTTP(recForged, reqForged)
		if recForged.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized for forged X-Member-Token, got %d", recForged.Code)
		}

		// F. SQL Injection / XSS Attack Payload -> blocked 403 Forbidden by AntiHackMiddleware
		reqHack := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/zeynep-can/guests", strings.NewReader(`{"name":"<script>alert(1)</script>","ref":"damat"}`))
		reqHack.Header.Set("Content-Type", "application/json")
		reqHack.RemoteAddr = "10.0.0.40:1234"
		recHack := httptest.NewRecorder()
		app.ServeHTTP(recHack, reqHack)
		if recHack.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden from AntiHackMiddleware for XSS payload, got %d", recHack.Code)
		}
	}
}
