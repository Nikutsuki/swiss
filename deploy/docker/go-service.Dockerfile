FROM golang:1.26-bookworm AS builder

ARG SERVICE_DIR
WORKDIR /src

COPY go.work go.work.sum* ./
COPY services ./services

WORKDIR /src/${SERVICE_DIR}
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/service .

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=builder /out/service /app/service

EXPOSE 8080
ENTRYPOINT ["/app/service"]
