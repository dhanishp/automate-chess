#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_DIR="$PROJECT_ROOT/server"
CLIENT_DIR="$PROJECT_ROOT/client"
VENV_DIR="$SERVER_DIR/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"
DEV_HOST="${DEV_HOST:-0.0.0.0}"
PUBLIC_HOST="${PUBLIC_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
APP_URL="http://${PUBLIC_HOST}:${BACKEND_PORT}"
BACKEND_PID=""

log() {
  local scope="$1"
  shift
  echo "[$scope] $*"
}

cleanup() {
  trap - EXIT INT TERM

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

trap cleanup EXIT INT TERM

require_command python3
require_command npm

if [[ ! -d "$VENV_DIR" ]]; then
  log "setup" "creating virtual environment at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

if [[ -f "$SERVER_DIR/requirements.txt" ]]; then
  log "setup" "installing backend dependencies from server/requirements.txt"
  "$PYTHON_BIN" -m pip install -r "$SERVER_DIR/requirements.txt"
else
  log "setup" "installing minimal backend dependencies"
  "$PYTHON_BIN" -m pip install fastapi "uvicorn[standard]" pydantic pytest
fi

if [[ ! -d "$CLIENT_DIR/node_modules" ]]; then
  log "setup" "installing frontend dependencies in client/"
  (
    cd "$CLIENT_DIR"
    npm install
  )
fi

log "frontend" "building production client in $CLIENT_DIR"
(
  cd "$CLIENT_DIR"
  npm run build
)

log "backend" "starting LAN/local runtime in $SERVER_DIR"
(
  cd "$SERVER_DIR"
  export SERVE_CLIENT_DIST=1
  exec "$PYTHON_BIN" -m uvicorn app.main:app --host "$DEV_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

sleep 1

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  log "backend" "failed to stay running after startup"
  exit 1
fi

log "app" "running at $APP_URL"

if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  (
    sleep 2
    open "$APP_URL" >/dev/null 2>&1 || true
  ) &
fi

wait "$BACKEND_PID"
