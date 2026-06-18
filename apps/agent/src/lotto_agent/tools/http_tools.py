import os
import httpx

API_BASE = os.getenv("API_BASE_URL") or os.getenv("API_BASE") or "http://localhost:3001"


def _headers() -> dict[str, str]:
    token = os.getenv("INTERNAL_API_TOKEN")
    return {"x-internal-token": token} if token else {}


async def latest_statistics():
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/internal/statistics", headers=_headers())
        res.raise_for_status()
        return res.json()


async def latest_draws(limit: int = 10):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/internal/latest-draws?limit={limit}", headers=_headers())
        res.raise_for_status()
        return res.json()


async def generate_candidates(payload: dict):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/internal/generate-candidates", json=payload, headers=_headers())
        res.raise_for_status()
        return res.json()


async def validate_candidates(combinations: list[list[int]]):
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{API_BASE}/internal/validate",
            json={"combinations": combinations},
            headers=_headers(),
        )
        res.raise_for_status()
        return res.json()
