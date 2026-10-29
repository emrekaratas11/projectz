package storage_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"fotoyonetim/storage"
)

func TestDiskStorage(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	uploadDir := filepath.Join(tempDir, "uploads")
	thumbDir := filepath.Join(tempDir, "thumbs")

	store, err := storage.NewDiskStorage(uploadDir, thumbDir)
	if err != nil {
		t.Fatalf("new disk storage: %v", err)
	}

	content := []byte("sample image byte stream")
	fullPath, n, err := store.SaveFullPhoto("w-test", "photo-01", ".jpg", bytes.NewReader(content))
	if err != nil {
		t.Fatalf("save full photo: %v", err)
	}
	if n != int64(len(content)) {
		t.Errorf("expected %d bytes written, got %d", len(content), n)
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Errorf("saved photo file does not exist on disk: %s", fullPath)
	}

	thumbPath := store.GetThumbPath("w-test", "photo-01", ".jpg")
	if filepath.Ext(thumbPath) != ".jpg" {
		t.Errorf("expected .jpg extension for thumbnail")
	}

	store.RemovePhoto(fullPath, thumbPath)
	if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
		t.Errorf("photo should be removed from disk")
	}
}

