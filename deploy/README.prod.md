# Swiss Production Deployment (VPS + Docker + Cloudflare Origin CA)

This deployment uses two compose projects:

- `infra/nginx/docker-compose.proxy.yml` for reverse proxy and exporter
- `deploy/docker-compose.prod.yml` for Swiss apps/APIs/Postgres

Both projects must share an external Docker network: `edge-proxy-network`.

## 1) Prepare your VPS

1. Install Docker Engine + Compose plugin.
2. Clone this repo to the VPS.
3. Create the required networks:

```bash
docker network create edge-proxy-network || true
docker network create monitoring-network || true
```

4. Create your production env file:

```bash
cp deploy/.env.prod.example deploy/.env.prod
```

Edit `deploy/.env.prod` and set real values (domain, strong secrets, CORS origins).

## 2) Cloudflare setup

1. DNS records (`proxied`):
   - `www`, `auth`, `monolith`, `drop`, `stream`, `signal`, `stream-api` -> VPS IP
2. SSL/TLS mode: **Full (strict)**
3. Generate an Origin CA cert/key covering these hostnames.
4. Save cert files on VPS (default expected by scripts):
   - `${SSL_CERTS_DIR}/origin-cert.pem`
   - `${SSL_CERTS_DIR}/origin-key.pem`

If you keep defaults from `deploy/.env.prod.example`, this is:

- `/root/nikutsuki/ssl/origin-cert.pem`
- `/root/nikutsuki/ssl/origin-key.pem`

## 3) Deploy

Run from repo root:

```bash
./scripts/deploy/preflight.sh
./scripts/deploy/verify-nginx.sh
./scripts/deploy/build.sh
./scripts/deploy/up.sh
./scripts/deploy/migrate.sh
./scripts/deploy/healthcheck.sh
```

## 4) Day-2 operations

- Stop all stacks: `./scripts/deploy/down.sh`
- Restart all stacks: `./scripts/deploy/restart.sh`
- Follow proxy logs: `./scripts/deploy/logs.sh`

## 5) Verification checklist

- `https://auth.<root-domain>` loads.
- `https://www.<root-domain>` loads.
- `https://monolith.<root-domain>` loads and SSO redirects work.
- `https://drop.<root-domain>` can connect to `wss://signal.<root-domain>/ws`.
- `https://stream.<root-domain>` can connect to `wss://stream-api.<root-domain>/v1/stream/ws/<lobby-id>`.
- Cookies are secure and share the expected root domain.
- Postgres data survives restarts.

## 6) Notes

- Only Nginx should expose public ports (`80`, `443`).
- Keep `SIGNALING_ALLOWED_ORIGINS`, `MONOLITH_DROP_CORS_ORIGINS`, and `MONOLITH_STREAM_CORS_ORIGINS` strict.
- Back up the Postgres volume (`pgdata`) on a schedule.
