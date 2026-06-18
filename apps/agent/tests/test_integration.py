import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from lotto_agent.app import app

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "shared" / "fixtures"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_http_explain_returns_schema_valid_llm_response(monkeypatch):
    request = json.loads((FIXTURES / "explain-request.json").read_text())

    async def live_shaped_response(_prompt: str):
        return (
            json.dumps(
                {
                    "perCombination": [
                        {
                            "id": item["id"],
                            "explanation": f"Boundary explanation for {item['id']}.",
                            "tagNarration": f"Boundary tag narration for {item['id']}.",
                        }
                        for item in request["combinations"]
                    ],
                    "analysisSummary": "Boundary summary.",
                }
            ),
            False,
        )

    monkeypatch.setattr("lotto_agent.graph_explain.call_nim_with_optional_fallback", live_shaped_response)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://agent.test") as client:
        health = await client.get("/health")
        assert health.status_code == 200
        assert health.json()["ok"] is True

        response = await client.post("/explain", json=request)

    assert response.status_code == 200
    payload = response.json()
    assert payload["fallbackUsed"] is False
    assert [item["id"] for item in payload["perCombination"]] == [
        item["id"] for item in request["combinations"]
    ]
    assert all(item["explanation"] for item in payload["perCombination"])
    assert all(item["tagNarration"] for item in payload["perCombination"])


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_http_run_exposes_internal_tool_spans(monkeypatch):
    async def fake_run(payload: dict):
        assert payload == {"luckyNumbers": [7, 11], "count": 1}
        return {
            "spans": [
                "load_draw_data",
                "compute_statistics",
                "generate_candidates",
                "validate_candidates",
                "llm_explain",
                "return",
            ],
            "validation": {"valid": True},
        }

    monkeypatch.setattr("lotto_agent.app.run_dev_graph", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://agent.test") as client:
        response = await client.post("/run", json={"luckyNumbers": [7, 11], "count": 1})

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation"]["valid"] is True
    assert payload["spans"][-1] == "return"
