---
name: rag-ingest
description: Build or rebuild the ai-service RAG vector store so the chatbot can run. Use when chatbot/chat.py fails because data/vector_store/ is empty, when source PDFs have changed, or when the user asks to (re)ingest documents for the chatbot.
---

The chatbot in `services/ai-service/chatbot/` requires a populated Chroma vector store at
`services/ai-service/data/vector_store/` before `python -m chatbot.chat` will run. That directory
is gitignored and not shipped, so it must be built locally.

Steps:

1. Confirm source PDFs are present in `services/ai-service/data/source_pdfs/` (also gitignored —
   see `services/ai-service/data/source_pdfs/README.md` for which two PDFs are expected). If
   they're missing, ask the user for them rather than guessing — ingestion can't proceed without
   them.
2. From `services/ai-service/`, ensure dependencies are installed: `pip install -r requirements.txt`.
3. Run ingestion: `python -m chatbot.ingest`. Use `python -m chatbot.ingest --force` to rebuild
   from scratch (e.g. after changing chunk size/overlap or embedding model in `.env`).
4. One of the source PDFs is Arabic-language and needs per-page Gemini-vision OCR because
   standard text extraction produces mojibake on its font. This OCR pass is cached to
   `services/ai-service/data/ocr_cache/`, so the first run can be slow and consumes Gemini API
   quota; subsequent runs reuse the cache unless `--force` is passed.
5. Verify `services/ai-service/data/vector_store/` is now populated, then confirm
   `python -m chatbot.chat` starts without the "empty vector store" error.

Required env vars (see `services/ai-service/.env.example`): `GEMINI_API_KEY`,
`EMBEDDING_MODEL_NAME`, `CHUNK_SIZE`, `CHUNK_OVERLAP`.
