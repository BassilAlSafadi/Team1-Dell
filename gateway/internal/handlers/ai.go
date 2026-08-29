package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc/status"

	aiv1 "gateway/internal/grpcgen/ai/v1"
	"gateway/internal/middleware"
	"gateway/internal/transform"
)

const maxClassifyUploadBytes = 10 << 20 // 10 MiB — generous for a phone photo, bounded so a
// misbehaving client can't hold a gRPC call open forever.

// ClassifyWaste handles POST /api/ai/classify over gRPC. Accepts either a raw image body
// (any Content-Type starting with "image/" or "application/octet-stream") or a
// multipart/form-data upload with the file under the "image" field — ai-service has no REST
// API at all, so this route only ever goes through gRPC (no REST-proxy fallback exists here).
func ClassifyWaste(client aiv1.AiServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserID(r)
		if userID == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		imageData, imageName, err := readImage(w, r)
		if err != nil {
			transform.WriteError(w, http.StatusBadRequest, "Could not read uploaded image: "+err.Error())
			return
		}
		if len(imageData) == 0 {
			transform.WriteError(w, http.StatusBadRequest, "No image data in request.")
			return
		}

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 60*time.Second)
		defer cancel()

		req := &aiv1.ClassifyWasteRequest{
			UserId:    userID,
			ImageData: imageData,
			ImageName: imageName,
		}
		if loc := r.URL.Query().Get("businessLocation"); loc != "" {
			req.BusinessLocation = &loc
		}

		resp, err := client.ClassifyWaste(ctx, req)
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		items := make([]map[string]any, 0, len(resp.GetItems()))
		for _, item := range resp.GetItems() {
			items = append(items, map[string]any{
				"description":      item.GetDescription(),
				"category":         item.GetCategory(),
				"confidence":       item.GetConfidence(),
				"materialEvidence": item.GetMaterialEvidence(),
			})
		}

		vendorsByCategory := make(map[string]any, len(resp.GetVendorsByCategory()))
		for category, list := range resp.GetVendorsByCategory() {
			vendors := make([]map[string]any, 0, len(list.GetVendors()))
			for _, v := range list.GetVendors() {
				vendors = append(vendors, map[string]any{
					"name":            v.GetName(),
					"offerPrice":      v.GetOfferPrice(),
					"location":        v.GetLocation(),
					"pickupAvailable": v.GetPickupAvailable(),
				})
			}
			vendorsByCategory[category] = vendors
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"classificationId":   resp.GetClassificationId(),
			"primaryCategory":    resp.GetPrimaryCategory(),
			"confidence":         resp.GetConfidence(),
			"items":              items,
			"isMixed":            resp.GetIsMixed(),
			"hazardFlag":         resp.GetHazardFlag(),
			"hazardReason":       resp.GetHazardReason(),
			"contaminationNotes": resp.GetContaminationNotes(),
			"reasoning":          resp.GetReasoning(),
			"needsReview":        resp.GetNeedsReview(),
			"vendorsByCategory":  vendorsByCategory,
		})
	}
}

// Recommendation handles GET /api/ai/recommendation over gRPC.
func Recommendation(client aiv1.AiServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserID(r)
		if userID == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		scanLimit := int32(0)
		if v := r.URL.Query().Get("scanLimit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				scanLimit = int32(n)
			}
		}

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 30*time.Second)
		defer cancel()

		resp, err := client.GetRecommendation(ctx, &aiv1.GetRecommendationRequest{
			UserId:    userID,
			ScanLimit: scanLimit,
		})
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"recommendationText": resp.GetRecommendationText(),
		})
	}
}

// Chat handles POST /api/ai/chat over gRPC — the RAG chatbot.
func Chat(client aiv1.AiServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserID(r)
		if userID == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		message, threadID, media, mediaType, mediaName, err := readChatRequest(w, r)
		if err != nil {
			transform.WriteError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
			return
		}
		if message == "" && len(media) == 0 {
			transform.WriteError(w, http.StatusBadRequest, "message is required.")
			return
		}

		timeout := 60 * time.Second
		if len(media) > 0 {
			timeout = 180 * time.Second
		}
		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), timeout)
		defer cancel()

		req := &aiv1.ChatRequest{
			UserId:    userID,
			Message:   message,
			MediaData: media,
			MediaType: mediaType,
			MediaName: mediaName,
		}
		if threadID != "" {
			req.ThreadId = &threadID
		}

		resp, err := client.Chat(ctx, req)
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		transform.WriteJSON(w, http.StatusOK, map[string]any{
			"reply":    resp.GetReply(),
			"threadId": resp.GetThreadId(),
		})
	}
}

