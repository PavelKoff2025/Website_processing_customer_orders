#!/bin/sh
set -e
cd "$(dirname "$0")"
if command -v npm >/dev/null 2>&1; then
  npm install
  npm run build
else
  docker run --rm -v "$PWD":/app -w /app node:20-alpine sh -c "npm install && npm run build"
fi
