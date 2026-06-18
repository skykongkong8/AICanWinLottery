#!/usr/bin/env bash
set -euo pipefail

files=(
  packages/shared/openapi.json
  packages/shared/fixtures/explain-request.json
  packages/shared/fixtures/explain-response.json
  apps/agent/src/lotto_agent/schemas_generated.py
)

before="$(mktemp)"
after="$(mktemp)"
trap 'rm -f "$before" "$after"' EXIT

sha256sum "${files[@]}" > "$before"
pnpm agent:codegen
sha256sum "${files[@]}" > "$after"

if ! diff -u "$before" "$after"; then
  echo "Generated contract artifacts changed after codegen. Run pnpm agent:codegen and commit the updated artifacts." >&2
  exit 1
fi
