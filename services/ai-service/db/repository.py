from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId

from db.client import (
    CLASSIFICATIONS_COLLECTION,
    MESSAGES_COLLECTION,
    RECOMMENDATIONS_COLLECTION,
    THREADS_COLLECTION,
    get_database,
)
from db.schemas import (
    ClassificationRecord,
    Message,
    MessageRole,
    RecommendationRecord,
    Thread,
    utcnow,
)


def _stringify_id(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


# ============================================================
# Threads
# ============================================================

def create_thread(user_id: str, title: str | None = None) -> str:
    db = get_database()
    thread = Thread(user_id=user_id, title=title)
    result = db[THREADS_COLLECTION].insert_one(thread.model_dump())
    return str(result.inserted_id)


def get_thread(thread_id: str) -> dict | None:
    db = get_database()
    try:
        object_id = ObjectId(thread_id)
    except (InvalidId, TypeError):
        # A malformed id is "no such thread", not a crash.
        return None
    doc = db[THREADS_COLLECTION].find_one({"_id": object_id})
    return _stringify_id(doc)


def thread_belongs_to(thread_id: str, user_id: str) -> bool:
    """Whether ``thread_id`` exists and is owned by ``user_id``.

    Chat history was previously loaded by thread id alone, with the owner recorded at creation
    and then never consulted, so passing someone else's threadId replayed their whole
    conversation into the model's context and appended to their thread.
    """
    thread = get_thread(thread_id)
    return thread is not None and thread.get("user_id") == user_id


def list_threads_for_user(user_id: str) -> list[dict]:
    db = get_database()
    cursor = db[THREADS_COLLECTION].find({"user_id": user_id}).sort("updated_at", -1)
    return [_stringify_id(doc) for doc in cursor]


def rename_thread(thread_id: str, title: str) -> None:
    db = get_database()
    db[THREADS_COLLECTION].update_one(
        {"_id": ObjectId(thread_id)},
        {"$set": {"title": title, "updated_at": utcnow()}},
    )


def delete_thread(thread_id: str) -> None:
    """Deletes a thread and every message that belongs to it."""
    db = get_database()
    db[MESSAGES_COLLECTION].delete_many({"thread_id": thread_id})
    db[THREADS_COLLECTION].delete_one({"_id": ObjectId(thread_id)})


# ============================================================
# Messages
# ============================================================

def add_message(
    thread_id: str,
    role: MessageRole,
    content: str,
    media_name: str | None = None,
    media_type: str | None = None,
) -> str:
    """Inserts a message and bumps the parent thread's updated_at so
    list_threads_for_user() can sort by most-recently-active."""
    db = get_database()
    message = Message(
        thread_id=thread_id,
        role=role,
        content=content,
        media_name=media_name,
        media_type=media_type,
    )

    result = db[MESSAGES_COLLECTION].insert_one(message.model_dump())
    db[THREADS_COLLECTION].update_one(
        {"_id": ObjectId(thread_id)},
        {"$set": {"updated_at": message.created_at}},
    )

    # Give the thread a title the first time the user says something, so the history list
    # has a meaningful label instead of a bare id. Only fills an empty title.
    if role == "human" and content.strip():
        db[THREADS_COLLECTION].update_one(
            {"_id": ObjectId(thread_id), "$or": [{"title": None}, {"title": ""}]},
            {"$set": {"title": content.strip()[:80]}},
        )

    return str(result.inserted_id)


def get_messages_for_thread(thread_id: str) -> list[dict]:
    db = get_database()
    cursor = db[MESSAGES_COLLECTION].find({"thread_id": thread_id}).sort("created_at", 1)
    return [_stringify_id(doc) for doc in cursor]


# ============================================================
# Waste classifier history
# ============================================================

def save_classification(record: ClassificationRecord) -> str:
    db = get_database()
    result = db[CLASSIFICATIONS_COLLECTION].insert_one(record.model_dump())
    return str(result.inserted_id)


def list_classifications_for_user(user_id: str, limit: int = 50) -> list[dict]:
    db = get_database()
    cursor = (
        db[CLASSIFICATIONS_COLLECTION]
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_stringify_id(doc) for doc in cursor]


# ============================================================
# Waste recommendation history
# ============================================================

def save_recommendation(record: RecommendationRecord) -> str:
    db = get_database()
    result = db[RECOMMENDATIONS_COLLECTION].insert_one(record.model_dump())
    return str(result.inserted_id)


def list_recommendations_for_user(user_id: str, limit: int = 50) -> list[dict]:
    db = get_database()
    cursor = (
        db[RECOMMENDATIONS_COLLECTION]
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_stringify_id(doc) for doc in cursor]
