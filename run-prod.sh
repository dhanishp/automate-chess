#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
PYTHON_BIN="${PYTHON_BIN:-$SERVER_DIR/.venv/bin/python}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

export SERVE_CLIENT_DIST="${SERVE_CLIENT_DIST:-1}"

if [[ -z "${STOCKFISH_PATH:-}" && -x /usr/games/stockfish ]]; then
  export STOCKFISH_PATH="/usr/games/stockfish"
fi

cd "$SERVER_DIR"
exec "$PYTHON_BIN" -m uvicorn app.main:app --host "$HOST" --port "$PORT"
