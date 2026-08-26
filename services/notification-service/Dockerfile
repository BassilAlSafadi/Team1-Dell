# --- build ---
# go.mod's `go` directive was bumped to 1.25.0 by adding google.golang.org/grpc — match it here.
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/notification-service ./cmd/server

# --- runtime ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && \
    addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build /out/notification-service ./notification-service

USER app
EXPOSE 8080 6004
CMD ["./notification-service"]
