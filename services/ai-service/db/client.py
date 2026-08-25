from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from db import config

THREADS_COLLECTION = "threads"
MESSAGES_COLLECTION = "messages"
CLASSIFICATIONS_COLLECTION = "waste_classifications"
RECOMMENDATIONS_COLLECTION = "waste_recommendations"


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    """One MongoClient per process — it already pools connections internally, so it
    should be created once and reused rather than per-request."""
    return MongoClient(config.MONGODB_URI)


def get_database() -> Database:
    return get_client()[config.MONGODB_DB_NAME]


def ensure_indexes() -> None:
    """Creates the indexes the query patterns in repository.py rely on. Safe to call
    repeatedly on startup — create_index() is a no-op if an identical index already
    exists."""
    db = get_database()

    db[THREADS_COLLECTION].create_index("user_id")
    db[MESSAGES_COLLECTION].create_index([("thread_id", 1), ("created_at", 1)])
    db[CLASSIFICATIONS_COLLECTION].create_index([("user_id", 1), ("created_at", -1)])
    db[RECOMMENDATIONS_COLLECTION].create_index([("user_id", 1), ("created_at", -1)])
