"""ai-service's first long-running server process.

Runs a grpc.aio server implementing AiService (ClassifyWaste, GetRecommendation),
plus the standard grpc.health.v1.Health service, plus a background stdlib HTTP
server for /internal/mesh/status (mesh_status.py) — matching the same pattern the
other 4 services use to prove full-mesh gRPC connectivity.

The existing CLI scripts (chatbot.chat, waste_classifier.py's __main__ block,
waste_recommendations.py's __main__ block) are unchanged and still runnable
directly/manually; this is a new, additional entrypoint.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from concurrent import futures
from pathlib import Path

# Must happen before importing any generated *_pb2*/*_pb2_grpc* modules — grpcio-tools'
# generated _pb2_grpc.py files use bare `import foo_pb2`, which only resolves if the
# generated directory itself is on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent / "grpcgen"))

import grpc  # noqa: E402
from google.protobuf import timestamp_pb2  # noqa: E402
from grpc_health.v1 import health_pb2, health_pb2_grpc  # noqa: E402
from grpc_health.v1.health import aio as health_aio  # noqa: E402

import ai_pb2  # noqa: E402
import ai_pb2_grpc  # noqa: E402
import notification_pb2  # noqa: E402

from chatbot import config as chatbot_config  # noqa: E402
from chatbot.agent import build_llm, new_conversation, run_turn  # noqa: E402
from db.repository import add_message, create_thread, get_messages_for_thread  # noqa: E402
from gemini_keys import call_with_gemini_fallback  # noqa: E402
from grpc_clients import notification_stub  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from mesh_status import start_mesh_status_server  # noqa: E402
from vendor_cache import get_vendor_recommendations  # noqa: E402
from waste_classifier import WasteClassifier, save_classification_result  # noqa: E402
from waste_recommendations import (  # noqa: E402
    analyze_waste,
    analyze_weekly_trends,
    generate_ai_recommendation,
    load_scans,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service.grpc")

GRPC_PORT = os.getenv("GRPC_PORT", "6005")

_NOTIFICATION_CALL_TIMEOUT_SECONDS = 3.0


def _detected_items_to_proto(items) -> list[ai_pb2.DetectedItem]:
    return [
        ai_pb2.DetectedItem(
            description=item.description,
            category=item.category,
            confidence=item.confidence,
            material_evidence=item.material_evidence,
        )
        for item in items
    ]


def _vendors_by_category_to_proto(vendors_by_category: dict) -> dict:
    proto_map = {}
    for category, vendors in vendors_by_category.items():
        proto_vendors = []
        for vendor in vendors:
            proto_vendors.append(
                ai_pb2.Vendor(
                    name=vendor["name"],
                    offer_price=vendor.get("offer_price"),
                    location=vendor.get("location"),
                    pickup_available=vendor.get("pickup_available"),
                )
            )
        proto_map[category] = ai_pb2.VendorList(vendors=proto_vendors)
    return proto_map


class AiServiceServicer(ai_pb2_grpc.AiServiceServicer):
    def __init__(self):
        self._classifier = WasteClassifier()

    async def ClassifyWaste(self, request: ai_pb2.ClassifyWasteRequest, context):
        result = self._classifier.classify_bytes(request.image_data, request.image_name or "upload.jpg")

        if result.classification is None:
            await context.abort(grpc.StatusCode.INTERNAL, result.error or "Classification failed.")
            return ai_pb2.ClassifyWasteResponse()

        classification_id = save_classification_result(result, user_id=request.user_id) or ""

        business_location = request.business_location if request.HasField("business_location") else None
        vendors_by_category = await get_vendor_recommendations(result.classification, business_location=business_location)

        c = result.classification

        if c.hazard_flag:
            await self._notify_hazard(request.user_id, c.hazard_reason, classification_id)

        return ai_pb2.ClassifyWasteResponse(
            classification_id=classification_id,
            primary_category=c.primary_category,
            confidence=c.confidence,
            items=_detected_items_to_proto(c.items),
            is_mixed=c.is_mixed,
            hazard_flag=c.hazard_flag,
            hazard_reason=c.hazard_reason,
            contamination_notes=c.contamination_notes,
            reasoning=c.reasoning,
            needs_review=result.needs_review,
            vendors_by_category=_vendors_by_category_to_proto(vendors_by_category),
        )

    async def _notify_hazard(self, user_id: str, hazard_reason: str, classification_id: str) -> None:
        """Best-effort: notification-service being down must never fail a classification."""
        try:
            await notification_stub.CreateNotification(
                notification_pb2.CreateNotificationRequest(
                    user_id=user_id,
                    type="HAZARD_ALERT",
                    title="Hazardous waste detected",
                    body=hazard_reason or "A recent waste scan flagged a potential hazard.",
                    entity=notification_pb2.EntityRef(type="classification", id=classification_id),
                ),
                timeout=_NOTIFICATION_CALL_TIMEOUT_SECONDS,
            )
        except grpc.RpcError as exc:
            logger.warning("Hazard notification failed (notification-service unreachable?): %s", exc)
        except Exception:
            logger.exception("Unexpected error sending hazard notification.")

    async def GetRecommendation(self, request: ai_pb2.GetRecommendationRequest, context):
        limit = request.scan_limit or 200
        scans = load_scans(request.user_id, limit=limit)

        analysis = analyze_waste(scans)
        if analysis is None:
            await context.abort(grpc.StatusCode.NOT_FOUND, "No waste scans available for this user.")
            return ai_pb2.GetRecommendationResponse()

        trend_analysis = analyze_weekly_trends(scans)
        recommendation_text = generate_ai_recommendation(analysis, trend_analysis)

        if not recommendation_text:
            await context.abort(grpc.StatusCode.INTERNAL, "Failed to generate a recommendation.")
            return ai_pb2.GetRecommendationResponse()

        generated_at = timestamp_pb2.Timestamp()
        generated_at.GetCurrentTime()

        return ai_pb2.GetRecommendationResponse(
            recommendation_text=recommendation_text,
            generated_at=generated_at,
        )

    async def Chat(self, request: ai_pb2.ChatRequest, context):
        if not chatbot_config.VECTOR_STORE_DIR.exists() or not any(chatbot_config.VECTOR_STORE_DIR.iterdir()):
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION,
                "Chat knowledge base not ingested yet - run 'python -m chatbot.ingest' first.",
            )
            return ai_pb2.ChatResponse()

        thread_id = request.thread_id if request.HasField("thread_id") and request.thread_id else None
        if thread_id:
            messages = new_conversation()
            for doc in get_messages_for_thread(thread_id):
                if doc["role"] == "human":
                    messages.append(HumanMessage(content=doc["content"]))
                elif doc["role"] == "ai":
                    messages.append(AIMessage(content=doc["content"]))
        else:
            thread_id = create_thread(request.user_id)
            messages = new_conversation()

        messages.append(HumanMessage(content=request.message))
        add_message(thread_id, "human", request.message)

        checkpoint = len(messages)
        response_chunks: list[str] = []

        def attempt(model: str, api_key: str):
            del messages[checkpoint:]
            response_chunks.clear()
            turn_llm = build_llm(model=model, api_key=api_key)
            return run_turn(messages, turn_llm, on_chunk=response_chunks.append)

        try:
            await asyncio.to_thread(call_with_gemini_fallback, attempt)
        except Exception as exc:
            logger.exception("Chat request failed on every configured Gemini model/key")
            await context.abort(grpc.StatusCode.INTERNAL, f"Chat request failed: {exc}")
            return ai_pb2.ChatResponse()

        reply = "".join(response_chunks)
        add_message(thread_id, "ai", reply)

        return ai_pb2.ChatResponse(reply=reply, thread_id=thread_id)


async def serve() -> None:
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    ai_pb2_grpc.add_AiServiceServicer_to_server(AiServiceServicer(), server)

    # grpc.aio needs the aio-flavored HealthServicer (grpc_health.v1.health.aio) —
    # its .set() is a coroutine and must be awaited.
    health_servicer = health_aio.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    await health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    await health_servicer.set("ai.v1.AiService", health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port(f"[::]:{GRPC_PORT}")

    start_mesh_status_server()

    await server.start()
    logger.info("ai-service gRPC server listening on port %s", GRPC_PORT)
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
