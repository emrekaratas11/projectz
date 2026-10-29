package handlers_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	_ "modernc.org/sqlite"

	"fotoyonetim/db"
	"fotoyonetim/db/repo"
	"fotoyonetim/handlers"
)

// setupTestEnv sets up an in-memory SQLite database, runs migrations, and wires handlers.
func setupTestEnv(t *testing.T) (*echo.Echo, *handlers.Handler) {
	t.Helper()

	conn, err := sql.Open("sqlite", "file::memory:?mode=memory&cache=shared&_foreign_keys=on")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)

	if err := db.Migrate(conn); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	phRepo, err := repo.NewPhotographerRepo(conn)
	if err != nil {
		t.Fatalf("photographer repo: %v", err)
	}
	wRepo, err := repo.NewWeddingRepo(conn)
	if err != nil {
		t.Fatalf("wedding repo: %v", err)
	}
	gRepo, err := repo.NewGuestRepo(conn)
	if err != nil {
		t.Fatalf("guest repo: %v", err)
	}
	pRepo, err := repo.NewPhotoRepo(conn)
	if err != nil {
		t.Fatalf("photo repo: %v", err)
	}
	aRepo, err := repo.NewAnalyticsRepo(conn)
	if err != nil {
		t.Fatalf("analytics repo: %v", err)
	}

	h := handlers.New(handlers.Deps{
		Photographers: phRepo,
		Weddings:      wRepo,
		Guests:        gRepo,
		Photos:        pRepo,
		Analytics:     aRepo,
	})

	e := echo.New()
	return e, h
}

// ─── 1. Photographer Registration & Login ─────────────────────

