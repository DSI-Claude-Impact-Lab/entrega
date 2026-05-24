#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/claude-impact-lab/apps/python-backend"
RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
RELEASE="${RELEASE:-$RELEASES/$(date -u +%Y%m%d%H%M%S)}"

mkdir -p "$RELEASES"

if [[ ! -d "$RELEASE" ]]; then
  echo "Release directory does not exist: $RELEASE" >&2
  exit 1
fi

cd "$RELEASE"
/root/.local/bin/uv sync --frozen || /root/.local/bin/uv sync
/root/.local/bin/uv run pytest

ln -sfn "$RELEASE" "$CURRENT"
cp "$CURRENT/deploy/claude-impact-api.service" /etc/systemd/system/claude-impact-api.service
systemctl daemon-reload
systemctl enable claude-impact-api
systemctl restart claude-impact-api

if ! grep -q "reverse_proxy 127.0.0.1:8000" /etc/caddy/Caddyfile; then
  python3 "$CURRENT/scripts/patch_caddy.py" /etc/caddy/Caddyfile
  caddy fmt --overwrite /etc/caddy/Caddyfile
  systemctl reload caddy
fi

systemctl --no-pager --full status claude-impact-api | sed -n '1,18p'
