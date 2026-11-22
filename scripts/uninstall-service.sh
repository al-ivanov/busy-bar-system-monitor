#!/bin/bash
set -e

SERVICE_FILE="$HOME/.config/systemd/user/system-monitor.service"

echo "=== Stopping and removing BUSY Bar System Monitor service ==="

if systemctl --user is-active --quiet system-monitor.service 2>/dev/null; then
  systemctl --user stop system-monitor.service
fi

if systemctl --user is-enabled --quiet system-monitor.service 2>/dev/null; then
  systemctl --user disable system-monitor.service
fi

rm -f "$SERVICE_FILE"
systemctl --user daemon-reload

echo "Service removed successfully."
