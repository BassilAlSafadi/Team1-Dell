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
COPY db/ db/
COPY grpcgen/ grpcgen/
COPY waste_classifier.py waste_recommendations.py vendor_search.py vendor_cache.py vendors.json ./
COPY identity.py grpc_server.py grpc_clients.py mesh_status.py ./
# root modules grpc_server.py imports transitively (via chatbot/, waste_*, vendor_cache)
COPY gemini_keys.py internal_auth.py redis_client.py ./

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

# gRPC server (mesh-status HTTP on MESH_HTTP_PORT alongside it) — this is now the
# service's long-running process, needed so the other 4 services can reach it. The
# original CLI scripts (chatbot.chat, waste_classifier.py, waste_recommendations.py)
# are unchanged and still runnable manually, e.g.:
#   docker exec -it <container> python -m chatbot.chat
EXPOSE 6005 7005
CMD ["python", "grpc_server.py"]
