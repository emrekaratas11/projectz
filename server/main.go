package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	_ "modernc.org/sqlite"

	"fotoyonetim/db"
	"fotoyonetim/db/repo"
	"fotoyonetim/handlers"
	"fotoyonetim/storage"
)

// resolveWebRoot finds the directory containing index.html and src/
// so running `go run .` from either root or ./server works identically.
func resolveWebRoot() string {
	if _, err := os.Stat("index.html"); err == nil {
		return "."
	}
	if _, err := os.Stat(filepath.Join("..", "index.html")); err == nil {
		return ".."
	}
	return "."
}

func BuildApp(conn *sql.DB) (*echo.Echo, error) {
	// Repositories (compile all SQL at startup)
	phRepo, err := repo.NewPhotographerRepo(conn)
	if err != nil {
		return nil, err
	}

	wRepo, err := repo.NewWeddingRepo(conn)
	if err != nil {
		return nil, err
	}

	gRepo, err := repo.NewGuestRepo(conn)
	if err != nil {
		return nil, err
	}

	mRepo, err := repo.NewWeddingMemberRepo(conn)
	if err != nil {
		return nil, err
	}

	slRepo, err := repo.NewShareLinkRepo(conn)
	if err != nil {
		return nil, err
	}

	pRepo, err := repo.NewPhotoRepo(conn)
	if err != nil {
		return nil, err
	}

	aRepo, err := repo.NewAnalyticsRepo(conn)
	if err != nil {
		return nil, err
	}

	// Echo Web Server
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())
	e.Use(middleware.RequestID())
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(50)))

	rootDir := resolveWebRoot()

	// Static assets, ES modules & uploads
	e.Static("/static/uploads", "uploads")
	e.Static("/static/thumbs", "thumbs")
	e.Static("/assets", filepath.Join(rootDir, "assets"))
	e.Static("/storage", filepath.Join(rootDir, "storage"))
	e.Static("/src", filepath.Join(rootDir, "src"))

	// Frontend files
	e.File("/app.js", filepath.Join(rootDir, "app.js"))
	e.File("/style.css", filepath.Join(rootDir, "style.css"))
	e.File("/index.html", filepath.Join(rootDir, "index.html"))
	e.File("/", filepath.Join(rootDir, "index.html"))
	e.GET("/favicon.ico", func(c echo.Context) error {
		return c.NoContent(http.StatusNoContent)
	})

	// Handler wiring
	h := handlers.New(handlers.Deps{
		Photographers: phRepo,
		Weddings:      wRepo,
		Guests:        gRepo,
		Members:       mRepo,
		ShareLinks:    slRepo,
		Photos:        pRepo,
		Analytics:     aRepo,
	})

	// Anti-Hack / WAF / Brute-Force & Token Tampering Shield Middleware
	e.Use(h.AntiHackMiddleware)

	// API Routes (v1)
	api := e.Group("/api/v1")

	// Auth (Photographer)
	api.POST("/photographers/register", h.RegisterPhotographer)
	api.POST("/photographers/login",    h.LoginPhotographer)

	// Weddings & Manager Setup / Login
	api.POST("/weddings",                 h.CreateWedding,       h.AuthPhotographer)
	api.POST("/weddings/setup",           h.SetupWedding)
	api.GET("/weddings",                  h.ListWeddings,        h.AuthPhotographer)
	api.GET("/weddings/:code",            h.GetWedding)
	api.POST("/weddings/:code/login",     h.LoginWeddingManager)
	api.PUT("/weddings/:code/passcode",   h.UpdateWeddingPasscodes)
	api.DELETE("/weddings/:id",           h.DeleteWedding,       h.AuthPhotographer)

	// Roles & Responsibilities Table (RBAC)
	api.GET("/weddings/:code/members",    h.ListWeddingMembers)
	api.POST("/weddings/:code/members",   h.UpsertWeddingMemberRole, h.RequireWeddingPermission("can_assign_roles"))

	// Share Links & QR Attribution Ledger (Who gave to whom, when, open/join counts)
	api.POST("/weddings/:code/shares",    h.CreateShareLink)
	api.GET("/weddings/:code/shares",     h.ListShareLinks)
	api.POST("/shares/:id/open",          h.OpenShareLink)
	api.DELETE("/shares/:id",             h.RevokeShareLink)

	// Guests
	api.POST("/weddings/:code/guests",    h.CreateGuest)
	api.GET("/weddings/:code/guests",     h.ListGuests)

	// Photos
	api.POST("/weddings/:code/photos",    h.UploadPhoto)
	api.GET("/weddings/:code/photos",     h.ListPhotos)
	api.POST("/photos/:id/tags",          h.AddPhotoTag)
	api.DELETE("/photos/:id",             h.DeletePhoto,         h.AuthPhotographer)
	api.POST("/photos/:id/restore",       h.RestorePhoto,        h.AuthPhotographer)

	// Download
	api.GET("/weddings/:code/download",   h.DownloadZip)

	// Analytics
	api.POST("/analytics",                h.TrackEvent)

	// Health Check (for Cloud load balancers / container health probes)
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, echo.Map{
			"status":  "ok",
			"service": "fotoyonetim",
		})
	})

	// SPA Fallback for client-side routing:
	// Supports both single-segment (/ayse-mehmet) and multi-segment (/ayse-mehmet/yonetim, /ayse-mehmet/gelin)
	// Also serves style.css and src/* if requested relative to a sub-route (e.g. /ayse-mehmet/style.css)
	spaHandler := func(c echo.Context) error {
		sub := c.Param("sub")
		if sub == "style.css" {
			return c.File(filepath.Join(rootDir, "style.css"))
		}
		if sub == "app.js" {
			return c.File(filepath.Join(rootDir, "app.js"))
		}
		return c.File(filepath.Join(rootDir, "index.html"))
	}
	e.GET("/:code/src/*", func(c echo.Context) error {
		return c.File(filepath.Join(rootDir, "src", c.Param("*")))
	})
	e.GET("/:code", spaHandler)
	e.GET("/:code/:sub", spaHandler)

	return e, nil
}

func main() {
	// ─── Cloud & Environment Variables ────────────────────
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./fotoyonetim.db"
	}

	storageDir := os.Getenv("STORAGE_DIR")
	if storageDir == "" {
		storageDir = "./storage"
	}

	// Ensure upload & thumbnail directories exist
	_ = os.MkdirAll("uploads", 0755)
	_ = os.MkdirAll("thumbs", 0755)
	_ = os.MkdirAll(storageDir, 0755)

	// Initialize disk storage manager
	diskStorage, err := storage.NewDiskStorage("uploads", "thumbs")
	if err != nil {
		log.Printf("warning: disk storage init: %v", err)
	}
	_ = diskStorage

	// ─── Database ──────────────────────────────────────────
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer conn.Close()

	// SQLite: single writer, multiple readers via WAL
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)

	// Run migrations (IF NOT EXISTS)
	if err := db.Migrate(conn); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	app, err := BuildApp(conn)
	if err != nil {
		log.Fatalf("build app: %v", err)
	}

	log.Println("all SQL statements compiled successfully")

	// ─── Start Server ──────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("fotoyonetim server starting on 0.0.0.0:%s", port)
	app.Logger.Fatal(app.Start(":" + port))
}
