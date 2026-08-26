#!/usr/bin/env bash
# Regenerates every checked-in gRPC stub from the shared /proto contracts.
#
# C# (auth-service, transaction-service) needs nothing here — Grpc.Tools regenerates its
# stubs automatically on `dotnet build` and never commits them.
# Node (messaging-service) needs nothing here either — @grpc/proto-loader reads the .proto
# files directly at runtime, no codegen step.
# Go (notification-service) and Python (ai-service) commit their generated stubs, so re-run
# this after any change under /proto.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Go (notification-service) =="
(cd services/notification-service && buf generate ../../proto)

echo "== Python (ai-service) =="
(cd services/ai-service && bash scripts/generate_proto.sh)

echo "Done."
