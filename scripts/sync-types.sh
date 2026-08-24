#!/usr/bin/env bash
# Copies the canonical shared domain types into both packages.
# Functions must be self-contained for `firebase deploy`, and the web app has
# its own tsconfig root, so a copy is more reliable here than path aliases.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEADER="// GENERATED FILE — DO NOT EDIT. Source: /shared/domain.ts (npm run sync:types)"

mkdir -p "$ROOT/web/src/types" "$ROOT/functions/src"
for target in "$ROOT/web/src/types/domain.ts" "$ROOT/functions/src/domain.ts"; do
  { echo "$HEADER"; cat "$ROOT/shared/domain.ts"; } > "$target"
done
echo "Synced domain types -> web/src/types/domain.ts, functions/src/domain.ts"
