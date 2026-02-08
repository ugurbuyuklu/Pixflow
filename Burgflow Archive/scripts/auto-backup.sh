#!/bin/bash
# Auto-backup script for Borgflow documentation
# Runs every 45 minutes via launchd or cron

PROJECT_DIR="/Users/pixery/Desktop/Borgflow/borgflow"
BACKUP_DIR="${PROJECT_DIR}/backups"
MAX_BACKUPS=20

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FOLDER="${BACKUP_DIR}/docs_${TIMESTAMP}"
mkdir -p "${BACKUP_FOLDER}"

# Copy documentation files
cp "${PROJECT_DIR}/CLAUDE.md" "${BACKUP_FOLDER}/CLAUDE_root.md"
cp "${PROJECT_DIR}/docs/"*.md "${BACKUP_FOLDER}/"

echo "[$(date)] Backup created: ${BACKUP_FOLDER}"

# Cleanup old backups (keep only MAX_BACKUPS most recent)
cd "${BACKUP_DIR}"
ls -dt docs_* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -rf 2>/dev/null

echo "[$(date)] Cleanup complete. Keeping last ${MAX_BACKUPS} backups."
