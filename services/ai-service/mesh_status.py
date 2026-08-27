"""Minimal stdlib-only HTTP server exposing GET /internal/mesh/status.

ai-service has no REST framework of its own (it's a pure gRPC service), so rather
than pulling in a whole web framework just for one diagnostic endpoint, this uses
http.server directly. It fans a real grpc.health.v1.Health/Check call out to each
of the other 4 services and reports their status — the literal, verifiable proof
that this service can reach every other service in the mesh, matching the same
/internal/mesh/status surface the other 4 services expose over their own REST APIs.

Runs in a background daemon thread started by grpc_server.py; a peer being down
must never crash this endpoint or the gRPC server itself.
"""

from __future__ import annotations

import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import grpc
from grpc_health.v1 import health_pb2, health_pb2_grpc

from grpc_clients import PEER_ADDRESSES, sync_channel_for

MESH_HTTP_PORT = int(os.getenv("MESH_HTTP_PORT", "7005"))

_CHECK_TIMEOUT_SECONDS = 3.0


def _check_peer(peer: str, address: str) -> dict:
    try:
        with sync_channel_for(peer) as channel:
            stub = health_pb2_grpc.HealthStub(channel)
            response = stub.Check(
                health_pb2.HealthCheckRequest(service=""),
                timeout=_CHECK_TIMEOUT_SECONDS,
            )
            status_name = health_pb2.HealthCheckResponse.ServingStatus.Name(response.status)
            return {"peer": peer, "address": address, "status": status_name, "reachable": True}
    except grpc.RpcError as exc:
        return {
            "peer": peer,
            "address": address,
            "status": "UNREACHABLE",
            "reachable": False,
            "error": exc.details() if hasattr(exc, "details") else str(exc),
        }


class MeshStatusHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - matches BaseHTTPRequestHandler signature
        pass  # keep stdout quiet; grpc_server.py owns real logging

    def do_GET(self):
        if self.path != "/internal/mesh/status":
            self.send_response(404)
            self.end_headers()
            return

        # Peers are checked concurrently, not sequentially — with 4 peers at a 3s
        # timeout each, sequential checks could take up to 12s when several are down.
        with ThreadPoolExecutor(max_workers=len(PEER_ADDRESSES)) as pool:
            results = list(
                pool.map(lambda item: _check_peer(*item), PEER_ADDRESSES.items())
            )

        body = json.dumps({"service": "ai-service", "peers": results}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_mesh_status_server() -> ThreadingHTTPServer:
    """Starts the mesh-status HTTP server on a background daemon thread and
    returns the server object (so callers can shut it down if needed)."""

    server = ThreadingHTTPServer(("0.0.0.0", MESH_HTTP_PORT), MeshStatusHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
