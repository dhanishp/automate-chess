#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SERVER_DIR="$PROJECT_ROOT/server"
CLIENT_DIR="$PROJECT_ROOT/client"
VENV_DIR="$SERVER_DIR/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:5173"
BACKEND_PID=""
FRONTEND_PID=""

log() {
  local scope="$1"
  shift
  echo "[$scope] $*"
}

cleanup() {
  trap - EXIT INT TERM

  for pid in "$BACKEND_PID" "$FRONTEND_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

exit_status_for_pid() {
  local pid="$1"
  local status

  set +e
  wait "$pid"
  status=$?
  set -e

  echo "$status"
}

monitor_processes() {
  local backend_status
  local frontend_status

  while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      backend_status="$(exit_status_for_pid "$BACKEND_PID")"
      log "backend" "exited with status $backend_status"
      return 1
    fi

    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
      frontend_status="$(exit_status_for_pid "$FRONTEND_PID")"
      log "frontend" "exited with status $frontend_status"
      return 1
    fi

    sleep 1
  done
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

log "backend" "starting in $SERVER_DIR"
(
  cd "$SERVER_DIR"
  exec "$PYTHON_BIN" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

log "frontend" "starting in $CLIENT_DIR"
(
  cd "$CLIENT_DIR"
  exec npm run dev -- --host 127.0.0.1 --port 5173
) &
FRONTEND_PID=$!

sleep 1

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  log "backend" "failed to stay running after startup"
  exit 1
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  log "frontend" "failed to stay running after startup"
  exit 1
fi

log "backend" "running at $BACKEND_URL"
log "frontend" "running at $FRONTEND_URL"

if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  (
    sleep 2
    open "$FRONTEND_URL" >/dev/null 2>&1 || true
  ) &
fi

monitor_processes
