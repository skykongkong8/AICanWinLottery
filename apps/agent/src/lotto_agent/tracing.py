import os
from contextlib import nullcontext

try:
    from langfuse import Langfuse
except Exception:  # pragma: no cover - optional dependency import guard
    Langfuse = None  # type: ignore


def langfuse_enabled() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


def _to_langfuse_trace_id(trace_id: str) -> str | None:
    """Map the API-issued trace id onto a W3C-valid (32-char lowercase hex) Langfuse trace id.

    A UUID with its hyphens removed is already 32 hex chars, so the agent's trace adopts the *same*
    identity the API persisted (true correlation, not a sibling trace). If the id is not UUID-shaped,
    derive a deterministic id from it so the link is still stable.
    """
    candidate = trace_id.replace("-", "").lower()
    if len(candidate) == 32 and all(c in "0123456789abcdef" for c in candidate):
        return candidate
    if Langfuse is not None and hasattr(Langfuse, "create_trace_id"):
        return Langfuse.create_trace_id(seed=trace_id)
    return None


class Trace:
    def __init__(self, run_name: str, metadata: dict | None = None, trace_id: str | None = None):
        self.run_name = run_name
        self.metadata = metadata or {}
        # Adopt the API-issued trace id as this trace's identity so persisted traceId == agent trace.
        self.trace_id = trace_id
        self._lf_trace_id = _to_langfuse_trace_id(trace_id) if trace_id else None
        self._client = None
        if Langfuse and langfuse_enabled():
            self._client = Langfuse()

    def span(self, name: str, metadata: dict | None = None):
        if not self._client:
            return nullcontext()
        kwargs: dict = {
            "name": name,
            "metadata": {"runName": self.run_name, **self.metadata, **(metadata or {})},
        }
        if self._lf_trace_id:
            kwargs["trace_context"] = {"trace_id": self._lf_trace_id}
        return self._client.start_as_current_observation(**kwargs)

    def flush(self):
        if self._client:
            self._client.flush()
