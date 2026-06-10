#!/bin/bash
# Breadcrumb ATEM Bridge — auto-start script
# Voeg dit toe als Login Item via Systeeminstellingen → Algemeen → Aanmeldingsobjecten

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Installeer dependencies als ze ontbreken
if [ ! -d "node_modules" ]; then
  npm install
fi

# Lees ATEM IP en bridge naam uit config
CONFIG_FILE="$SCRIPT_DIR/.atem-ip"
if [ -f "$CONFIG_FILE" ]; then
  ATEM_IP=$(awk '{print $1}' "$CONFIG_FILE")
  BRIDGE_NAME=$(awk '{print $2}' "$CONFIG_FILE")
else
  echo "Geen ATEM config gevonden. Verbind eerst via de app (ATEM LIVE → Verbinden)."
  exit 1
fi

echo "Starting Breadcrumb ATEM Bridge → $ATEM_IP (kanaal: atem-tc-${BRIDGE_NAME})"
node atem-bridge.js "$ATEM_IP" "$BRIDGE_NAME"
