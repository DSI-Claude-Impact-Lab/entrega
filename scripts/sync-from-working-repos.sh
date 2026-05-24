#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT="$(cd -- "${REPO_ROOT}/.." && pwd)"

BACKEND_SRC="${BACKEND_SRC:-${WORKSPACE_ROOT}/backend}"
FRONTEND_SRC="${FRONTEND_SRC:-${WORKSPACE_ROOT}/frontend}"

if [[ ! -d "${BACKEND_SRC}/.git" ]]; then
  echo "Backend repo not found: ${BACKEND_SRC}" >&2
  exit 1
fi

if [[ ! -d "${FRONTEND_SRC}/.git" ]]; then
  echo "Frontend repo not found: ${FRONTEND_SRC}" >&2
  exit 1
fi

RSYNC_EXCLUDES=(
  --exclude ".git/"
  --include ".env.example"
  --exclude ".env"
  --exclude ".env.*"
  --exclude "__pycache__/"
  --exclude "*.pyc"
  --exclude ".pytest_cache/"
  --exclude ".ruff_cache/"
  --exclude ".venv/"
  --exclude "venv/"
  --exclude "node_modules/"
  --exclude "dist/"
  --exclude ".vite/"
  --exclude "*.log"
)

mkdir -p "${REPO_ROOT}/backend" "${REPO_ROOT}/frontend"

rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${BACKEND_SRC}/" "${REPO_ROOT}/backend/"
rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${FRONTEND_SRC}/" "${REPO_ROOT}/frontend/"

{
  echo "# Snapshot"
  echo
  echo "Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "Backend source:"
  echo
  echo '```text'
  git -C "${BACKEND_SRC}" log -1 --pretty="commit %H%nbranch %D%nsubject %s%nDate: %cI"
  echo '```'
  echo
  echo "Frontend source:"
  echo
  echo '```text'
  git -C "${FRONTEND_SRC}" log -1 --pretty="commit %H%nbranch %D%nsubject %s%nDate: %cI"
  echo '```'
} > "${REPO_ROOT}/SNAPSHOT.md"

echo "Synced backend and frontend into ${REPO_ROOT}"
