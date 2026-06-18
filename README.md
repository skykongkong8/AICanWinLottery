# AICanWinLottery

Korean Lotto 6/45 recommendation and result-tracking service. The API owns deterministic number generation, historical jackpot exclusion, SQLite writes, and fallback behavior. The Python agent receives already-generated combinations and returns prose only.

## Quick start

```bash
pnpm install
uv sync --project apps/agent
pnpm shared:openapi
pnpm agent:codegen
pnpm dev
```

Services:
- Web: http://localhost:5173
- API: http://localhost:3001/api/health
- Agent: http://localhost:8000/health

## Verification

```bash
pnpm verify
```

For live NIM testing, export `NVIDIA_API_KEY` (or `NVIDIA_NIM_KEY`) and run the agent tests that are not marked fallback-only. Verify the key has Public API Endpoints permission and that one `z-ai/glm-5.1` chat completion succeeds before relying on LLM explanations. The app degrades to deterministic templated explanations when NIM or the agent is unavailable.

## Safety

This is entertainment software. It does not improve odds, does not automate purchase, and only opens the official purchase page for adults (19+) with responsible-use guidance.
