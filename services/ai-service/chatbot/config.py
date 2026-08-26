import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# chatbot/ is a package inside services/ai-service/ — add the service root to sys.path so
# `import gemini_keys` (a top-level module, not part of the chatbot package) resolves the
# same way it does for waste_classifier.py/waste_recommendations.py.
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from gemini_keys import FALLBACK_API_KEY as GEMINI_API_KEY_FALLBACK  # noqa: E402
from gemini_keys import MODEL_FALLBACK_CHAIN  # noqa: E402
from gemini_keys import PRIMARY_API_KEY as GEMINI_API_KEY  # noqa: E402

# No longer used to pick a single model — every Gemini call site in this service (the
# chatbot, ingest.py's OCR, waste_classifier.py, waste_recommendations.py) now tries
# MODEL_FALLBACK_CHAIN in order instead. Left set (not read anywhere) in case you want a
# quick way to note what was previously configured; safe to remove from .env.
GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.5-flash")
EMBEDDING_MODEL_NAME = os.getenv(
    "EMBEDDING_MODEL_NAME", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)
HUGGINGFACEHUB_API_TOKEN = os.getenv("HUGGINGFACEHUB_API_TOKEN") or None

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))

DATA_DIR = SERVICE_ROOT / "data"
SOURCE_PDFS_DIR = DATA_DIR / "source_pdfs"
OCR_CACHE_DIR = DATA_DIR / "ocr_cache"
VECTOR_STORE_DIR = DATA_DIR / "vector_store"

RECYCLING_GUIDE_PDF = SOURCE_PDFS_DIR / "recycling_howto_msw.pdf"
EGYPT_LAW_PDF = SOURCE_PDFS_DIR / "egypt_waste_law_202_2020.pdf"

RECYCLING_GUIDE_COLLECTION = "recycling_howto"
EGYPT_LAW_COLLECTION = "egypt_waste_law"
