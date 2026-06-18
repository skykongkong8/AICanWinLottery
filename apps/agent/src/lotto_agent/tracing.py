import os
from contextlib import nullcontext

try:
    from langfuse import Langfuse
except Exception:  # pragma: no cover - optional dependency import guard
    Langfuse = None  # type: ignore


def langfuse_enabled() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


class Trace:
    def __init__(self, run_name: str, metadata: dict | None = None):
        self.run_name = run_name
        self.metadata = metadata or {}
        self.trace_id = None
        self._client = None
        if Langfuse and langfuse_enabled():
            self._client = Langfuse()

    def span(self, name: str, metadata: dict | None = None):
        if not self._client:
            return nullcontext()
        return self._client.start_as_current_observation(
            name=name,
            metadata={"runName": self.run_name, **self.metadata, **(metadata or {})},
        )

    def flush(self):
        if self._client:
            self._client.flush()
