# syntax=docker/dockerfile:1
FROM python:3.11-slim

# build-essential covers the rare wheel-less transitive dependency (e.g. chroma's
# hnswlib) that needs to compile from source on this platform/Python combo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY chatbot/ chatbot/
COPY waste_classifier.py vendor_search.py vendors.json ./

RUN useradd --create-home appuser \
    && mkdir -p data \
    && chown -R appuser:appuser /app
USER appuser

# data/ (source PDFs, OCR cache, Chroma vector store) is regenerable and
# environment-specific — mount it rather than baking it into the image, e.g.:
#   docker run --env-file .env -v ./data:/app/data ai-service
VOLUME ["/app/data"]

# Run ingestion once (or after adding new source PDFs) with:
#   docker run --env-file .env -v ./data:/app/data ai-service python -m chatbot.ingest
CMD ["python", "-m", "chatbot.chat"]
