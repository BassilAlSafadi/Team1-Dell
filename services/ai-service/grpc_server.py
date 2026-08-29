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
import base64
import logging
import os
import queue
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
from db.repository import (  # noqa: E402
    add_message,
    create_thread,
    get_messages_for_thread,
    thread_belongs_to,
)
from gemini_keys import call_with_gemini_fallback  # noqa: E402
from grpc_clients import INTERNAL_METADATA, notification_stub  # noqa: E402
from internal_auth import InternalAuthInterceptor  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from mesh_status import start_mesh_status_server  # noqa: E402
from vendor_cache import get_vendor_recommendations  # noqa: E402
from waste_classifier import (  # noqa: E402
    WasteClassifier,
    encode_image_bytes,
    save_classification_result,
)
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

MAX_CHAT_MESSAGE_CHARS = 8000
# Chat attachment ceiling. Larger media is acknowledged by name but not sent to the model.
MAX_CHAT_MEDIA_BYTES = 20 * 1024 * 1024
_INLINE_MEDIA_PREFIXES = ("video/", "audio/")
_INLINE_MEDIA_TYPES = {"application/pdf"}
DEFAULT_SCAN_LIMIT = 200
MAX_SCAN_LIMIT = 1000

# Shared mesh secret. Required: this server's RPCs act on a caller-supplied user_id, so the port
# must never be callable by anything but the gateway and other mesh peers.
INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")


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


def _build_user_turn(request: ai_pb2.ChatRequest) -> tuple[HumanMessage, str]:
    """Builds this turn's HumanMessage (multimodal when media is attached) and the text to
    persist. Media bytes are never stored and are only seen by the model on the turn they
    arrive — history replay stays text-only to keep the context bounded."""
    text = request.message or ""
    media = request.media_data
    if not media:
        return HumanMessage(content=text), text

    name = request.media_name or "attachment"
    mime = (request.media_type or "").lower()

    if len(media) > MAX_CHAT_MEDIA_BYTES:
        note = f"[attached file: {name} — too large for me to open]"
        return HumanMessage(content=f"{text}\n\n{note}".strip()), (text or note)

    parts: list = []
    if text:
        parts.append({"type": "text", "text": text})

    if mime.startswith("image/"):
        encoded, out_mime = encode_image_bytes(media)
        data_uri = f"data:{out_mime};base64,{encoded}"
        parts.append({"type": "image_url", "image_url": {"url": data_uri}})
        stored = text or f"[image: {name}]"
    elif mime.startswith(_INLINE_MEDIA_PREFIXES) or mime in _INLINE_MEDIA_TYPES:
        parts.append(
            {"type": "media", "mime_type": mime, "data": base64.b64encode(media).decode("utf-8")}
        )
        stored = text or f"[media: {name}]"
    else:
        parts.append(
            {
                "type": "text",
                "text": (
                    f"[attached file: {name} ({mime or 'unknown type'}) "
                    "— I can't read this file type]"
                ),
            }
        )
        stored = text or f"[file: {name}]"

    return HumanMessage(content=parts), stored


