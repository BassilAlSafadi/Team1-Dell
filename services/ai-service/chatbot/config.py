import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

SERVICE_ROOT = Path(__file__).resolve().parent.parent

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY or GEMINI_API_KEY == "CHANGE_ME":
    raise ValueError("GEMINI_API_KEY not set in .env")

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
