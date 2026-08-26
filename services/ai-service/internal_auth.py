"""Internal-mesh authentication for ai-service's gRPC surface.

Every RPC here acts on a caller-supplied ``user_id`` (classify-and-persist, read a user's
recommendations, read/extend a chat thread), so the port must only ever be reachable by the
gateway and other mesh peers. It previously accepted anonymous calls from anyone who could reach
it, which meant anyone could act as any user and spend the project's Gemini quota.

``grpc.health.v1.Health`` stays exempt so the gateway's health checker can probe it.
"""

from __future__ import annotations

import hmac

import grpc

_HEALTH_PREFIX = "/grpc.health.v1.Health/"
_TOKEN_KEY = "x-internal-token"


class InternalAuthInterceptor(grpc.aio.ServerInterceptor):
    def __init__(self, token: str):
        self._token = token

    async def intercept_service(self, continuation, handler_call_details):
        method = handler_call_details.method or ""
        if method.startswith(_HEALTH_PREFIX):
            return await continuation(handler_call_details)

        # Resolved before the auth check (this only looks up the registered handler, it
        # doesn't invoke it) purely so a rejection can be shaped to match the RPC's real
        # cardinality — ChatStream is unary_stream, and aborting it with a unary_unary
        # handler would desync the client's stream reader instead of surfacing a clean
        # UNAUTHENTICATED.
        handler = await continuation(handler_call_details)

        if not self._token:
            return _abort_handler(
                handler,
                grpc.StatusCode.FAILED_PRECONDITION,
                "Internal service token is not configured.",
            )

        metadata = dict(handler_call_details.invocation_metadata or ())
        presented = metadata.get(_TOKEN_KEY, "")

        # hmac.compare_digest is constant-time, so this can't be turned into a byte-at-a-time
        # oracle for the token.
        if not hmac.compare_digest(str(presented), self._token):
            return _abort_handler(
                handler,
                grpc.StatusCode.UNAUTHENTICATED,
                "This endpoint is restricted to internal mesh callers.",
            )

        return handler


def _abort_handler(handler, code: grpc.StatusCode, details: str):
    if handler is not None and handler.response_streaming:
        async def abort_stream(request, context):
            await context.abort(code, details)
            return
            yield  # pragma: no cover - makes this an async generator, never reached

        return grpc.unary_stream_rpc_method_handler(abort_stream)

    async def abort_unary(request, context):
        await context.abort(code, details)

    return grpc.unary_unary_rpc_method_handler(abort_unary)
