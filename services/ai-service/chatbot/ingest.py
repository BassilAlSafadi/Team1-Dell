"""
Builds the two vector store collections from the source PDFs.

- egypt_waste_law_202_2020.pdf: typeset with a legacy Arabic font that has no usable
  Unicode mapping, so pypdf/pymupdf/pdfplumber all extract mojibake. Each page is
  rendered to an image and transcribed by Gemini's vision instead. Transcriptions are
  cached to disk (data/ocr_cache/) so re-running ingestion doesn't re-call the API.
- recycling_howto_msw.pdf: a normal text PDF, extracted directly.

Run with: python -m chatbot.ingest [--force]
"""

import argparse
import sys

import pymupdf
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from chatbot import config
from gemini_keys import call_with_gemini_fallback

OCR_PROMPT = (
    "You are an OCR engine. Transcribe all Arabic legal text visible in this image "
    "exactly as written, including article markers such as المادة "
    "(article) and any numbering. Output only the transcribed Arabic text, nothing else: "
    "no translation, no commentary, no markdown."
)


def _get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL_NAME)


def _ocr_law_pdf(force: bool) -> list[Document]:
    if not config.EGYPT_LAW_PDF.exists():
        raise FileNotFoundError(
            f"Missing {config.EGYPT_LAW_PDF}. Put the law PDF there before ingesting."
        )

    config.OCR_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(str(config.EGYPT_LAW_PDF))
    pages_text: list[tuple[int, str]] = []

    for page_index in range(doc.page_count):
        cache_file = config.OCR_CACHE_DIR / f"egypt_law_page_{page_index:03d}.txt"

        if cache_file.exists() and not force:
            text = cache_file.read_text(encoding="utf-8")
        else:
            pixmap = doc[page_index].get_pixmap(dpi=200)
            image_bytes = pixmap.tobytes("png")
            import base64

            b64_image = base64.b64encode(image_bytes).decode("utf-8")

            message = HumanMessage(
                content=[
                    {"type": "text", "text": OCR_PROMPT},
                    {"type": "image_url", "image_url": f"data:image/png;base64,{b64_image}"},
                ]
            )

            def _ocr_call(model: str, api_key: str):
                vision_model = ChatGoogleGenerativeAI(model=model, api_key=api_key)
                return vision_model.invoke([message])

            response = call_with_gemini_fallback(_ocr_call)
            text = response.content if isinstance(response.content, str) else str(response.content)
            cache_file.write_text(text, encoding="utf-8")
            print(f"  OCR'd page {page_index + 1}/{doc.page_count}", file=sys.stderr)

        pages_text.append((page_index + 1, text))

    doc.close()

    splitter = RecursiveCharacterTextSplitter(
        separators=["\nالمادة", "\n\n", "\n", ". ", " ", ""],
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
    )

    documents: list[Document] = []
    for page_num, text in pages_text:
        if not text.strip():
            continue
        for chunk in splitter.split_text(text):
            documents.append(
                Document(
                    page_content=chunk,
                    metadata={"source": "Law 202/2020 (Egypt Waste Management Law)", "page": page_num},
                )
            )

    return documents


def _extract_recycling_guide_pdf() -> list[Document]:
    if not config.RECYCLING_GUIDE_PDF.exists():
        raise FileNotFoundError(
            f"Missing {config.RECYCLING_GUIDE_PDF}. Put the recycling guide PDF there before ingesting."
        )

    doc = pymupdf.open(str(config.RECYCLING_GUIDE_PDF))
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
    )

    documents: list[Document] = []
    for page_index in range(doc.page_count):
        text = doc[page_index].get_text()
        if not text.strip():
            continue
        for chunk in splitter.split_text(text):
            documents.append(
                Document(
                    page_content=chunk,
                    metadata={"source": "Fundamentals of Municipal Solid Waste Management (UNIDO)", "page": page_index + 1},
                )
            )

    doc.close()
    return documents


def run(force: bool = False) -> None:
    embeddings = _get_embeddings()

    print("Extracting recycling guide (plain text)...", file=sys.stderr)
    guide_docs = _extract_recycling_guide_pdf()
    print(f"  {len(guide_docs)} chunks", file=sys.stderr)

    print("OCR'ing Egypt waste law (Gemini vision, cached per page)...", file=sys.stderr)
    law_docs = _ocr_law_pdf(force)
    print(f"  {len(law_docs)} chunks", file=sys.stderr)

    config.VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)

    Chroma.from_documents(
        guide_docs,
        embedding=embeddings,
        collection_name=config.RECYCLING_GUIDE_COLLECTION,
        persist_directory=str(config.VECTOR_STORE_DIR),
    )
    Chroma.from_documents(
        law_docs,
        embedding=embeddings,
        collection_name=config.EGYPT_LAW_COLLECTION,
        persist_directory=str(config.VECTOR_STORE_DIR),
    )

    print("Vector store built at", config.VECTOR_STORE_DIR, file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the RAG vector store from the source PDFs.")
    parser.add_argument("--force", action="store_true", help="Re-run OCR even if cached pages exist.")
    args = parser.parse_args()
    run(force=args.force)
