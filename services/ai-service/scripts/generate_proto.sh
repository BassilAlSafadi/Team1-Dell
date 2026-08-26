#!/usr/bin/env bash
# Regenerates the gRPC Python stubs in services/ai-service/grpcgen/ from the shared
# /proto contracts. Run from services/ai-service/ (or anywhere — this script cd's there).
#
# Generated FLAT (no v1 subpackages): grpcio-tools' generated *_pb2_grpc.py files use
# bare `import foo_pb2`, which only resolves if the generated directory itself is on
# sys.path (a well-known grpcio-tools limitation, not specific to this repo) — grpc_server.py
# inserts grpcgen/ onto sys.path at startup to make that work, so keeping the output flat
# (rather than mirroring proto/<domain>/v1/) avoids fighting that import quirk.
set -euo pipefail
cd "$(dirname "$0")/.."

PROTO_ROOT="../../proto"

# health.proto is NOT generated here — grpcio-health-checking already ships pre-built
# grpc_health.v1 stubs (both server registration and client). Only messaging-service
# (Node) needs the vendored proto/health/v1/health.proto text, since @grpc/proto-loader
# has no equivalent pre-built client.
python -m grpc_tools.protoc \
  -I "$PROTO_ROOT/ai/v1" \
  -I "$PROTO_ROOT/transaction/v1" \
  -I "$PROTO_ROOT/messaging/v1" \
  -I "$PROTO_ROOT/notification/v1" \
  -I "$PROTO_ROOT/auth/v1" \
  --python_out=./grpcgen \
  --grpc_python_out=./grpcgen \
  --pyi_out=./grpcgen \
  "$PROTO_ROOT/ai/v1/ai.proto" \
  "$PROTO_ROOT/transaction/v1/transaction.proto" \
  "$PROTO_ROOT/messaging/v1/messaging.proto" \
  "$PROTO_ROOT/notification/v1/notification.proto" \
  "$PROTO_ROOT/auth/v1/auth.proto"

echo "Generated stubs in services/ai-service/grpcgen/"
