# NOTE: build context must be the repo root (not this directory), because the gRPC client
# code loads shared contracts from /proto at runtime, e.g.:
#   docker build -f services/messaging-service/Dockerfile .
# docker-compose.yml sets `context: .` + `dockerfile: services/messaging-service/Dockerfile`
# for exactly this reason.

# --- deps: install with dev dependencies for a clean, reproducible install layer ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY services/messaging-service/package.json services/messaging-service/package-lock.json* ./
RUN npm install --omit=dev

# --- runtime ---
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY services/messaging-service/package.json ./
COPY services/messaging-service/src ./src
COPY proto /proto

USER app
EXPOSE 8080
EXPOSE 6003
CMD ["node", "src/server.js"]
