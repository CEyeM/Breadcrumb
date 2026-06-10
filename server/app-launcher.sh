#!/bin/bash
# Breadcrumb Bridge launcher — draait binnen de .app bundle

RESOURCES="$(cd "$(dirname "$0")/../Resources" && pwd)"
CONFIG_FILE="$HOME/.config/breadcrumb/bridge.json"
PID_FILE="/tmp/breadcrumb-bridge.pid"
LOG_DIR="$HOME/Library/Logs/Breadcrumb"

# Al actief?
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  osascript -e 'display notification "Bridge is al actief" with title "Breadcrumb Bridge"'
  exit 0
fi

# Eerste keer: IP en naam opvragen via native dialoogvensters
if [ ! -f "$CONFIG_FILE" ]; then
  IP=$(osascript -e 'text returned of (display dialog "ATEM IP-adres:" default answer "192.168.1.100" with title "Breadcrumb Bridge" buttons {"Annuleer", "OK"} default button "OK")' 2>/dev/null)
  [ -z "$IP" ] && exit 0

  NAME=$(osascript -e 'text returned of (display dialog "Bridge naam (bijv. jeffrey-studio):" default answer "mijn-bridge" with title "Breadcrumb Bridge" buttons {"Annuleer", "OK"} default button "OK")' 2>/dev/null)
  [ -z "$NAME" ] && exit 0

  mkdir -p "$HOME/.config/breadcrumb"
  printf '{"ip":"%s","name":"%s"}\n' "$IP" "$NAME" > "$CONFIG_FILE"
fi

mkdir -p "$LOG_DIR"

# Start bridge op de achtergrond
"$RESOURCES/breadcrumb-bridge" >> "$LOG_DIR/bridge.log" 2>&1 &
echo $! > "$PID_FILE"

osascript -e 'display notification "Bridge actief op de achtergrond" with title "Breadcrumb Bridge"'
