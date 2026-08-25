# --- deps: install with dev dependencies for a clean, reproducible install layer ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# --- runtime ---
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER app
EXPOSE 8080
CMD ["node", "src/server.js"]
