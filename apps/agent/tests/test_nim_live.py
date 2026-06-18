import json
import os
import re
import time
from pathlib import Path

import pytest

from lotto_agent.graph_explain import explain
from lotto_agent.llm import call_nim, nvidia_key
from lotto_agent.schemas_generated import ExplainRequest

pytestmark = pytest.mark.live_nim

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "shared" / "fixtures"
MISSING_KEY_FILE = "/tmp/aicanwinlottery-nvidia-nim-key-file-disabled"


def _strip_json_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[A-Za-z0-9_-]*\s*\n?", "", stripped)
        stripped = re.sub(r"\n?\s*```\s*$", "", stripped)
    return stripped.strip()


def _require_nim_key_from_env(monkeypatch) -> str:
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.setenv("NVIDIA_NIM_KEY_FILE", MISSING_KEY_FILE)
    key = os.getenv("NVIDIA_NIM_KEY", "").strip()
    assert key, "NVIDIA_NIM_KEY must be set from the GitHub secret or local ./NVIDIA_NIM_KEY"
    assert nvidia_key() == key
    return key


@pytest.mark.asyncio
async def test_live_nim_direct_json_smoke_uses_nvidia_nim_key(monkeypatch):
    _require_nim_key_from_env(monkeypatch)
    prompt = json.dumps(
        {
            "instruction": "Return exactly one JSON object with boolean ok=true and string service='nim'.",
            "schema": {"ok": "boolean", "service": "string"},
        }
    )

    text = await call_nim(prompt)
    payload = json.loads(_strip_json_fences(text))

    assert payload["ok"] is True
    assert isinstance(payload["service"], str)
    assert payload["service"].strip()


@pytest.mark.asyncio
async def test_live_nim_agent_explain_is_schema_valid_non_fallback(monkeypatch):
    _require_nim_key_from_env(monkeypatch)
    req = ExplainRequest(**json.loads((FIXTURES / "explain-request.json").read_text()))

    started = time.monotonic()
    response = await explain(req)
    elapsed = time.monotonic() - started

    expected_ids = [item.id for item in req.combinations]
    actual_ids = [item.id for item in response.perCombination]
    combined_text = "\n".join(
        [
            response.analysisSummary,
            *[item.explanation for item in response.perCombination],
            *[item.tagNarration for item in response.perCombination],
        ]
    ).lower()

    assert elapsed < 45
    assert response.fallbackUsed is False
    assert actual_ids == expected_ids
    assert response.analysisSummary.strip()
    assert all(item.explanation.strip() for item in response.perCombination)
    assert all(item.tagNarration.strip() for item in response.perCombination)
    assert "automatically purchase" not in combined_text
    assert "buy tickets for you" not in combined_text
