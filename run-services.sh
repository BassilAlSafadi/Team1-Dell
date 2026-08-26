#!/usr/bin/env bash
# Starts every microservice (backend services + gateway + frontend) locally, in parallel,
# for local dev. Each service uses its own existing services/*/.env as-is — this script does
# NOT override ports/hosts, so those .env files must already point at localhost (the checked-in
# .env.example files do). This is a dev convenience only, not a substitute for docker-compose.yml.
#
# Usage:
#   ./run-services.sh                          # start every service
#   ./run-services.sh gateway auth-service      # start only the named services
#
# Logs are written to ./logs/<service>.log (tail -f logs/*.log to follow them all).
# Press Ctrl+C to stop every service this script started.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

# "name:relative-dir:run command"
SERVICES=(
  "auth-service:services/auth-service:dotnet run --project src/AuthService.Api"
  "marketplace-service:services/marketplace-service:dotnet run --project src/MarketplaceService.Api"
  "transaction-service:services/transaction-service:dotnet run --project src/TransactionService.Api"
  "messaging-service:services/messaging-service:npm start"
  "notification-service:services/notification-service:go run ./cmd/server"
  "ai-service:services/ai-service:python grpc_server.py"
  "gateway:gateway:go run ./cmd/server"
  "frontend:Frontend/Recyclehub:npm run dev"
)

# Optional args filter which services to start (by name), e.g. `./run-services.sh gateway frontend`.
FILTER=("$@")

matches_filter() {
  local name="$1"
  [ ${#FILTER[@]} -eq 0 ] && return 0
  local f
  for f in "${FILTER[@]}"; do
    [ "$f" == "$name" ] && return 0
  done
  return 1
}

PIDS=()
CLEANED_UP=0

cleanup() {
  [ "$CLEANED_UP" -eq 1 ] && return
  CLEANED_UP=1
  echo
  echo "Stopping services..."
  local pid
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo "All stopped."
}
trap cleanup EXIT INT TERM

STARTED_ANY=0
for entry in "${SERVICES[@]}"; do
  IFS=":" read -r name dir cmd <<< "$entry"

  matches_filter "$name" || continue
  STARTED_ANY=1

  if [ "$name" != "frontend" ] && [ ! -f "$dir/.env" ]; then
    echo "WARNING: $dir/.env not found — $name will likely fail to start (copy $dir/.env.example first)."
  fi

  echo "Starting $name ($cmd)"
  (
    cd "$dir" || exit 1
    exec $cmd
  ) > "$LOG_DIR/$name.log" 2>&1 &

  PIDS+=("$!")
done

if [ "$STARTED_ANY" -eq 0 ]; then
  echo "No service names matched: ${FILTER[*]}"
  echo "Known services: auth-service marketplace-service transaction-service messaging-service notification-service ai-service gateway frontend"
  exit 1
fi

echo
echo "All requested services are launching. Logs: $LOG_DIR/<service>.log"
echo "Follow every log with: tail -f $LOG_DIR/*.log"
echo "Press Ctrl+C to stop everything."
echo

wait
