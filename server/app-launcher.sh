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

# Config opvragen — altijd, zodat je makkelijk kunt wisselen van ATEM
CURRENT_IP=""
CURRENT_NAME=""
if [ -f "$CONFIG_FILE" ]; then
  CURRENT_IP=$(python3 -c "import json,sys; d=json.load(open('$CONFIG_FILE')); print(d.get('ip',''))" 2>/dev/null)
  CURRENT_NAME=$(python3 -c "import json,sys; d=json.load(open('$CONFIG_FILE')); print(d.get('name',''))" 2>/dev/null)
fi

DEFAULT_IP="${CURRENT_IP:-192.168.1.100}"
DEFAULT_NAME="${CURRENT_NAME:-mijn-bridge}"

IP=$(osascript -e "text returned of (display dialog \"ATEM IP-adres:\" default answer \"$DEFAULT_IP\" with title \"Breadcrumb Bridge\" buttons {\"Annuleer\", \"Start\"} default button \"Start\")" 2>/dev/null)
[ -z "$IP" ] && exit 0

NAME=$(osascript -e "text returned of (display dialog \"Bridge naam (bijv. jeffrey-studio):\" default answer \"$DEFAULT_NAME\" with title \"Breadcrumb Bridge\" buttons {\"Annuleer\", \"Start\"} default button \"Start\")" 2>/dev/null)
[ -z "$NAME" ] && exit 0

mkdir -p "$HOME/.config/breadcrumb"
printf '{"ip":"%s","name":"%s"}\n' "$IP" "$NAME" > "$CONFIG_FILE"

mkdir -p "$LOG_DIR"

# Start bridge op de achtergrond
"$RESOURCES/breadcrumb-bridge" >> "$LOG_DIR/bridge.log" 2>&1 &
echo $! > "$PID_FILE"

osascript -e 'display notification "Bridge actief op de achtergrond" with title "Breadcrumb Bridge"'
