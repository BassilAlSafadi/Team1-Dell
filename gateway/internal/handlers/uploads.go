package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"

	"gateway/internal/config"
	"gateway/internal/middleware"
	"gateway/internal/transform"
)

// MaxUploadBytes caps a single upload. 50 MiB comfortably covers phone photos and short
// clips without letting one request fill the 1 GB host's disk.
const MaxUploadBytes = 50 << 20

// servedNameRe is the only shape GET /api/uploads/{name} will serve: 32 hex chars (the
// random id) + a short alphanumeric extension. Anything else — path separators, "..",
// a bare id with no extension — is rejected before touching the filesystem.
var servedNameRe = regexp.MustCompile(`^[a-f0-9]{32}(\.[A-Za-z0-9]{1,8})?$`)

var extRe = regexp.MustCompile(`^\.[A-Za-z0-9]{1,8}$`)

// Upload handles POST /api/uploads — a multipart/form-data request with the file under the
// "file" field. It writes the bytes to cfg.UploadDir under a random, unguessable name and
// returns a descriptor the caller stores (chat attachment / message attachment):
//
//	{ "url": "/api/uploads/<id>.<ext>", "type": "<mime>", "name": "<original>", "size": <n> }
func Upload(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if middleware.UserID(r) == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, MaxUploadBytes)

		file, header, err := r.FormFile("file")
		if err != nil {
			if strings.Contains(err.Error(), "request body too large") {
				transform.WriteError(w, http.StatusRequestEntityTooLarge,
					"File is too large (50 MB max).")
				return
			}
			transform.WriteError(w, http.StatusBadRequest, "Expected a multipart form with a 'file' field.")
			return
		}
		defer file.Close()

		// Sniff the type from the first 512 bytes, then prefer the client-declared type when
		// it's plausible — DetectContentType only knows a handful of formats and reports
		// application/octet-stream for most real files (docx, mp4 variants, ...).
		head := make([]byte, 512)
		n, _ := io.ReadFull(file, head)
		head = head[:n]
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			transform.WriteError(w, http.StatusInternalServerError, "Could not read the upload.")
			return
		}
		contentType := http.DetectContentType(head)
		if declared := header.Header.Get("Content-Type"); declared != "" &&
			(contentType == "application/octet-stream" || strings.HasPrefix(contentType, "text/plain")) {
			contentType = declared
		}

		ext := strings.ToLower(filepath.Ext(header.Filename))
		if !extRe.MatchString(ext) {
			if byType, _ := mime.ExtensionsByType(contentType); len(byType) > 0 {
				ext = byType[0]
			} else {
				ext = ""
			}
		}

		id := make([]byte, 16)
		if _, err := rand.Read(id); err != nil {
			transform.WriteError(w, http.StatusInternalServerError, "Could not generate a file id.")
			return
		}
		name := hex.EncodeToString(id) + ext

		if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
			transform.WriteError(w, http.StatusInternalServerError, "Storage is unavailable.")
			return
		}

		dst, err := os.Create(filepath.Join(cfg.UploadDir, name))
		if err != nil {
			transform.WriteError(w, http.StatusInternalServerError, "Could not save the file.")
			return
		}

		written, err := io.Copy(dst, file)
		closeErr := dst.Close()
		if err != nil || closeErr != nil {
			_ = os.Remove(filepath.Join(cfg.UploadDir, name))
			if err != nil && strings.Contains(err.Error(), "request body too large") {
				transform.WriteError(w, http.StatusRequestEntityTooLarge, "File is too large (50 MB max).")
				return
			}
			transform.WriteError(w, http.StatusInternalServerError, "Could not save the file.")
			return
		}

		transform.WriteJSON(w, http.StatusCreated, map[string]any{
			"url":  "/api/uploads/" + name,
			"type": contentType,
			"name": header.Filename,
			"size": written,
		})
	}
}

// ServeUpload handles GET /api/uploads/{name}. Unauthenticated on purpose: the 128-bit
// random filename is the capability, and <img>/<video> tags can't send a bearer header.
func ServeUpload(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		if !servedNameRe.MatchString(name) {
			transform.WriteError(w, http.StatusBadRequest, "Invalid file name.")
			return
		}

		path := filepath.Join(cfg.UploadDir, name)
		f, err := os.Open(path)
		if err != nil {
			transform.WriteError(w, http.StatusNotFound, "File not found.")
			return
		}
		defer f.Close()

		info, err := f.Stat()
		if err != nil || info.IsDir() {
			transform.WriteError(w, http.StatusNotFound, "File not found.")
			return
		}

		if ctype := mime.TypeByExtension(filepath.Ext(name)); ctype != "" {
			w.Header().Set("Content-Type", ctype)
		}
		w.Header().Set("Content-Disposition", "inline")
		w.Header().Set("Cache-Control", "private, max-age=86400")
		http.ServeContent(w, r, name, info.ModTime(), f)
	}
}
