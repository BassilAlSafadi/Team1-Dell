#!/usr/bin/env bash
# Starts every microservice (backend services + gateway + frontend) locally, in parallel,
# for local dev. Each service's services/*/.env supplies everything EXCEPT its REST port —
# those .env files were written for docker-compose, where every container can bind its own
# 8080 in an isolated network namespace. Run side-by-side on bare-metal localhost instead and
# they'd all fight over the same port, so this script assigns each one a distinct REST port
# below (--no-launch-profile on the .NET services stops launchSettings.json from injecting its
# own ASPNETCORE_URLS ahead of ours). gRPC ports (6001-6005) are already distinct per-service
# .env and are left alone.
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

# "name:relative-dir:run command" — REST port env vars are injected separately below (see
# rest_port_env_for), since URLs contain ':' and would break this simple 3-field split.
SERVICES=(
  "auth-service:services/auth-service:dotnet run --project src/AuthService.Api --no-launch-profile"
  "marketplace-service:services/marketplace-service:dotnet run --project src/MarketplaceService.Api --no-launch-profile"
  "transaction-service:services/transaction-service:dotnet run --project src/TransactionService.Api --no-launch-profile"
  "messaging-service:services/messaging-service:npm start"
  "notification-service:services/notification-service:go run ./cmd/server"
  "ai-service:services/ai-service:python grpc_server.py"
  "gateway:gateway:go run ./cmd/server"
  "frontend:Frontend/Recyclehub:npm run dev"
)

# Local-only REST port assignments — must match gateway/.env's *_REST_ADDR values.
# Deliberately off the 8080/8081 range: on at least this machine those are already held by
# unrelated software (Docker Desktop's backend, some other web server), not by anything here.
rest_port_env_for() {
  case "$1" in
    auth-service) echo "ASPNETCORE_URLS=http://localhost:9081" ;;
    transaction-service) echo "ASPNETCORE_URLS=http://localhost:9082" ;;
    marketplace-service) echo "ASPNETCORE_URLS=http://localhost:9083" ;;
    messaging-service) echo "PORT=9084" ;;
    notification-service) echo "PORT=9085" ;;
    *) echo "" ;;
  esac
}

# transaction-service resolves auth-service user ids to marketplace VENDOR/CORPORATE ids to
# evaluate its ownership checks, so it needs marketplace-service's bare-metal address. In
# docker-compose this comes from the compose file; here it must match the port assigned above.
extra_env_for() {
  case "$1" in
    transaction-service) echo "Internal__MarketplaceRestAddr=http://localhost:9083" ;;
    *) echo "" ;;
  esac
}

# Every service now requires the shared mesh secret, and it must be IDENTICAL across all of
# them. Rather than making eight .env files agree by hand, take it from whichever one is set and
# fail loudly if they disagree — a mismatch shows up as confusing Unauthenticated gRPC errors.
mesh_secret_check() {
  local from_gateway=""
  [ -f "gateway/.env" ] && from_gateway="$(grep -E '^INTERNAL_SERVICE_TOKEN=' gateway/.env | head -1 | cut -d= -f2-)"

  if [ -z "$from_gateway" ] || [[ "$from_gateway" == CHANGE_ME* ]]; then
    echo "WARNING: INTERNAL_SERVICE_TOKEN is unset or still a placeholder in gateway/.env."
    echo "         Backend gRPC calls will be rejected until every service shares the same value."
    echo "         Generate one with: openssl rand -base64 32"
  fi
}

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

mesh_secret_check

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

  extra_env="$(rest_port_env_for "$name") $(extra_env_for "$name")"
  extra_env="$(echo "$extra_env" | xargs)"
  echo "Starting $name ($cmd)${extra_env:+ [$extra_env]}"
  (
    cd "$dir" || exit 1
    [ -n "$extra_env" ] && export $extra_env
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
