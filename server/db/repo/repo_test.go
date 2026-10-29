package repo_test

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"fotoyonetim/db"
	"fotoyonetim/db/repo"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("open sqlite in-memory: %v", err)
	}
	if err := db.Migrate(conn); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return conn
}

func TestRepositoryPattern_FullFlow(t *testing.T) {
	conn := setupTestDB(t)
	defer conn.Close()

	// 1. Initialize Repositories
	phRepo, err := repo.NewPhotographerRepo(conn)
	if err != nil {
		t.Fatalf("new photographer repo: %v", err)
	}
	defer phRepo.Close()

	wRepo, err := repo.NewWeddingRepo(conn)
	if err != nil {
		t.Fatalf("new wedding repo: %v", err)
	}
	defer wRepo.Close()

	gRepo, err := repo.NewGuestRepo(conn)
	if err != nil {
		t.Fatalf("new guest repo: %v", err)
	}
	defer gRepo.Close()

	slRepo, err := repo.NewShareLinkRepo(conn)
	if err != nil {
		t.Fatalf("new share_link repo: %v", err)
	}
	defer slRepo.Close()

	pRepo, err := repo.NewPhotoRepo(conn)
	if err != nil {
		t.Fatalf("new photo repo: %v", err)
	}
	defer pRepo.Close()

	anRepo, err := repo.NewAnalyticsRepo(conn)
	if err != nil {
		t.Fatalf("new analytics repo: %v", err)
	}
	defer anRepo.Close()

	// 2. Test Photographer Repo (UC-14)
	ph := &repo.Photographer{
		ID:           "ph-test-1",
		Name:         "Ahmet Fotografci",
		Email:        "ahmet@fotoyonetim.com",
		PasswordHash: "$2a$10$abcdefhashedpass",
	}
	if err := phRepo.Create(ph); err != nil {
		t.Fatalf("photographer create failed: %v", err)
	}

	phFound, err := phRepo.GetByID("ph-test-1")
	if err != nil || phFound == nil {
		t.Fatalf("photographer get by id failed: %v", err)
	}
	if phFound.Email != "ahmet@fotoyonetim.com" {
		t.Errorf("expected email ahmet@fotoyonetim.com, got %s", phFound.Email)
	}

	phByEmail, err := phRepo.GetByEmail("ahmet@fotoyonetim.com")
	if err != nil || phByEmail == nil {
		t.Fatalf("photographer get by email failed: %v", err)
	}

	// 3. Test Wedding Repo (UC-15, UC-17) including zero-to-one setup without photographer_id
	w := &repo.Wedding{
		ID:             "w-101",
		PhotographerID: ph.ID,
		Code:           "ayse-mehmet-2026-ab12",
		Name:           "Ayse & Mehmet",
		Date:           "2026-11-15",
		OwnerName:      "Emre Yilmaz",
		OwnerRole:      "owner",
		OwnerPasscode:  "1234",
		GuestPasscode:  "5678",
	}
	if err := wRepo.Create(w); err != nil {
		t.Fatalf("wedding create failed: %v", err)
	}

	// Exact code lookup
	wFound, err := wRepo.GetByCode("ayse-mehmet-2026-ab12")
	if err != nil || wFound == nil {
		t.Fatalf("wedding get by code failed: %v", err)
	}
	if wFound.Name != "Ayse & Mehmet" || wFound.OwnerName != "Emre Yilmaz" || wFound.GuestPasscode != "5678" {
		t.Errorf("unexpected wedding fields: %+v", wFound)
	}

	// Slug prefix lookup ("ayse-mehmet" matches "ayse-mehmet-2026-ab12")
	wBySlug, err := wRepo.GetByCode("ayse-mehmet")
	if err != nil || wBySlug == nil || wBySlug.ID != w.ID {
		t.Fatalf("wedding get by slug prefix failed: %v", err)
	}

	// Name lookup ("Ayse & Mehmet" case-insensitive)
	wByName, err := wRepo.GetByCode("ayse & mehmet")
	if err != nil || wByName == nil || wByName.ID != w.ID {
		t.Fatalf("wedding get by name failed: %v", err)
	}

	// UpdatePasscodes test
	if err := wRepo.UpdatePasscodes(w.ID, "9999", "8888"); err != nil {
		t.Fatalf("update passcodes failed: %v", err)
	}
	wAfterPass, _ := wRepo.GetByID(w.ID)
	if wAfterPass.OwnerPasscode != "9999" || wAfterPass.GuestPasscode != "8888" {
		t.Errorf("expected updated passcodes 9999/8888, got %s/%s", wAfterPass.OwnerPasscode, wAfterPass.GuestPasscode)
	}

	weddingsList, err := wRepo.ListByPhotographer(ph.ID)
	if err != nil || len(weddingsList) != 1 {
		t.Fatalf("expected 1 wedding for photographer, got %d", len(weddingsList))
	}

	// 4. Test ShareLink & Guest Repo Attribution ("Who gave, to whom, when") (UC-19, UC-20)
	sl1 := &repo.ShareLink{
		ID:           "sl-101",
		WeddingID:    w.ID,
		WeddingCode:  w.Code,
		ShareType:    "link",
		Channel:      "gelin",
		SharedByName: "Ayse (Gelin)",
		SharedByRole: "owner",
		SharedToName: "Can Yilmaz",
	}
	if err := slRepo.Create(sl1); err != nil {
		t.Fatalf("share_link create failed: %v", err)
	}
	if err := slRepo.RecordOpen("sl-101", "Can Yilmaz"); err != nil {
		t.Fatalf("share_link record open failed: %v", err)
	}
	if err := slRepo.RecordJoin("sl-101", "Can Yilmaz"); err != nil {
		t.Fatalf("share_link record join failed: %v", err)
	}
	slFound, err := slRepo.GetByID("sl-101")
	if err != nil || slFound == nil || slFound.OpenCount != 1 || slFound.JoinCount != 1 || slFound.SharedByName != "Ayse (Gelin)" || slFound.SharedToName != "Can Yilmaz" {
		t.Fatalf("unexpected share_link record: %+v, err: %v", slFound, err)
	}
	slList, err := slRepo.ListByWedding(w.ID)
	if err != nil || len(slList) != 1 {
		t.Fatalf("expected 1 share_link for wedding, got %d", len(slList))
	}

	g1 := &repo.Guest{
		ID:           "g-1",
		WeddingID:    w.ID,
		Name:         "Can Yilmaz",
		Phone:        "05321112233",
		Ref:          "gelin",
		SharedBy:     "Ayse (Gelin)",
		ShareTokenID: "sl-101",
		ConsentGiven: true,
	}
	if err := gRepo.Create(g1); err != nil {
		t.Fatalf("guest 1 create failed: %v", err)
	}

	g2 := &repo.Guest{
		ID:           "g-2",
		WeddingID:    w.ID,
		Name:         "Mehmet Demir",
		Phone:        "05442223344",
		Ref:          "damat",
		ConsentGiven: true,
	}
	if err := gRepo.Create(g2); err != nil {
		t.Fatalf("guest 2 create failed: %v", err)
	}

	guests, err := gRepo.ListByWedding(w.ID)
	if err != nil || len(guests) != 2 {
		t.Fatalf("expected 2 guests for wedding, got %d", len(guests))
	}

	// 5. Test Photo Repo (UC-1, UC-2, UC-9, UC-18 limit and statuses)
	photo1 := &repo.Photo{
		ID:        "p-1",
		WeddingID: w.ID,
		GuestID:   g1.ID,
		Filename:  "pasta.jpg",
		FullPath:  "uploads/w-101/p-1.jpg",
		ThumbPath: "thumbs/w-101/p-1_thumb.jpg",
		MimeType:  "image/jpeg",
		FileSize:  2048500,
		Status:    "approved",
	}
	if err := pRepo.Create(photo1); err != nil {
		t.Fatalf("photo 1 create failed: %v", err)
	}

	photo2 := &repo.Photo{
		ID:        "p-2",
		WeddingID: w.ID,
		GuestID:   g2.ID,
		Filename:  "dans.jpg",
		FullPath:  "uploads/w-101/p-2.jpg",
		ThumbPath: "thumbs/w-101/p-2_thumb.jpg",
		MimeType:  "image/jpeg",
		FileSize:  1845000,
		Status:    "approved",
	}
	if err := pRepo.Create(photo2); err != nil {
		t.Fatalf("photo 2 create failed: %v", err)
	}

	// Pending photo (e.g., pending moderation UC-4)
	photo3 := &repo.Photo{
		ID:        "p-3",
		WeddingID: w.ID,
		GuestID:   g2.ID,
		Filename:  "pending.jpg",
		FullPath:  "uploads/w-101/p-3.jpg",
		ThumbPath: "thumbs/w-101/p-3_thumb.jpg",
		MimeType:  "image/jpeg",
		FileSize:  1500000,
		Status:    "pending",
	}
	if err := pRepo.Create(photo3); err != nil {
		t.Fatalf("photo 3 create failed: %v", err)
	}

	// Gallery list: only approved & not deleted
	approvedPhotos, err := pRepo.ListByWedding(w.ID)
	if err != nil {
		t.Fatalf("list photos by wedding: %v", err)
	}
	if len(approvedPhotos) != 2 {
		t.Errorf("expected 2 approved photos, got %d", len(approvedPhotos))
	}

	// Guest's own uploads (shows all uploads belonging to guest)
	guest2Photos, err := pRepo.ListByGuest(w.ID, g2.ID)
	if err != nil {
		t.Fatalf("list photos by guest: %v", err)
	}
	if len(guest2Photos) != 2 {
		t.Errorf("expected 2 photos for guest 2, got %d", len(guest2Photos))
	}

	// 6. Test Soft Delete Protocol (UC-7, UC-12, UC-37)
	// Try soft delete with unauthorized photographer: MUST return unauthorized error!
	err = pRepo.SoftDelete("p-1", "unauthorized-photographer-id")
	if err == nil {
		t.Fatalf("expected error for unauthorized photographer, got nil")
	}
	// Verify p-1 is NOT deleted
	p1Check, err := pRepo.GetByID("p-1")
	if err != nil || p1Check == nil || p1Check.IsDeleted {
		t.Fatalf("photo p-1 should NOT be deleted by unauthorized photographer")
	}

	// Authorized soft delete by the wedding's photographer (ph.ID)
	if err := pRepo.SoftDelete("p-1", ph.ID); err != nil {
		t.Fatalf("authorized soft delete failed: %v", err)
	}

	// Photo is now soft-deleted: is_deleted = 1
	p1Deleted, err := pRepo.GetByID("p-1")
	if err != nil || p1Deleted == nil {
		t.Fatalf("get photo after soft delete: %v", err)
	}
	if !p1Deleted.IsDeleted {
		t.Errorf("expected is_deleted to be true for p-1")
	}

	// Photo is removed from public gallery
	afterDeleteGallery, err := pRepo.ListByWedding(w.ID)
	if err != nil {
		t.Fatalf("list photos after delete: %v", err)
	}
	if len(afterDeleteGallery) != 1 {
		t.Errorf("expected 1 photo in public gallery after soft delete, got %d", len(afterDeleteGallery))
	}

	// Photo is visible in archived list
	archivedList, err := pRepo.ListArchivedByWedding(w.ID)
	if err != nil || len(archivedList) != 1 || archivedList[0].ID != "p-1" {
		t.Fatalf("expected p-1 in archived list, got %v (err: %v)", archivedList, err)
	}

	// Restore soft-deleted photo
	if err := pRepo.Restore("p-1", ph.ID); err != nil {
		t.Fatalf("restore photo failed: %v", err)
	}
	afterRestoreGallery, err := pRepo.ListByWedding(w.ID)
	if err != nil || len(afterRestoreGallery) != 2 {
		t.Errorf("expected 2 photos in gallery after restore, got %d", len(afterRestoreGallery))
	}

	// 6.1 Test Photo Tagging & Search (UC-8, UC-10, UC-21)
	if err := pRepo.AddTag("p-2", "#dans", "Emre Yilmaz"); err != nil {
		t.Fatalf("add tag #dans failed: %v", err)
	}
	if err := pRepo.AddTag("p-2", "Mehmet Demir", "Emre Yilmaz"); err != nil {
		t.Fatalf("add person tag failed: %v", err)
	}
	tagsP2, err := pRepo.ListTags("p-2")
	if err != nil || len(tagsP2) != 2 {
		t.Fatalf("expected 2 tags on p-2, got %v (err: %v)", tagsP2, err)
	}
	searchDans, err := pRepo.SearchByTagOrQuery(w.ID, "#dans")
	if err != nil || len(searchDans) != 1 || searchDans[0].ID != "p-2" {
		t.Fatalf("expected p-2 from #dans search, got %+v (err: %v)", searchDans, err)
	}
	searchGuest, err := pRepo.SearchByTagOrQuery(w.ID, "Can Yilmaz")
	if err != nil || len(searchGuest) != 1 || searchGuest[0].ID != "p-1" {
		t.Fatalf("expected p-1 from guest name search 'Can Yilmaz', got %+v (err: %v)", searchGuest, err)
	}

	// 7. Test Analytics Logging (UC-20)
	evt := &repo.AnalyticsEvent{
		ID:        "evt-1",
		WeddingID: w.ID,
		EventType: "guest_joined",
		GuestID:   g1.ID,
		Ref:       "gelin",
		IPHash:    "hashed-ip-123",
		UserAgent: "Mozilla/5.0 Test",
	}
	if err := anRepo.Track(evt); err != nil {
		t.Fatalf("track analytics event failed: %v", err)
	}
}
