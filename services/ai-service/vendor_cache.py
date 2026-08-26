"""Cache-aside wrapper around vendor_search.search_vendors_for_categories, used only by
grpc_server.py's ClassifyWaste handler — the CLI scripts (waste_classifier.py's __main__
block, etc.) keep calling vendor_search/waste_classifier directly, uncached.

Pure TTL expiry (10 minutes, see REDIS_INTEGRATION_PLAN.md's cache-aside table) — vendors.json
is effectively static, so no write-invalidation is needed. Redis errors (including no
REDIS_URL configured) fall through to computing the real result: a cache outage must never
break waste classification.
"""

from __future__ import annotations

import json
import logging

from redis_client import get_client
from vendor_search import search_vendors_for_categories
from waste_classifier import get_detected_categories

logger = logging.getLogger("ai-service.vendor_cache")

_TTL_SECONDS = 600  # 10 minutes


def _cache_key(categories: list[str], business_location: str | None) -> str:
    sorted_categories = ":".join(sorted(categories))
    location_part = business_location or "any"
    return f"cache:ai:vendor-search:{sorted_categories}:{location_part}"


async def get_vendor_recommendations(classification, business_location: str | None = None) -> dict:
    """Drop-in replacement for waste_classifier.recommend_vendors, but cached. Computes the
    same detected-categories list recommend_vendors would (via the same get_detected_categories
    helper), then checks Redis before falling back to the real vendor_search lookup."""
    categories = get_detected_categories(classification)
    key = _cache_key(categories, business_location)

    client = get_client()
    if client is not None:
        try:
            cached = await client.get(key)
            if cached is not None:
                return json.loads(cached)
        except Exception:
            logger.warning(
                "Redis GET failed for vendor-search cache key %s; falling back to live lookup.",
                key,
                exc_info=True,
            )

    result = search_vendors_for_categories(categories, business_location=business_location)

    if client is not None:
        try:
            await client.set(key, json.dumps(result), ex=_TTL_SECONDS)
        except Exception:
            logger.warning("Redis SET failed for vendor-search cache key %s.", key, exc_info=True)

    return result
