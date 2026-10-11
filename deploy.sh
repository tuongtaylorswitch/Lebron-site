#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
APP_PORT="${APP_PORT:-3001}"
HEALTH_PATH="${HEALTH_PATH:-/qwerty}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/lebronjames.io.vn}"
PUBLIC_URL="${PUBLIC_URL:-https://lebronjames.io.vn${HEALTH_PATH}}"

log() {
    printf '\n==> %s\n' "$*"
}

fail() {
    printf '\nERROR: %s\n' "$*" >&2
    exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or is not on PATH."
command -v curl >/dev/null 2>&1 || fail "curl is not installed or is not on PATH."
[ -f "$COMPOSE_FILE" ] || fail "Missing ${COMPOSE_FILE}."

if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose is not available."
fi

cd "$PROJECT_DIR"

log "Building and starting the application and MySQL"
docker compose up -d --build app mysql

log "Waiting for the application health endpoint"
ready=0
for _ in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 3 \
        "http://127.0.0.1:${APP_PORT}${HEALTH_PATH}" >/dev/null; then
        ready=1
        break
    fi
    sleep 2
done

if [ "$ready" -ne 1 ]; then
    docker compose ps
    docker compose logs --tail=100 app mysql
    fail "The application did not become healthy at http://127.0.0.1:${APP_PORT}${HEALTH_PATH}."
fi

if [ -f "$NGINX_SITE" ]; then
    if grep -Eq "^[[:space:]]*proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:${APP_PORT};" "$NGINX_SITE"; then
        log "Nginx already points to port ${APP_PORT}; skipping sudo Nginx update"
    else
        log "Pointing Nginx at the application on port ${APP_PORT}"
        sudo -v
        sudo cp "$NGINX_SITE" "${NGINX_SITE}.deploy.bak"

        if ! sudo grep -Eq '^[[:space:]]*proxy_pass[[:space:]]+http://127\.0\.0\.1:[0-9]+;' "$NGINX_SITE"; then
            sudo cp "${NGINX_SITE}.deploy.bak" "$NGINX_SITE"
            fail "Could not find a localhost proxy_pass in ${NGINX_SITE}."
        fi

        sudo sed -i -E \
            "s#proxy_pass http://127\\.0\\.0\\.1:[0-9]+;#proxy_pass http://127.0.0.1:${APP_PORT};#" \
            "$NGINX_SITE"

        if ! sudo nginx -t; then
            sudo cp "${NGINX_SITE}.deploy.bak" "$NGINX_SITE"
            fail "Nginx validation failed; the previous configuration was restored."
        fi

        sudo systemctl reload nginx
    fi
else
    printf '\nWARNING: Nginx site file not found at %s; skipped Nginx update.\n' "$NGINX_SITE"
fi

log "Deployment completed"
printf 'Local check:  http://127.0.0.1:%s%s\n' "$APP_PORT" "$HEALTH_PATH"
printf 'Public check: %s\n' "$PUBLIC_URL"

if ! curl --fail --silent --show-error --max-time 10 "$PUBLIC_URL" >/dev/null; then
    printf 'WARNING: The public URL did not respond yet. Check DNS/Cloudflare/Nginx.\n'
fi
