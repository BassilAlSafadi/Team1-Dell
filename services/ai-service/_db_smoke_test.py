"""Throwaway connectivity + CRUD smoke test for db/. Deleted after use."""
from db.client import ensure_indexes, get_client
from db.repository import (
    add_message,
    create_thread,
    delete_thread,
    get_messages_for_thread,
    get_thread,
    list_classifications_for_user,
    list_recommendations_for_user,
    list_threads_for_user,
    save_classification,
    save_recommendation,
)
from db.schemas import ClassificationRecord, RecommendationRecord

USER_ID = "smoke-test-user"

print("Pinging Atlas...")
get_client().admin.command("ping")
print("OK: connected")

ensure_indexes()
print("OK: indexes ensured")

thread_id = create_thread(USER_ID, title="Smoke test thread")
print(f"OK: created thread {thread_id}")

add_message(thread_id, "human", "What bin does a plastic bottle go in?")
add_message(thread_id, "ai", "Plastics bin.")
messages = get_messages_for_thread(thread_id)
assert len(messages) == 2
assert messages[0]["role"] == "human"
assert messages[1]["role"] == "ai"
print(f"OK: round-tripped {len(messages)} messages")

thread = get_thread(thread_id)
assert thread["title"] == "Smoke test thread"
threads = list_threads_for_user(USER_ID)
assert any(t["_id"] == thread_id for t in threads)
print("OK: thread lookup + listing")

save_classification(
    ClassificationRecord(
        user_id=USER_ID,
        primary_category="plastics",
        confidence=0.92,
        is_mixed=False,
        hazard_flag=False,
        reasoning="Clear PET bottle texture.",
    )
)
classifications = list_classifications_for_user(USER_ID)
assert len(classifications) == 1
print("OK: classification history round-trip")

save_recommendation(
    RecommendationRecord(
        user_id=USER_ID,
        analysis={"total_scans": 3},
        recommendation_text="Buy in bulk to cut packaging waste.",
    )
)
recommendations = list_recommendations_for_user(USER_ID)
assert len(recommendations) == 1
print("OK: recommendation history round-trip")

delete_thread(thread_id)
assert get_thread(thread_id) is None
assert get_messages_for_thread(thread_id) == []
print("OK: thread cascade delete")

get_client().get_database()[  # cleanup the classification/recommendation test docs
    "waste_classifications"
].delete_many({"user_id": USER_ID})
get_client().get_database()["waste_recommendations"].delete_many({"user_id": USER_ID})
print("OK: cleaned up test data")

print("\nALL SMOKE TESTS PASSED")
