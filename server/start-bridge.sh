#!/bin/bash
# Breadcrumb ATEM Bridge — auto-start script
# Voeg dit toe als Login Item via Systeeminstellingen → Algemeen → Aanmeldingsobjecten

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Installeer dependencies als ze ontbreken
if [ ! -d "node_modules" ]; then
  npm install
fi

# Lees ATEM IP uit config of gebruik standaard
CONFIG_FILE="$SCRIPT_DIR/.atem-ip"
if [ -f "$CONFIG_FILE" ]; then
  ATEM_IP=$(cat "$CONFIG_FILE")
else
  echo "Geen ATEM IP gevonden. Sla het IP eerst op via de app (ATEM LIVE → Verbinden)."
  exit 1
fi

echo "Starting Breadcrumb ATEM Bridge → $ATEM_IP"
node atem-bridge.js "$ATEM_IP"
