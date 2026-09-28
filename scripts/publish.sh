#!/usr/bin/env bash
# Publishes every workspace package whose local version isn't on npm yet, dependencies first.
# Usage: ./scripts/publish.sh [--dry-run] [extra pnpm publish flags]. Run after `lerna version`.
set -euo pipefail

cd "$(dirname "$0")/.."

# pnpm -r publish skips versions already on npm, orders by workspace deps,
# and rewrites workspace:^ to real ranges (npm publish would not)
pnpm -r publish --access public "$@"

echo ""
echo "npm versions (may take a few minutes to update):"
for dir in packages/*/; do
  name=$(node -p "require('./${dir}package.json').name")
  local_version=$(node -p "require('./${dir}package.json').version")
  npm_version=$(npm view "$name" version 2>/dev/null || echo "not found")
  echo "  $name  local=$local_version  npm=$npm_version"
done
