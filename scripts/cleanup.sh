#!/bin/bash
# cleanup.sh — Remove generated slide outputs older than 24 hours
# Run via cron: 0 */6 * * * /bin/bash /opt/slidr/scripts/cleanup.sh

OUTPUT_DIR="${OUTPUT_DIR:-/var/www/slidr/outputs}"

if [ ! -d "$OUTPUT_DIR" ]; then
  exit 0
fi

# Find and remove job directories older than 24 hours (1440 minutes)
deleted=$(find "$OUTPUT_DIR" -maxdepth 1 -type d -name "job_*" -mmin +1440 -print -exec rm -rf {} + 2>/dev/null | wc -l)

if [ "$deleted" -gt 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Cleaned up $deleted old job(s)"
fi
