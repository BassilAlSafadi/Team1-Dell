# --- build ---
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/gateway ./cmd/server

# --- runtime ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && \
    addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build /out/gateway ./gateway

# Attachment store (POST/GET /api/uploads). Created owned by `app` here so a fresh named
# volume mounted at this path inherits that ownership and the non-root process can write.
RUN mkdir -p /data/uploads && chown -R app:app /data

USER app
EXPOSE 8080
CMD ["./gateway"]
