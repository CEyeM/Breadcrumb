#!/bin/bash
# Breadcrumb ATEM Bridge — verwijderen

PLIST_PATH="$HOME/Library/LaunchAgents/com.breadcrumb.atem-bridge.plist"

echo "======================================"
echo "  Breadcrumb ATEM Bridge verwijderen"
echo "======================================"
echo ""

if [ ! -f "$PLIST_PATH" ]; then
  echo "ℹ️   Bridge is niet geïnstalleerd."
else
  launchctl unload "$PLIST_PATH" 2>/dev/null
  rm "$PLIST_PATH"
  echo "✅  Bridge verwijderd en gestopt."
fi

echo ""
read -rp "Druk op Enter om te sluiten..."
