#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(which node || echo "/usr/bin/node")"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SYSTEMD_USER_DIR/system-monitor.service"

echo "=== Installing BUSY Bar System Monitor service on SteamOS / Linux ==="
echo "Project Directory: $PROJECT_DIR"
echo "Node binary:       $NODE_BIN"

mkdir -p "$SYSTEMD_USER_DIR"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=BUSY Bar System Monitor Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN index.js --server
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

echo "Created service unit at $SERVICE_FILE"

# Reload and enable
systemctl --user daemon-reload
systemctl --user enable --now system-monitor.service

# Enable lingering so user services run immediately upon boot in Game Mode
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" 2>/dev/null || true
fi

echo ""
echo "=== Service successfully installed and started! ==="
systemctl --user status system-monitor.service --no-pager || true
