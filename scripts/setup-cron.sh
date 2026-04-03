#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL="${1:-15}"

if ! command -v node &>/dev/null; then
  echo "Error: node is not installed."
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "Error: .env file not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

CRON_CMD="cd $SCRIPT_DIR && $(command -v node) src/push.js >> /tmp/trmnl-agenda.log 2>&1"
CRON_LINE="*/$INTERVAL * * * * $CRON_CMD"

# Remove any existing trmnl-agenda cron entry, then add the new one
(crontab -l 2>/dev/null | grep -v "trmnl-agenda" || true; echo "$CRON_LINE # trmnl-agenda") | crontab -

echo "Cron job installed: every $INTERVAL minutes"
echo "Logs: /tmp/trmnl-agenda.log"
echo ""
echo "To verify: crontab -l"
echo "To remove: crontab -l | grep -v trmnl-agenda | crontab -"
