package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

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

		var body struct {
			Message  string `json:"message"`
			ThreadID string `json:"threadId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			transform.WriteError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
			return
		}
		if body.Message == "" {
			transform.WriteError(w, http.StatusBadRequest, "message is required.")
			return
		}

		ctx, cancel := context.WithTimeout(transform.WithIdentity(r.Context(), r), 60*time.Second)
		defer cancel()

		req := &aiv1.ChatRequest{
			UserId:  userID,
			Message: body.Message,
		}
		if body.ThreadID != "" {
			req.ThreadId = &body.ThreadID
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
