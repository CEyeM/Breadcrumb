#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="Breadcrumb Bridge"
DIST_DIR="$SCRIPT_DIR/dist"
APP_DIR="$DIST_DIR/$APP_NAME.app"

echo "==================================="
echo "  Breadcrumb Bridge — App Builder"
echo "==================================="
echo ""

# Dependencies
if [ ! -d "node_modules" ]; then
  echo "📦 Dependencies installeren..."
  npm install
fi

mkdir -p "$DIST_DIR"

# Detecteer architectuur
ARCH=$(uname -m)
[ "$ARCH" = "arm64" ] && PKG_TARGET="node18-macos-arm64" || PKG_TARGET="node18-macos-x64"

echo "🔨 Bridge compileren ($ARCH)..."
npx pkg bridge-standalone.js --target "$PKG_TARGET" --output "$DIST_DIR/breadcrumb-bridge"
echo "✔  Binary klaar"

echo "📁 App bundle aanmaken..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Binary en launcher in bundle
cp "$DIST_DIR/breadcrumb-bridge"   "$APP_DIR/Contents/Resources/breadcrumb-bridge"
chmod +x                            "$APP_DIR/Contents/Resources/breadcrumb-bridge"
cp "$SCRIPT_DIR/app-launcher.sh"   "$APP_DIR/Contents/MacOS/$APP_NAME"
chmod +x                            "$APP_DIR/Contents/MacOS/$APP_NAME"

# Info.plist
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>          <string>Breadcrumb Bridge</string>
  <key>CFBundleIdentifier</key>    <string>com.breadcrumb.bridge</string>
  <key>CFBundleVersion</key>       <string>1.0.0</string>
  <key>CFBundleExecutable</key>    <string>Breadcrumb Bridge</string>
  <key>LSUIElement</key>           <true/>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>   <string>Breadcrumb Bridge</string>
      <key>CFBundleURLSchemes</key><array><string>breadcrumb</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST

# Zip voor distributie
cd "$DIST_DIR"
zip -r "Breadcrumb-Bridge-${ARCH}.zip" "$APP_NAME.app"

echo ""
echo "==================================="
echo "  ✅ Klaar!"
echo "==================================="
echo ""
echo "  App: $APP_DIR"
echo "  Zip: $DIST_DIR/Breadcrumb-Bridge-${ARCH}.zip"
echo ""
echo "  Upload de zip naar GitHub Releases."
echo "  Gebruikers: download → unzip → dubbelklik."
echo "  (Eerste keer: rechtermuisknop → Openen)"
echo ""
