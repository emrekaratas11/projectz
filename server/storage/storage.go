package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// DiskStorage manages local filesystem storage for photos and thumbnails (UC-1, UC-2, UC-9).
type DiskStorage struct {
	baseDir  string
	thumbDir string
}

// NewDiskStorage creates a storage manager with configured upload and thumbnail directories.
func NewDiskStorage(baseDir, thumbDir string) (*DiskStorage, error) {
	if baseDir == "" {
		baseDir = "uploads"
	}
	if thumbDir == "" {
		thumbDir = "thumbs"
	}
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("create baseDir %s: %w", baseDir, err)
	}
	if err := os.MkdirAll(thumbDir, 0755); err != nil {
		return nil, fmt.Errorf("create thumbDir %s: %w", thumbDir, err)
	}
	return &DiskStorage{baseDir: baseDir, thumbDir: thumbDir}, nil
}

// SaveFullPhoto writes the original high-resolution photo file into wedding directory.
func (s *DiskStorage) SaveFullPhoto(weddingID, photoID, ext string, r io.Reader) (string, int64, error) {
	dir := filepath.Join(s.baseDir, weddingID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", 0, fmt.Errorf("mkdir wedding uploads: %w", err)
	}
	destPath := filepath.Join(dir, photoID+ext)
	dst, err := os.Create(destPath)
	if err != nil {
		return "", 0, fmt.Errorf("create file %s: %w", destPath, err)
	}
	defer dst.Close()

	n, err := io.Copy(dst, r)
	if err != nil {
		return "", 0, fmt.Errorf("copy stream to %s: %w", destPath, err)
	}
	return destPath, n, nil
}

// GetThumbPath returns the expected thumbnail path for a photo.
func (s *DiskStorage) GetThumbPath(weddingID, photoID, ext string) string {
	dir := filepath.Join(s.thumbDir, weddingID)
	os.MkdirAll(dir, 0755)
	return filepath.Join(dir, photoID+"_thumb"+ext)
}

// RemovePhoto removes full and thumb files from disk if needed (hard delete / purge).
func (s *DiskStorage) RemovePhoto(fullPath, thumbPath string) {
	if fullPath != "" {
		_ = os.Remove(fullPath)
	}
	if thumbPath != "" {
		_ = os.Remove(thumbPath)
	}
}

