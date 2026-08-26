"""Lazy shared redis.asyncio client singleton, mirroring db/client.py's MongoClient
singleton pattern but async (this module is only ever used from grpc_server.py's async
handlers). Connection/usage failures never crash the process — callers are expected to
catch exceptions from any command and fall through to computing the real result; a cache
outage must never break a request path that would otherwise succeed without caching.
"""

from __future__ import annotations

import logging
import os

import redis.asyncio as redis

logger = logging.getLogger("ai-service.redis")

_client: redis.Redis | None = None
_warned_missing_url = False


def get_client() -> redis.Redis | None:
    """Returns a shared redis.asyncio.Redis client, or None if REDIS_URL isn't configured.
    Does not eagerly connect — redis-py's asyncio client connects lazily on first command,
    so an unreachable host or bad URL only surfaces when a command actually fails, which
    callers must catch themselves."""
    global _client, _warned_missing_url

    if _client is not None:
        return _client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        if not _warned_missing_url:
            logger.warning("REDIS_URL not set — vendor-search caching disabled.")
            _warned_missing_url = True
        return None

    _client = redis.from_url(redis_url, decode_responses=True)
    return _client
