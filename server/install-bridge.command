#!/bin/bash
# Breadcrumb ATEM Bridge — installer
# Dubbelklik dit bestand om de bridge als achtergrondservice in te stellen.
# Na installatie start de bridge automatisch bij elke login — geen terminal nodig.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  Breadcrumb ATEM Bridge Installer"
echo "======================================"
echo ""

# ── 1. Zoek node ──────────────────────────────────────────────────────────────
NODE_PATH=$(which node 2>/dev/null)

if [ -z "$NODE_PATH" ]; then
  for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME/.nvm/versions/node"/*/bin/node \
    "$HOME/.nodenv/shims/node"; do
    if [ -f "$candidate" ]; then
      NODE_PATH="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_PATH" ]; then
  echo "❌  Node.js niet gevonden."
  echo "    Installeer Node.js via https://nodejs.org en probeer opnieuw."
  echo ""
  read -rp "Druk op Enter om te sluiten..."
  exit 1
fi

echo "✔  Node.js gevonden: $NODE_PATH"

# ── 2. Check ATEM config ──────────────────────────────────────────────────────
CONFIG_FILE="$SCRIPT_DIR/.atem-ip"
if [ ! -f "$CONFIG_FILE" ]; then
  echo ""
  echo "⚠️   Geen ATEM-configuratie gevonden."
  echo "    Open de Breadcrumb app, ga naar ATEM LIVE → Verbinden,"
  echo "    vul IP-adres en bridge-naam in en klik Verbinden."
  echo "    Voer dit script daarna opnieuw uit."
  echo ""
  read -rp "Druk op Enter om te sluiten..."
  exit 1
fi

ATEM_IP=$(awk '{print $1}' "$CONFIG_FILE")
BRIDGE_NAME=$(awk '{print $2}' "$CONFIG_FILE")
echo "✔  ATEM config geladen: IP=$ATEM_IP  naam=${BRIDGE_NAME:-default}"

# ── 3. npm dependencies ───────────────────────────────────────────────────────
cd "$SCRIPT_DIR" || exit 1
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦  Dependencies installeren..."
  npm install --silent
fi
echo "✔  Dependencies aanwezig"

# ── 4. Maak log-map ───────────────────────────────────────────────────────────
LOG_DIR="$HOME/Library/Logs/Breadcrumb"
mkdir -p "$LOG_DIR"

# ── 5. Schrijf LaunchAgent plist ──────────────────────────────────────────────
PLIST_PATH="$HOME/Library/LaunchAgents/com.breadcrumb.atem-bridge.plist"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.breadcrumb.atem-bridge</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${SCRIPT_DIR}/atem-bridge.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${SCRIPT_DIR}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/bridge.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/bridge-error.log</string>
</dict>
</plist>
PLIST

echo "✔  LaunchAgent aangemaakt"

# ── 6. Activeer service ───────────────────────────────────────────────────────
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo ""
echo "======================================"
echo "  ✅  Installatie geslaagd!"
echo "======================================"
echo ""
echo "  De bridge draait nu op de achtergrond"
echo "  en start automatisch mee bij elke login."
echo ""
echo "  Logs bekijken:"
echo "  $LOG_DIR/bridge.log"
echo ""
echo "  Verwijderen:"
echo "  Voer uninstall-bridge.command uit"
echo ""
read -rp "Druk op Enter om te sluiten..."
