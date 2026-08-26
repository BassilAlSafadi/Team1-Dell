"""Throwaway manual verification script — NOT part of the automated test suite.

Calls the running ai-service gRPC server's ClassifyWaste RPC with a real test image,
so a human can eyeball that the mesh wiring actually works end-to-end (image bytes
in, a real Gemini classification + vendor matches + hazard-notification side effect
out). Requires grpc_server.py to already be running (`python grpc_server.py`) and a
real GEMINI_API_KEY/MONGODB_URI configured in .env.

Usage (from services/ai-service/):
    python scripts/smoke_classify.py [path/to/image] [grpc-host:port]
Defaults to images/test1.jfif against localhost:6005.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "grpcgen"))

import grpc  # noqa: E402

import ai_pb2  # noqa: E402
import ai_pb2_grpc  # noqa: E402


def main() -> None:
    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "images" / "test1.jfif"
    address = sys.argv[2] if len(sys.argv) > 2 else "localhost:6005"

    if not image_path.exists():
        print(f"Image not found: {image_path}")
        sys.exit(1)

    image_bytes = image_path.read_bytes()

    with grpc.insecure_channel(address) as channel:
        stub = ai_pb2_grpc.AiServiceStub(channel)
        response = stub.ClassifyWaste(
            ai_pb2.ClassifyWasteRequest(
                user_id="demo-business-nasr-city",
                image_data=image_bytes,
                image_name=image_path.name,
                business_location="Nasr City",
            ),
            timeout=120,
        )

    print(f"classification_id : {response.classification_id}")
    print(f"primary_category  : {response.primary_category}")
    print(f"confidence        : {response.confidence:.0%}")
    print(f"is_mixed          : {response.is_mixed}")
    print(f"hazard_flag       : {response.hazard_flag}")
    if response.hazard_flag:
        print(f"hazard_reason     : {response.hazard_reason}")
    print(f"needs_review      : {response.needs_review}")
    print(f"reasoning         : {response.reasoning}")
    print(f"items detected    : {len(response.items)}")
    for item in response.items:
        print(f"  - {item.description} ({item.category}, {item.confidence:.0%})")
    print(f"vendor categories : {list(response.vendors_by_category.keys())}")


if __name__ == "__main__":
    main()
