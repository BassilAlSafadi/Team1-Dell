#!/usr/bin/env bash
# Runs seed_data.py in a throwaway python container on the deploy VM, so the seeding
# dependencies never have to be installed on the host or baked into a service image.
# The repo (including the gitignored .env files the script reads) is mounted read-only.
#
#   bash deploy/seed/run-seed.sh            # seed
#   bash deploy/seed/run-seed.sh --purge    # remove seeded rows
set -euo pipefail
cd "$(dirname "$0")/../.."

docker run --rm -i \
  -v "$PWD:/repo:ro" \
  -w /repo \
  python:3.11-slim \
  bash -c "pip install --quiet --no-cache-dir 'psycopg[binary]' argon2-cffi pymongo \
    && python deploy/seed/seed_data.py $*"
