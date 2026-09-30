#!/bin/bash
# Double-click to open Journal Color Studio. It serves this folder on your own computer only
# (browsers block the color editing when index.html is opened straight from the file).
cd "$(dirname "$0")"
PORT=8765
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  /usr/bin/python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  sleep 1
fi
open "http://localhost:$PORT/index.html"
echo "Journal Color Studio is open in your browser (http://localhost:$PORT)."
echo "Leave this window open while you work. Close it to stop the studio."
[ -n "$SERVER" ] && wait $SERVER
