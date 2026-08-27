package handlers

import (
	"context"
	"crypto/tls"
	"net/http"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"notification-service/internal/config"
)

type peerStatus struct {
	Peer      string `json:"peer"`
	Address   string `json:"address"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latencyMs,omitempty"`
	Error     string `json:"error,omitempty"`
}

// MeshStatus fans out a real grpc.health.v1.Health/Check call to every other
// service in the mesh (auth, transaction, messaging, ai) and reports each
// peer's status. Unauthenticated by design — same "no service-to-service auth
// yet" limitation the CreateNotification RPC itself carries; a peer being
// unreachable degrades that one entry, it never fails the whole response.
func MeshStatus(cfg *config.Config) http.HandlerFunc {
	peers := map[string]string{
		"auth-service":        cfg.AuthGRPCAddr,
		"transaction-service": cfg.TransactionGRPCAddr,
		"messaging-service":   cfg.MessagingGRPCAddr,
		"ai-service":          cfg.AiGRPCAddr,
	}

	return func(w http.ResponseWriter, r *http.Request) {
		results := make([]peerStatus, 0, len(peers))
		for name, addr := range peers {
			results = append(results, checkPeer(r.Context(), name, addr, cfg.GRPCUseTLS))
		}
		writeJSON(w, http.StatusOK, map[string]any{"self": "notification-service", "peers": results})
	}
}

// useTLS switches the dial from plaintext to TLS. Local dev / same-host docker-compose peers
// are plaintext; once a peer is only reachable through its own Cloudflare Tunnel hostname, this
// must be true (the tunnel terminates TLS at Cloudflare's edge and proxies to the peer's own
// plaintext HTTP/2 origin, so it's this client's outbound leg that needs to switch).
func checkPeer(ctx context.Context, name, addr string, useTLS bool) peerStatus {
	if addr == "" {
		return peerStatus{Peer: name, Status: "UNCONFIGURED"}
	}

	start := time.Now()

	dialCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	transportCreds := insecure.NewCredentials()
	if useTLS {
		transportCreds = credentials.NewTLS(&tls.Config{})
	}
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(transportCreds))
	if err != nil {
		return peerStatus{Peer: name, Address: addr, Status: "UNREACHABLE", Error: err.Error()}
	}
	defer conn.Close()

	resp, err := healthpb.NewHealthClient(conn).Check(dialCtx, &healthpb.HealthCheckRequest{})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return peerStatus{Peer: name, Address: addr, Status: "UNREACHABLE", LatencyMs: latency, Error: err.Error()}
	}

	return peerStatus{Peer: name, Address: addr, Status: resp.GetStatus().String(), LatencyMs: latency}
}
