#!/usr/bin/env bash
set -euo pipefail

# CI supplies NVIDIA_NIM_KEY from the repository secret. Local runs may load it from the
# untracked ./NVIDIA_NIM_KEY file without printing it or passing it as a command-line argument.
if [[ -z "${NVIDIA_NIM_KEY:-}" ]]; then
  key_file="${NVIDIA_NIM_KEY_SOURCE_FILE:-./NVIDIA_NIM_KEY}"
  if [[ ! -s "$key_file" ]]; then
    echo "NVIDIA_NIM_KEY is required; set the env var or create non-empty ./NVIDIA_NIM_KEY." >&2
    exit 1
  fi
  IFS= read -r NVIDIA_NIM_KEY < "$key_file"
  export NVIDIA_NIM_KEY
fi

if [[ -z "${NVIDIA_NIM_KEY//[[:space:]]/}" ]]; then
  echo "NVIDIA_NIM_KEY is blank; live NIM tests cannot run." >&2
  exit 1
fi

# Prove the live gate uses NVIDIA_NIM_KEY, not the legacy NVIDIA_API_KEY or key-file fallback.
unset NVIDIA_API_KEY
export NVIDIA_NIM_KEY_FILE="${NVIDIA_NIM_KEY_FILE:-/tmp/aicanwinlottery-nvidia-nim-key-file-disabled}"
export NVIDIA_MODEL="${NVIDIA_MODEL:-z-ai/glm-5.1}"
export NIM_CALL_TIMEOUT_SECONDS="${NIM_CALL_TIMEOUT_SECONDS:-15}"
export NIM_MAX_TOKENS="${NIM_MAX_TOKENS:-700}"

uv run --project apps/agent pytest apps/agent/tests -m live_nim
