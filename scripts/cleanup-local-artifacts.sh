#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0

if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

TARGETS=(
  "$ROOT_DIR/outputs"
  "$ROOT_DIR/uploads"
  "$ROOT_DIR/logs"
  "$ROOT_DIR/backups"
  "$ROOT_DIR/.playwright-mcp"
  "$ROOT_DIR/machine-tab-full.png"
  "$ROOT_DIR/tsconfig.web.tsbuildinfo"
)

DB_GLOBS=(
  "$ROOT_DIR/data/*.db"
  "$ROOT_DIR/data/*.db-shm"
  "$ROOT_DIR/data/*.db-wal"
)

echo "Local artifact cleanup"
echo "Repo: $ROOT_DIR"
echo

if [[ $APPLY -eq 0 ]]; then
  echo "Dry run mode (no files deleted). Use --apply to delete."
else
  echo "Apply mode (matching files/directories will be deleted)."
fi
echo

remove_path() {
  local path="$1"
  if [[ -e "$path" ]]; then
    if [[ $APPLY -eq 0 ]]; then
      echo "[would remove] $path"
    else
      rm -rf "$path"
      echo "[removed] $path"
    fi
  fi
}

for target in "${TARGETS[@]}"; do
  remove_path "$target"
done

for pattern in "${DB_GLOBS[@]}"; do
  shopt -s nullglob
  matches=( $pattern )
  shopt -u nullglob
  for file in "${matches[@]}"; do
    remove_path "$file"
  done
done

echo
echo "Done."