class AiServiceServicer(ai_pb2_grpc.AiServiceServicer):
    def __init__(self):
        self._classifier = WasteClassifier()

    async def ClassifyWaste(self, request: ai_pb2.ClassifyWasteRequest, context):
        result = self._classifier.classify_bytes(request.image_data, request.image_name or "upload.jpg")

        if result.classification is None:
            await context.abort(grpc.StatusCode.INTERNAL, result.error or "Classification failed.")
            return ai_pb2.ClassifyWasteResponse()

        try:
            classification_id = save_classification_result(result, user_id=request.user_id) or ""
        except Exception:
            # Best-effort, same as _notify_hazard below: a persistence outage (e.g. Mongo
            # unreachable) must never fail a classification the user is actively waiting on.
            logger.exception("Failed to persist classification result")
            classification_id = ""

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
                metadata=INTERNAL_METADATA,
            )
        except grpc.RpcError as exc:
            logger.warning("Hazard notification failed (notification-service unreachable?): %s", exc)
        except Exception:
            logger.exception("Unexpected error sending hazard notification.")

    async def GetRecommendation(self, request: ai_pb2.GetRecommendationRequest, context):
        # scan_limit arrives straight from a query string, so clamp it: a negative value is
        # meaningless to Mongo's limit() and a huge one is an easy way to pull the whole
        # collection into memory.
        limit = request.scan_limit or DEFAULT_SCAN_LIMIT
        limit = max(1, min(limit, MAX_SCAN_LIMIT))
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
        if (not request.message or not request.message.strip()) and not request.media_data:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "message must not be empty.")
            return ai_pb2.ChatResponse()

        if len(request.message) > MAX_CHAT_MESSAGE_CHARS:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                f"message must be at most {MAX_CHAT_MESSAGE_CHARS} characters.",
            )
            return ai_pb2.ChatResponse()

        if not chatbot_config.VECTOR_STORE_DIR.exists() or not any(chatbot_config.VECTOR_STORE_DIR.iterdir()):
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION,
                "Chat knowledge base not ingested yet - run 'python -m chatbot.ingest' first.",
            )
            return ai_pb2.ChatResponse()

        try:
            thread_id = request.thread_id if request.HasField("thread_id") and request.thread_id else None
            if thread_id:
                # A thread id alone must never be enough to read or extend a conversation:
                # without this, any caller could pass another user's threadId and have their
                # entire history replayed into the model (and their thread appended to).
                if not thread_belongs_to(thread_id, request.user_id):
                    await context.abort(
                        grpc.StatusCode.PERMISSION_DENIED,
                        "That conversation does not exist or does not belong to you.",
                    )
                    return ai_pb2.ChatResponse()

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

            await asyncio.to_thread(call_with_gemini_fallback, attempt)

            reply = "".join(response_chunks)
            add_message(thread_id, "ai", reply)
        except Exception:
            # Covers both Mongo (thread/message persistence) and every configured Gemini
            # model/key failing — logged in full here, but the client only ever sees a short,
            # safe message (some of these exceptions, e.g. pymongo's, stringify to multi-KB
            # topology dumps that must never reach the chat UI).
            logger.exception("Chat request failed")
            await context.abort(
                grpc.StatusCode.INTERNAL,
                "The assistant is temporarily unavailable. Please try again shortly.",
            )
            return ai_pb2.ChatResponse()

        return ai_pb2.ChatResponse(reply=reply, thread_id=thread_id)

    async def ChatStream(self, request: ai_pb2.ChatRequest, context):
        """Same turn as Chat, but yields ChatChunks as the model streams them instead of
        buffering the whole reply. The Gemini call itself is synchronous (langchain's
        .stream()), so it runs on a worker thread that pushes onto a plain thread-safe
        queue.Queue; this coroutine drains that queue and yields as items arrive. Chunks
        are not buffered per gemini_keys retry: a fallback retry restarts the reply from
        scratch (see attempt()), so a 'reset' chunk tells the client to discard whatever
        text_delta it has already rendered for this turn before the retry's deltas arrive.
        """
        if (not request.message or not request.message.strip()) and not request.media_data:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "message must not be empty.")
            return

        if len(request.message) > MAX_CHAT_MESSAGE_CHARS:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                f"message must be at most {MAX_CHAT_MESSAGE_CHARS} characters.",
            )
            return

        if not chatbot_config.VECTOR_STORE_DIR.exists() or not any(chatbot_config.VECTOR_STORE_DIR.iterdir()):
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION,
                "Chat knowledge base not ingested yet - run 'python -m chatbot.ingest' first.",
            )
            return

        thread_id = request.thread_id if request.HasField("thread_id") and request.thread_id else None
        if thread_id:
            if not thread_belongs_to(thread_id, request.user_id):
                await context.abort(
                    grpc.StatusCode.PERMISSION_DENIED,
                    "That conversation does not exist or does not belong to you.",
                )
                return

            messages = new_conversation()
            for doc in get_messages_for_thread(thread_id):
                if doc["role"] == "human":
                    messages.append(HumanMessage(content=doc["content"]))
                elif doc["role"] == "ai":
                    messages.append(AIMessage(content=doc["content"]))
        else:
            thread_id = create_thread(request.user_id)
            messages = new_conversation()

        user_message, stored_text = _build_user_turn(request)
        messages.append(user_message)
        add_message(
            thread_id,
            "human",
            stored_text,
            media_name=request.media_name or None,
            media_type=request.media_type or None,
        )

        checkpoint = len(messages)
        response_chunks: list[str] = []
        q: queue.Queue = queue.Queue()
        attempt_no = 0

        def on_chunk(text: str) -> None:
            response_chunks.append(text)
            q.put(("delta", text))

        def attempt(model: str, api_key: str):
            nonlocal attempt_no
            if attempt_no > 0:
                q.put(("reset", None))
            attempt_no += 1
            del messages[checkpoint:]
            response_chunks.clear()
            turn_llm = build_llm(model=model, api_key=api_key)
            return run_turn(messages, turn_llm, on_chunk=on_chunk)

        def worker() -> None:
            try:
                call_with_gemini_fallback(attempt)
            except Exception as exc:  # noqa: BLE001 - forwarded to the consumer below, not swallowed
                q.put(("error", exc))
            else:
                q.put(("done", None))

        worker_task = asyncio.create_task(asyncio.to_thread(worker))

        try:
            while True:
                kind, payload = await asyncio.to_thread(q.get)
                if kind == "delta":
                    yield ai_pb2.ChatChunk(text_delta=payload, thread_id=thread_id)
                elif kind == "reset":
                    yield ai_pb2.ChatChunk(thread_id=thread_id, reset=True)
                elif kind == "error":
                    logger.error("Chat stream failed", exc_info=payload)
                    await context.abort(
                        grpc.StatusCode.INTERNAL,
                        "The assistant is temporarily unavailable. Please try again shortly.",
                    )
                    return
                else:  # "done"
                    break
        finally:
            await worker_task

        reply = "".join(response_chunks)
        try:
            add_message(thread_id, "ai", reply)
        except Exception:
            # Same tolerance as Chat: the user already has the full reply, only the next
            # turn's history would be short a message, which is already the case whenever
            # this is transient.
            logger.exception("Failed to persist assistant reply")

        yield ai_pb2.ChatChunk(thread_id=thread_id, done=True)


async def serve() -> None:
    server = grpc.aio.server(
        futures.ThreadPoolExecutor(max_workers=10),
        interceptors=(InternalAuthInterceptor(INTERNAL_SERVICE_TOKEN),),
    )
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
