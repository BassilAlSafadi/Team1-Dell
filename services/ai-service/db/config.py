import os

from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError("MONGODB_URI not set in .env")

# Not a secret (unlike the credentials embedded in MONGODB_URI), so it's fine to default
# rather than require it in .env.
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME") or "ai_service"
