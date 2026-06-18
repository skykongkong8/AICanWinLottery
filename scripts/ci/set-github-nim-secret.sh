#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-skykongkong8/AICanWinLottery}"
key_file="${NVIDIA_NIM_KEY_SOURCE_FILE:-./NVIDIA_NIM_KEY}"

if [[ ! -s "$key_file" ]]; then
  echo "Missing non-empty $key_file; refusing to set NVIDIA_NIM_KEY." >&2
  exit 1
fi

if git ls-files --error-unmatch "$key_file" >/dev/null 2>&1; then
  echo "$key_file is tracked by git; refusing to use it as a secret source." >&2
  exit 1
fi

gh secret set NVIDIA_NIM_KEY --repo "$repo" < "$key_file"
gh secret list --repo "$repo" | awk '$1 == "NVIDIA_NIM_KEY" { found = 1 } END { exit found ? 0 : 1 }'
echo "NVIDIA_NIM_KEY is configured for $repo; value was not printed."
