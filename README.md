# Swiss

Swiss is a pnpm/Turborepo monorepo for a small suite of Next.js applications and Go services:

- `auth-portal` — authentication, SSO, passkeys, and account access.
- `monolith` — encrypted paste/vault experience.
- `monolith-drop` — peer-to-peer file drop workflows.
- `monolith-stream` — watch/stream-together experience.
- `personal-website` — public personal site.

## Stack

- pnpm workspaces + Turborepo
- Next.js 16, React 19, TypeScript, Tailwind CSS
- Go services managed with `go.work`
- PostgreSQL via Docker Compose

## Repository layout

```text
apps/       Next.js apps
packages/   shared TypeScript packages and UI components
services/   Go APIs and shared internal Go modules
schema/     database schema, queries, and migrations
deploy/     production Docker/Cloudflare deployment assets
scripts/    release/deploy helper scripts
```

## Prerequisites

- Node.js 22+
- pnpm 10.32.1+
- Go 1.26+
- Docker and Docker Compose
- Optional: [Task](https://taskfile.dev/) for the commands in `Taskfile.yml`

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

Review `.env` before starting services. Local HTTPS development uses the certificates in `certs/`.

## Development

Run the full local stack with Task:

```bash
task dev
```

Or run selected pieces:

```bash
pnpm dev                    # all workspace dev tasks through Turbo
task db:up                  # PostgreSQL only
task api:dev                # auth API on :8080
task monolith-api:dev       # monolith API on :8081
task monolith-drop-api:dev  # drop API on :8082
task signaling-api:dev      # signaling API on :8083
task monolith-stream-api:dev # stream API on :8084
```

Default web ports:

- Auth portal: <https://localhost:3000>
- Monolith: <https://localhost:3001>
- Monolith Drop: <https://localhost:3002>
- Monolith Stream: <https://localhost:3003>
- Personal website: <https://localhost:3004>

## Quality checks

```bash
pnpm lint
pnpm test
pnpm test:go
pnpm build
```

Run all release checks with:

```bash
pnpm check
```

## Production deployment

Production deployment instructions live in [`deploy/README.prod.md`](deploy/README.prod.md). The short flow is:

```bash
./scripts/deploy/preflight.sh
./scripts/deploy/verify-nginx.sh
./scripts/deploy/build.sh
./scripts/deploy/up.sh
./scripts/deploy/migrate.sh
./scripts/deploy/healthcheck.sh
```

## Notes

- Generated TypeScript files from `tygo` are intentionally excluded from app linting.
- The root package is private to avoid accidental npm publication.
