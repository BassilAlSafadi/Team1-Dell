#!/usr/bin/env bash
# Build + start the full mesh and the Cloudflare quick tunnel, then print the public URL.
# Run from the repo root on the VM.  Re-run any time to pick up code/.env changes.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

# On a <1.8 GB box (AWS t3.micro), layer the low-memory override: ai-service becomes a
# placeholder so the 3 .NET services fit. Force it with LOWMEM=1, disable with LOWMEM=0.
mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 9999999)
if [ "${LOWMEM:-auto}" = 1 ] || { [ "${LOWMEM:-auto}" = auto ] && [ "$mem_kb" -lt 1887436 ]; }; then
  echo ">> low-memory box detected -> disabling ai-service (docker-compose.t3micro.yml)"
  COMPOSE+=(-f docker-compose.t3micro.yml)
  if ! swapon --show 2>/dev/null | grep -q .; then
    echo "!! no swap active. On 1 GB you need it or builds will OOM:"
    echo "   sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
    echo "   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
  fi
fi

req_services="auth-service marketplace-service messaging-service notification-service transaction-service"
printf '%s\n' "${COMPOSE[@]}" | grep -q t3micro || req_services="ai-service $req_services"
missing=0
for s in $req_services; do
  [ -f "services/$s/.env" ] || { echo "MISSING services/$s/.env"; missing=1; }
done
[ -f gateway/.env ] || { echo "MISSING gateway/.env"; missing=1; }
[ "$missing" = 0 ] || { echo "Put the .env files in place first (see deploy/README.md)."; exit 1; }

echo ">> building + starting (first run downloads/builds ~10 min)"
"${COMPOSE[@]}" up -d --build

echo ">> waiting for the tunnel to register a URL..."
url=""
for _ in $(seq 1 30); do
  url=$("${COMPOSE[@]}" logs cloudflared 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] && break
  sleep 3
done

echo
"${COMPOSE[@]}" ps
echo
if [ -n "$url" ]; then
  echo "=================================================================="
  echo " PUBLIC GATEWAY URL:  $url"
  echo "=================================================================="
  echo " Set this as the API base URL in the Vercel frontend, then redeploy it."
  echo " Also add it to CORS_ORIGINS in gateway/.env and re-run this script."
else
  echo "No tunnel URL yet. Check: ${COMPOSE[*]} logs cloudflared"
fi
