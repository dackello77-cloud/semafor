#!/bin/zsh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

PORT=8000
while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:${PORT}/index.html"

echo "Starting Semafor app..."
echo "Folder: $APP_DIR"
echo "URL: $URL"
echo
echo "Close this Terminal window to stop the local server."
echo

open "$URL"
python3 -m http.server "$PORT"