func TestPhotographer_RegisterAndLogin(t *testing.T) {
	e, h := setupTestEnv(t)

	// A. Missing fields -> 400 Bad Request
	{
		reqBody := `{"name":"","email":"","password":""}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.RegisterPhotographer(c); err != nil {
			t.Fatalf("Register error: %v", err)
		}
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for empty fields, got %d", rec.Code)
		}
	}

	// B. Valid registration -> 201 Created
	var token string
	{
		reqBody := `{"name":"Mehmet Usta","email":"mehmet@studyo.com","password":"secretpassword123"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.RegisterPhotographer(c); err != nil {
			t.Fatalf("Register error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d, body: %s", rec.Code, rec.Body.String())
		}

		var res map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("json unmarshal: %v", err)
		}
		if res["email"] != "mehmet@studyo.com" {
			t.Errorf("expected email mehmet@studyo.com, got %v", res["email"])
		}
		token = res["token"].(string)
		if token == "" {
			t.Errorf("expected non-empty token")
		}
	}

	// C. Duplicate email registration -> 409 Conflict
	{
		reqBody := `{"name":"Mehmet Usta 2","email":"mehmet@studyo.com","password":"otherpassword"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.RegisterPhotographer(c); err != nil {
			t.Fatalf("Register duplicate error: %v", err)
		}
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409 Conflict for duplicate email, got %d", rec.Code)
		}
	}

	// D. Login with wrong password -> 401 Unauthorized
	{
		reqBody := `{"email":"mehmet@studyo.com","password":"wrongpassword"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/login", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.LoginPhotographer(c); err != nil {
			t.Fatalf("Login error: %v", err)
		}
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for wrong password, got %d", rec.Code)
		}
	}

	// E. Login with non-existent email -> 401 Unauthorized
	{
		reqBody := `{"email":"nobody@studyo.com","password":"secretpassword123"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/login", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.LoginPhotographer(c); err != nil {
			t.Fatalf("Login error: %v", err)
		}
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for non-existent user, got %d", rec.Code)
		}
	}

	// F. Login with valid credentials -> 200 OK + cookie set
	{
		reqBody := `{"email":"mehmet@studyo.com","password":"secretpassword123"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/login", strings.NewReader(reqBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		if err := h.LoginPhotographer(c); err != nil {
			t.Fatalf("Login error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		cookies := rec.Result().Cookies()
		var foundCookie bool
		for _, ck := range cookies {
			if ck.Name == "ph_session" && ck.Value == token {
				foundCookie = true
			}
		}
		if !foundCookie {
			t.Errorf("expected ph_session cookie matching token")
		}
	}
}

// ─── 2. Wedding Creation, Listing, and Public Lookup ──────────

func TestWedding_CreateListAndLookup(t *testing.T) {
	e, h := setupTestEnv(t)

	// Create a photographer first
	regBody := `{"name":"Ayşe Foto","email":"ayse@foto.com","password":"pass123456"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(regBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	_ = h.RegisterPhotographer(e.NewContext(req, rec))

	var phRes map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &phRes)
	token := phRes["token"].(string)

	// A. Create wedding without auth -> 401 Unauthorized via middleware
	{
		createBody := `{"name":"Elif & Can Düğünü","date":"2026-09-15"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/weddings", strings.NewReader(createBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		handlerWithAuth := h.AuthPhotographer(h.CreateWedding)
		_ = handlerWithAuth(c)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 without auth, got %d", rec.Code)
		}
	}

	// B. Create wedding with valid auth -> 201 Created
	var weddingCode string
	var weddingID string
	{
		createBody := `{"name":"Elif & Can Düğünü","date":"2026-09-15"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/weddings", strings.NewReader(createBody))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		handlerWithAuth := h.AuthPhotographer(h.CreateWedding)
		if err := handlerWithAuth(c); err != nil {
			t.Fatalf("CreateWedding error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d, body: %s", rec.Code, rec.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		weddingCode = res["code"].(string)
		weddingID = res["id"].(string)
		passcode := res["passcode"].(string)

		if weddingCode == "" || len(passcode) != 6 {
			t.Errorf("expected valid slug code and 6-char passcode, got code=%s pass=%s", weddingCode, passcode)
		}
	}

	// C. List weddings for photographer -> 200 OK
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/weddings", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		handlerWithAuth := h.AuthPhotographer(h.ListWeddings)
		_ = handlerWithAuth(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var list []repo.Wedding
		_ = json.Unmarshal(rec.Body.Bytes(), &list)
		if len(list) != 1 || list[0].Code != weddingCode {
			t.Errorf("expected 1 wedding with code %s, got %v", weddingCode, list)
		}
	}

	// D. Public Get Wedding by code -> 200 OK (omits owner_passcode)
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+weddingCode, nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("code")
		c.SetParamValues(weddingCode)

		_ = h.GetWedding(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for public wedding lookup, got %d, body: %s, weddingCode: %s", rec.Code, rec.Body.String(), weddingCode)
		}

		var pub map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &pub)
		if pub["code"] != weddingCode || pub["owner_passcode"] != nil {
			t.Errorf("public wedding lookup leaked passcode or wrong code: %v", pub)
		}
	}

	// E. Public Get Non-existent Wedding -> 404 Not Found
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/nonexistent-code", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("code")
		c.SetParamValues("nonexistent-code")

		_ = h.GetWedding(c)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for non-existent wedding, got %d", rec.Code)
		}
	}

	// F. Deactivate wedding -> DELETE /api/v1/weddings/:id
	{
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/weddings/"+weddingID, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("id")
		c.SetParamValues(weddingID)

		handlerWithAuth := h.AuthPhotographer(h.DeleteWedding)
		_ = handlerWithAuth(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for deactivation, got %d", rec.Code)
		}

		// Now querying deactivated wedding gives 403 Forbidden
		reqPub := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+weddingCode, nil)
		recPub := httptest.NewRecorder()
		cPub := e.NewContext(reqPub, recPub)
		cPub.SetParamNames("code")
		cPub.SetParamValues(weddingCode)

		_ = h.GetWedding(cPub)
		if recPub.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for deactivated wedding, got %d", recPub.Code)
		}
	}
}

// ─── 3. Guest Join & Dynamic Link Referral Attribution ────────

func TestGuest_JoinAndReferralAttribution(t *testing.T) {
	e, h := setupTestEnv(t)

	// Register photographer & create active wedding
	regBody := `{"name":"Foto Kemal","email":"kemal@foto.com","password":"pass123456"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(regBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	_ = h.RegisterPhotographer(e.NewContext(req, rec))
	var phRes map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &phRes)
	token := phRes["token"].(string)

	createBody := `{"name":"Zeynep & Ali","date":"2026-10-10"}`
	reqW := httptest.NewRequest(http.MethodPost, "/api/v1/weddings", strings.NewReader(createBody))
	reqW.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	reqW.Header.Set("Authorization", "Bearer "+token)
	recW := httptest.NewRecorder()
	_ = h.AuthPhotographer(h.CreateWedding)(e.NewContext(reqW, recW))
	if recW.Code != http.StatusCreated {
		t.Fatalf("CreateWedding failed: %d, body: %s", recW.Code, recW.Body.String())
	}
	var wRes map[string]interface{}
	_ = json.Unmarshal(recW.Body.Bytes(), &wRes)
	code := wRes["code"].(string)
	t.Logf("Created wedding with code: %s", code)

	// A. Guest joins via Bride link (ref=gelin) with consent (UC-11, UC-20)
	{
		guestBody := `{"name":"Selin Yılmaz","phone":"+905551234567","ref":"gelin","consent_given":true}`
		reqG := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/guests", strings.NewReader(guestBody))
		reqG.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		recG := httptest.NewRecorder()
		cG := e.NewContext(reqG, recG)
		cG.SetParamNames("code")
		cG.SetParamValues(code)

		_ = h.CreateGuest(cG)
		if recG.Code != http.StatusCreated {
			t.Fatalf("expected 201 for guest join, got %d, body: %s", recG.Code, recG.Body.String())
		}

		var gRes map[string]interface{}
		_ = json.Unmarshal(recG.Body.Bytes(), &gRes)
		if gRes["name"] != "Selin Yılmaz" {
			t.Errorf("expected Selin Yılmaz, got %v", gRes["name"])
		}
	}

	// B. Guest joins via Table QR (ref=masa-qr) without phone
	{
		guestBody := `{"name":"Ahmet Demir","ref":"masa-qr","consent_given":true}`
		reqG := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/guests", strings.NewReader(guestBody))
		reqG.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		recG := httptest.NewRecorder()
		cG := e.NewContext(reqG, recG)
		cG.SetParamNames("code")
		cG.SetParamValues(code)

		_ = h.CreateGuest(cG)
		if recG.Code != http.StatusCreated {
			t.Fatalf("expected 201 for guest join, got %d", recG.Code)
		}
	}

	// C. Photographer lists guests -> verify attribution badges
	{
		reqList := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+code+"/guests", nil)
		reqList.Header.Set("Authorization", "Bearer "+token)
		recList := httptest.NewRecorder()
		cList := e.NewContext(reqList, recList)
		cList.SetParamNames("code")
		cList.SetParamValues(code)

		_ = h.AuthPhotographer(h.ListGuests)(cList)
		if recList.Code != http.StatusOK {
			t.Fatalf("expected 200 for guest list, got %d", recList.Code)
		}

		var guests []repo.Guest
		_ = json.Unmarshal(recList.Body.Bytes(), &guests)
		if len(guests) != 2 {
			t.Fatalf("expected 2 guests, got %d", len(guests))
		}
		if guests[0].Ref != "gelin" && guests[1].Ref != "gelin" {
			t.Errorf("expected referral 'gelin' in guests list")
		}
	}
}

// ─── 4. Photo Upload, Magic Bytes Validation & 50 Limit ────────

func TestPhoto_UploadMagicBytesAndLimits(t *testing.T) {
	e, h := setupTestEnv(t)

	// Setup wedding
	regBody := `{"name":"Foto Selim","email":"selim@foto.com","password":"pass123456"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(regBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	_ = h.RegisterPhotographer(e.NewContext(req, rec))
	var phRes map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &phRes)
	token := phRes["token"].(string)

	createBody := `{"name":"Bahar & Murat","date":"2026-08-20"}`
	reqW := httptest.NewRequest(http.MethodPost, "/api/v1/weddings", strings.NewReader(createBody))
	reqW.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	reqW.Header.Set("Authorization", "Bearer "+token)
	recW := httptest.NewRecorder()
	_ = h.AuthPhotographer(h.CreateWedding)(e.NewContext(reqW, recW))
	if recW.Code != http.StatusCreated {
		t.Fatalf("CreateWedding failed: %d, body: %s", recW.Code, recW.Body.String())
	}
	var wRes map[string]interface{}
	_ = json.Unmarshal(recW.Body.Bytes(), &wRes)
	code := wRes["code"].(string)
	t.Logf("Created wedding with code: %s", code)

	// Clean up any test upload directories when test finishes
	defer func() {
		_ = os.RemoveAll("uploads")
		_ = os.RemoveAll("thumbs")
	}()

	// Helper to create multipart request
	createMultipartRequest := func(field, filename string, content []byte) (*http.Request, string) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile(field, filename)
		_, _ = part.Write(content)
		_ = writer.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/photos", body)
		req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
		return req, writer.FormDataContentType()
	}

	// A. Fake image / text file -> rejected by Magic Bytes check
	{
		fakeFile := []byte("This is plain text pretending to be a photo. Not an image!")
		reqUpload, _ := createMultipartRequest("photo", "fake.jpg", fakeFile)
		recUpload := httptest.NewRecorder()
		c := e.NewContext(reqUpload, recUpload)
		c.SetParamNames("code")
		c.SetParamValues(code)

		_ = h.UploadPhoto(c)
		if recUpload.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for fake image, got %d, body: %s", recUpload.Code, recUpload.Body.String())
		}
	}

	// B. Valid JPEG magic bytes (\xFF\xD8\xFF...) -> 201 Created (UC-1, UC-9)
	var photoID string
	{
		// Real JPEG header: FF D8 FF E0 00 10 4A 46 49 46 00 01
		jpegData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xAA, 0xBB, 0xCC}
		reqUpload, _ := createMultipartRequest("photo", "camera_shot.jpg", jpegData)
		recUpload := httptest.NewRecorder()
		c := e.NewContext(reqUpload, recUpload)
		c.SetParamNames("code")
		c.SetParamValues(code)

		_ = h.UploadPhoto(c)
		if recUpload.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for valid JPEG, got %d, body: %s", recUpload.Code, recUpload.Body.String())
		}

		var res map[string]interface{}
		_ = json.Unmarshal(recUpload.Body.Bytes(), &res)
		photoID = res["id"].(string)
		if photoID == "" || res["full_url"] == "" || res["thumb_url"] == "" {
			t.Errorf("expected photo id, full_url, and thumb_url in response: %v", res)
		}
	}

	// C. Valid PNG magic bytes (\x89PNG\r\n\x1a\n...) -> 201 Created
	{
		pngData := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0x00, 0x00, 0x00, 0x0D}
		reqUpload, _ := createMultipartRequest("photo", "invite.png", pngData)
		recUpload := httptest.NewRecorder()
		c := e.NewContext(reqUpload, recUpload)
		c.SetParamNames("code")
		c.SetParamValues(code)

		_ = h.UploadPhoto(c)
		if recUpload.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for valid PNG, got %d, body: %s", recUpload.Code, recUpload.Body.String())
		}
	}

	// D. UC-18: Exceeding 50 photos upload limit in batch -> 400 Bad Request
	{
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		jpegData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}

		// Add 51 files to trigger limit
		for i := 0; i < 51; i++ {
			h := make(textproto.MIMEHeader)
			h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="photos"; filename="photo_%d.jpg"`, i))
			h.Set("Content-Type", "image/jpeg")
			part, _ := writer.CreatePart(h)
			_, _ = io.Copy(part, bytes.NewReader(jpegData))
		}
		_ = writer.Close()

		reqBatch := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/photos", body)
		reqBatch.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
		recBatch := httptest.NewRecorder()
		cBatch := e.NewContext(reqBatch, recBatch)
		cBatch.SetParamNames("code")
		cBatch.SetParamValues(code)

		_ = h.UploadPhoto(cBatch)
		if recBatch.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for exceeding 50 photo limit, got %d", recBatch.Code)
		}
	}

	// E. Multi-photo batch upload with 3 valid photos -> 201 Created
	{
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		jpegData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}

		for i := 0; i < 3; i++ {
			h := make(textproto.MIMEHeader)
			h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="photos"; filename="batch_%d.jpg"`, i))
			h.Set("Content-Type", "image/jpeg")
			part, _ := writer.CreatePart(h)
			_, _ = io.Copy(part, bytes.NewReader(jpegData))
		}
		_ = writer.Close()

		reqBatch := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/photos", body)
		reqBatch.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
		recBatch := httptest.NewRecorder()
		cBatch := e.NewContext(reqBatch, recBatch)
		cBatch.SetParamNames("code")
		cBatch.SetParamValues(code)

		_ = h.UploadPhoto(cBatch)
		if recBatch.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for 3-photo batch, got %d", recBatch.Code)
		}

		var res map[string]interface{}
		_ = json.Unmarshal(recBatch.Body.Bytes(), &res)
		if res["count"] == nil || int(res["count"].(float64)) != 3 {
			t.Errorf("expected count=3 in batch response, got: %v", res)
		}
	}
}

// ─── 5. Photo List, Soft Delete & Batch Download ──────────────

func TestPhoto_ListSoftDeleteAndDownload(t *testing.T) {
	e, h := setupTestEnv(t)

	defer func() {
		_ = os.RemoveAll("uploads")
		_ = os.RemoveAll("thumbs")
	}()

	// Register photographer & create wedding
	regBody := `{"name":"Foto Berk","email":"berk@foto.com","password":"pass123456"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/photographers/register", strings.NewReader(regBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	_ = h.RegisterPhotographer(e.NewContext(req, rec))
	var phRes map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &phRes)
	token := phRes["token"].(string)

	createBody := `{"name":"Deniz & Cem","date":"2026-07-07"}`
	reqW := httptest.NewRequest(http.MethodPost, "/api/v1/weddings", strings.NewReader(createBody))
	reqW.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	reqW.Header.Set("Authorization", "Bearer "+token)
	recW := httptest.NewRecorder()
	_ = h.AuthPhotographer(h.CreateWedding)(e.NewContext(reqW, recW))
	if recW.Code != http.StatusCreated {
		t.Fatalf("CreateWedding failed: %d, body: %s", recW.Code, recW.Body.String())
	}
	var wRes map[string]interface{}
	_ = json.Unmarshal(recW.Body.Bytes(), &wRes)
	code := wRes["code"].(string)
	t.Logf("Created wedding with code: %s", code)

	// Upload 2 photos
	jpegData := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01}
	uploadPhoto := func(name string) string {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("photo", name)
		_, _ = part.Write(jpegData)
		_ = writer.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/weddings/"+code+"/photos", body)
		req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("code")
		c.SetParamValues(code)
		_ = h.UploadPhoto(c)
		var res map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		return res["id"].(string)
	}

	photo1 := uploadPhoto("first.jpg")
	photo2 := uploadPhoto("second.jpg")

	// A. List photos -> returns both photos
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+code+"/photos", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("code")
		c.SetParamValues(code)

		_ = h.ListPhotos(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for photo list, got %d", rec.Code)
		}

		var photos []repo.Photo
		_ = json.Unmarshal(rec.Body.Bytes(), &photos)
		if len(photos) != 2 {
			t.Fatalf("expected 2 active photos, got %d", len(photos))
		}
	}

	// B. Soft Delete Photo 1 (UC-7, UC-12, UC-37)
	{
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/photos/"+photo1, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("id")
		c.SetParamValues(photo1)

		_ = h.AuthPhotographer(h.DeletePhoto)(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for soft delete, got %d, body: %s", rec.Code, rec.Body.String())
		}
	}

	// C. List photos after soft-delete -> photo1 must NOT be in the gallery
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+code+"/photos", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("code")
		c.SetParamValues(code)

		_ = h.ListPhotos(c)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}

		var photos []repo.Photo
		_ = json.Unmarshal(rec.Body.Bytes(), &photos)
		if len(photos) != 1 || photos[0].ID != photo2 {
			t.Errorf("expected only photo2 to remain after soft delete, got: %v", photos)
		}
	}

	// D. Batch download selected photos (UC-34, UC-35, UC-36)
	{
		// Download with no ids -> 400
		reqBad := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+code+"/download", nil)
		recBad := httptest.NewRecorder()
		cBad := e.NewContext(reqBad, recBad)
		cBad.SetParamNames("code")
		cBad.SetParamValues(code)

		_ = h.DownloadZip(cBad)
		if recBad.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 when missing ids param, got %d", recBad.Code)
		}

		// Download valid active photo
		reqOk := httptest.NewRequest(http.MethodGet, "/api/v1/weddings/"+code+"/download?ids="+photo2, nil)
		recOk := httptest.NewRecorder()
		cOk := e.NewContext(reqOk, recOk)
		cOk.SetParamNames("code")
		cOk.SetParamValues(code)

		_ = h.DownloadZip(cOk)
		if recOk.Code != http.StatusOK {
			t.Fatalf("expected 200 for download, got %d", recOk.Code)
		}

		var res map[string]interface{}
		_ = json.Unmarshal(recOk.Body.Bytes(), &res)
		if int(res["count"].(float64)) != 1 {
			t.Errorf("expected count=1 in download result, got: %v", res)
		}
	}
}

// ─── 6. Analytics Event Tracking ──────────────────────────────

func TestAnalytics_Track(t *testing.T) {
	e, h := setupTestEnv(t)

	eventBody := `{"wedding_id":"test-wedding","event_type":"link_visit","ref":"damat"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/analytics", strings.NewReader(eventBody))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.TrackEvent(c); err != nil {
		t.Fatalf("TrackEvent error: %v", err)
	}
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", rec.Code)
	}
}
