#!/usr/bin/env bash
# Build a self-contained Happy CLI into ./happy-cli-out — dist + bin + the
# @slopus/happy-wire workspace package bundled into node_modules (incl. native
# deps for the current arch). The folder runs directly (bin/happy.mjs); it is
# NOT meant to be re-`npm install`ed. Baked into the workspace image so the
# `happy` command is present with zero per-start install.
#
# Usage: scripts/build-happy-cli-deploy.sh [output-dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/happy-cli-out}"
cd "$ROOT"

pnpm install --frozen-lockfile
pnpm --filter @slopus/happy-wire build
pnpm --filter happy build

rm -rf "$OUT"
# --legacy: pnpm v10 needs it to deploy a non-injected workspace; it copies
# workspace deps in and produces a runnable, self-contained folder.
pnpm --filter happy deploy --legacy --prod "$OUT"

echo "Self-contained Happy CLI built at: $OUT"
echo "Run it with: node \"$OUT/bin/happy.mjs\" --version"
