#!/usr/bin/env bash
#
# sync-template.sh
#
# Copies the frontend template files from the repo root into
# create-miden-app/template/ so the NPM package includes an
# up-to-date scaffold.
#
# Usage (from repo root):
#   ./scripts/sync-template.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/create-miden-app/template"

rm -rf "$TEMPLATE_DIR"
mkdir -p "$TEMPLATE_DIR"

rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='create-miden-app' \
  --exclude='scripts' \
  --exclude='public/packages' \
  "$REPO_ROOT/" "$TEMPLATE_DIR/"

# Remove repo-specific lines from the scaffolded .gitignore
sed -i '' '/^# Generated template directory/d; /^create-miden-app\/template\/$/d' \
  "$TEMPLATE_DIR/.gitignore"

# Remove trailing blank lines from .gitignore
sed -i '' -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$TEMPLATE_DIR/.gitignore"

echo "Synced template to create-miden-app/template/"
