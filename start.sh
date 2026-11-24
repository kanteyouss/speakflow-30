#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${1:-8090}"
echo "🚀 SpeakFlow 30 démarré sur : http://localhost:${PORT}"
exec python3 -m http.server "$PORT"
