#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/nynum/rerun_tiktok"
APP="$ROOT/app/runtime/resources/app"
ENV_FILE="$ROOT/deploy/rerun_tiktok.env"
LOG_FILE="$ROOT/logs/server.log"

if [ -d "$ROOT/node22/bin" ]; then
  export PATH="$ROOT/node22/bin:$PATH"
elif [ -d "$ROOT/node/bin" ]; then
  export PATH="$ROOT/node/bin:$PATH"
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

NP_WEB_DATA="${NP_WEB_DATA:-$ROOT/app/data}"
export NP_WEB_DATA
mkdir -p "$NP_WEB_DATA" "$ROOT/logs"
cd "$APP"

if [ "${1:-}" = "stop" ]; then
  for pid in $(pgrep -f "node server\\.cjs" 2>/dev/null || true); do
    if [ "$(readlink "/proc/$pid/cwd" 2>/dev/null || true)" = "$APP" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  exit 0
fi

if [ -x "/home/nynum/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome_sandbox" ]; then
  export CHROME_DEVEL_SANDBOX="/home/nynum/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome_sandbox"
fi

if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a node server.cjs >> "$LOG_FILE" 2>&1
fi

exec node server.cjs >> "$LOG_FILE" 2>&1