// ChatStream handles POST /api/ai/chat/stream over gRPC server-streaming — same request
// shape as Chat, but relays the reply to the browser as Server-Sent Events as ai-service
// generates it, instead of waiting for the full turn.
func ChatStream(client aiv1.AiServiceClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserID(r)
		if userID == "" {
			transform.WriteError(w, http.StatusUnauthorized, "Missing bearer token.")
			return
		}

		message, threadID, media, mediaType, mediaName, err := readChatRequest(w, r)
		if err != nil {
			transform.WriteError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
			return
		}
		if message == "" && len(media) == 0 {
			transform.WriteError(w, http.StatusBadRequest, "message is required.")
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			transform.WriteError(w, http.StatusInternalServerError, "Streaming not supported.")
			return
		}

		// Vision/media turns run noticeably longer than text-only ones.
		timeout := 120 * time.Second
		if len(media) > 0 {
			timeout = 180 * time.Second
		}
		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), timeout)
		defer cancel()

		req := &aiv1.ChatRequest{
			UserId:    userID,
			Message:   message,
			MediaData: media,
			MediaType: mediaType,
			MediaName: mediaName,
		}
		if threadID != "" {
			req.ThreadId = &threadID
		}

		stream, err := client.ChatStream(ctx, req)
		if err != nil {
			transform.WriteGRPCError(w, err)
			return
		}

		// Headers/status are committed on the first Write/Flush, so everything above this
		// point can still fail as a normal JSON error response — everything below cannot.
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		for {
			chunk, err := stream.Recv()
			if errors.Is(err, io.EOF) {
				return
			}
			if err != nil {
				writeSSE(w, map[string]any{"error": statusMessage(err)})
				flusher.Flush()
				return
			}

			writeSSE(w, map[string]any{
				"textDelta": chunk.GetTextDelta(),
				"threadId":  chunk.GetThreadId(),
				"done":      chunk.GetDone(),
				"reset":     chunk.GetReset_(),
			})
			flusher.Flush()
		}
	}
}

// statusMessage extracts the human-readable message from a gRPC error the same way
// transform.WriteGRPCError does, for the mid-stream case where headers are already
// committed and a JSON status response is no longer possible.
func statusMessage(err error) string {
	if st, ok := status.FromError(err); ok {
		return st.Message()
	}
	return err.Error()
}

func writeSSE(w http.ResponseWriter, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_, _ = w.Write([]byte("data: "))
	_, _ = w.Write(data)
	_, _ = w.Write([]byte("\n\n"))
}

// maxChatMediaBytes caps a chat attachment. Kept under the classifier upload cap and well
// under Gemini's inline-data ceiling; ai-service enforces its own limit too.
const maxChatMediaBytes = 20 << 20

// readChatRequest pulls the chat turn out of either a JSON body ({message, threadId}) or a
// multipart/form-data body (message, threadId, and an optional "media" file field). The
// multipart form is what the browser sends when the user attaches a photo/video/file.
func readChatRequest(w http.ResponseWriter, r *http.Request) (message, threadID string, media []byte, mediaType, mediaName string, err error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		r.Body = http.MaxBytesReader(w, r.Body, maxChatMediaBytes+(1<<20))
		if err = r.ParseMultipartForm(8 << 20); err != nil {
			return "", "", nil, "", "", err
		}
		message = r.FormValue("message")
		threadID = r.FormValue("threadId")

		file, header, ferr := r.FormFile("media")
		if ferr != nil {
			return message, threadID, nil, "", "", nil // form with no file is fine
		}
		defer file.Close()

		media, err = io.ReadAll(file)
		if err != nil {
			return "", "", nil, "", "", err
		}
		mediaName = header.Filename
		mediaType = header.Header.Get("Content-Type")
		if mediaType == "" {
			mediaType = http.DetectContentType(media)
		}
		return message, threadID, media, mediaType, mediaName, nil
	}

	var body struct {
		Message  string `json:"message"`
		ThreadID string `json:"threadId"`
	}
	if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
		return "", "", nil, "", "", err
	}
	return body.Message, body.ThreadID, nil, "", "", nil
}

func readImage(w http.ResponseWriter, r *http.Request) (data []byte, name string, err error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxClassifyUploadBytes)

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		file, header, ferr := r.FormFile("image")
		if ferr != nil {
			return nil, "", ferr
		}
		defer file.Close()

		data, err = io.ReadAll(file)
		if err != nil {
			return nil, "", err
		}
		return data, header.Filename, nil
	}

	data, err = io.ReadAll(r.Body)
	if err != nil {
		return nil, "", err
	}
	return data, "upload", nil
}
