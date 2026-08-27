#!/usr/bin/env bash
# Build + start the full mesh and the Cloudflare quick tunnel, then print the public URL.
# Run from the repo root on the VM.  Re-run any time to pick up code/.env changes.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

# Serial builds — on a 1 GB box (AWS t3.micro) parallel .NET restores exhaust RAM and start
# dropping NuGet connections. Harmless on a bigger box.
export COMPOSE_PARALLEL_LIMIT=1

mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 9999999)
if [ "$mem_kb" -lt 1887436 ] && ! swapon --show 2>/dev/null | grep -q .; then
  echo "!! 1 GB box with no swap — builds will OOM. Add swap first:"
  echo "   sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
  echo "   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab"
  exit 1
fi

missing=0
for s in ai-service auth-service marketplace-service messaging-service notification-service transaction-service; do
  [ -f "services/$s/.env" ] || { echo "MISSING services/$s/.env"; missing=1; }
done
[ -f gateway/.env ] || { echo "MISSING gateway/.env"; missing=1; }
[ "$missing" = 0 ] || { echo "Put the .env files in place first (see deploy/README.md)."; exit 1; }

# convenience wrapper for day-2 ops: `~/dc ps`, `~/dc logs -f gateway`, ...
printf '#!/usr/bin/env bash\ncd %q\nexec %s "$@"\n' "$PWD" "${COMPOSE[*]}" > ~/dc && chmod +x ~/dc

echo ">> building + starting (first run builds ~15-25 min on a 1 GB box)"
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
  echo " Set this as VITE_API_BASE_URL in the Vercel frontend, then redeploy it."
  echo " Also add it to CORS_ORIGINS in gateway/.env and re-run this script."
else
  echo "No tunnel URL yet. Check: ${COMPOSE[*]} logs cloudflared"
fi
