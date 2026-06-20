#!/bin/bash
# CD3 launcher for macOS. Double-click in Finder (right-click -> Open the first
# time to get past Gatekeeper). Installs dependencies, builds, then starts the
# HTTPS server the Quest 3 connects to over Wi-Fi.
cd "$(dirname "$0")" || exit 1

echo "==> Installing dependencies (first run can take a few minutes)..."
npm install || { echo "npm install failed - is Node.js installed? (https://nodejs.org)"; read -n1 -r -p "Press any key to close..."; exit 1; }

echo "==> Building..."
npm run build || { echo "build failed"; read -n1 -r -p "Press any key to close..."; exit 1; }

echo "==> Starting server."
echo "==> Open the https://<Network> URL printed below in the Quest 3 browser."
echo "==> (Close this window to stop the server.)"
npm run preview
