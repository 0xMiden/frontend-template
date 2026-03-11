#!/usr/bin/env bash
#
# publish.sh
#
# Syncs the template, bumps version, and publishes create-miden-app to NPM.
#
# Usage:
#   ./scripts/publish.sh [patch|minor|major]   (default: patch)
#
# Dry run (preview without publishing or bumping version):
#   DRY_RUN=1 ./scripts/publish.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUMP="${1:-patch}"
DRY_RUN="${DRY_RUN:-}"

# 1. Sync template files
echo "==> Syncing template..."
"$REPO_ROOT/scripts/sync-template.sh"

cd "$REPO_ROOT/create-miden-app"

# 2. Verify template contents
TEMPLATE_DIR="$REPO_ROOT/create-miden-app/template"
if [ ! -f "$TEMPLATE_DIR/package.json" ] || [ ! -f "$TEMPLATE_DIR/vite.config.ts" ]; then
  echo "ERROR: Template sync failed — missing expected files"
  exit 1
fi

FILE_COUNT=$(find "$TEMPLATE_DIR" -type f | wc -l | tr -d ' ')
echo "==> Template contains $FILE_COUNT files"

if [ -n "$DRY_RUN" ]; then
  VERSION=$(node -p "require('./package.json').version")
  echo "==> Dry run — current version is $VERSION (no bump applied)"
  npm pack --dry-run
else
  # 3. Bump version
  npm version "$BUMP" --no-git-tag-version
  VERSION=$(node -p "require('./package.json').version")
  echo "==> Publishing create-miden-app@$VERSION..."

  # 4. Publish
  npm publish
  echo "==> Published! Users can now run: yarn create miden-app"
fi
