"""gRPC channels/stubs to the other 4 services in the mesh.

Two flavors are exposed because grpc_server.py runs the AiService servicer on
grpc.aio (async), while mesh_status.py's HTTP handler runs in a plain background
thread and needs synchronous grpc.insecure_channel calls instead — mixing an aio
channel into a non-asyncio thread would require its own event loop plumbing for
no benefit here.
"""

from __future__ import annotations

import os

import grpc
import grpc.aio

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "grpcgen"))

import notification_pb2_grpc  # noqa: E402

AUTH_GRPC_ADDR = os.getenv("AUTH_GRPC_ADDR", "localhost:6001")
TRANSACTION_GRPC_ADDR = os.getenv("TRANSACTION_GRPC_ADDR", "localhost:6002")
MESSAGING_GRPC_ADDR = os.getenv("MESSAGING_GRPC_ADDR", "localhost:6003")
NOTIFICATION_GRPC_ADDR = os.getenv("NOTIFICATION_GRPC_ADDR", "localhost:6004")

# Peers now require the mesh's shared token on every call.
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")

INTERNAL_METADATA = (("x-internal-token", INTERNAL_SERVICE_TOKEN),)

PEER_ADDRESSES = {
    "auth": AUTH_GRPC_ADDR,
    "transaction": TRANSACTION_GRPC_ADDR,
    "messaging": MESSAGING_GRPC_ADDR,
    "notification": NOTIFICATION_GRPC_ADDR,
}

# TLS when peers are only reachable through their Cloudflare Tunnel hostname (the tunnel
# terminates TLS at Cloudflare's edge and proxies to the peer's own plaintext HTTP/2 origin,
# so it's this client's outbound leg that must switch, not the peer's server credentials).
# Local dev / same-host docker-compose peers stay plaintext.
GRPC_USE_TLS = os.getenv("GRPC_USE_TLS", "false").lower() == "true"


def _channel_credentials() -> grpc.ChannelCredentials | None:
    return grpc.ssl_channel_credentials() if GRPC_USE_TLS else None


# --- async (used by grpc_server.py's servicer methods) ---------------------

_notification_channel = (
    grpc.aio.secure_channel(NOTIFICATION_GRPC_ADDR, _channel_credentials())
    if GRPC_USE_TLS
    else grpc.aio.insecure_channel(NOTIFICATION_GRPC_ADDR)
)
notification_stub = notification_pb2_grpc.NotificationServiceStub(_notification_channel)


# --- sync (used by mesh_status.py, which runs in a plain background thread) -

def sync_channel_for(peer: str) -> grpc.Channel:
    """Opens a fresh synchronous channel to one of the 4 peers by short name
    ("auth"/"transaction"/"messaging"/"notification"). Callers are responsible
    for closing it (mesh_status.py does this per-request via a `with` block)."""

    address = PEER_ADDRESSES[peer]
    if GRPC_USE_TLS:
        return grpc.secure_channel(address, _channel_credentials())
    return grpc.insecure_channel(address)
