import os

from dotenv import load_dotenv

load_dotenv()

# ai-service has no auth layer of its own — it never validates a JWT or issues
# a session. Until it does, every script that needs "the current user" (chat
# history, classification history, recommendation history) reads this single
# id instead of hardcoding its own demo string.
#
# auth-service's users.user_id is a Postgres uuid (see
# AuthService.Domain.Entities.User.UserId). Once that table is seeded, set
# DEMO_USER_ID in .env to a real seeded user's uuid so ai-service's Mongo
# history lines up with an actual account instead of a placeholder label.
DEMO_USER_ID = os.getenv("DEMO_USER_ID") or "demo-business-nasr-city"
