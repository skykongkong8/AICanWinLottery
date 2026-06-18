import os
import httpx

class MissingNvidiaKey(RuntimeError):
    pass

def nvidia_key() -> str:
    key = os.getenv("NVIDIA_API_KEY") or os.getenv("NVIDIA_NIM_KEY")
    if key:
        return key.strip()
    key_file = os.getenv("NVIDIA_NIM_KEY_FILE", "NVIDIA_NIM_KEY")
    if os.path.exists(key_file):
        return open(key_file, encoding="utf-8").read().strip()
    raise MissingNvidiaKey("NVIDIA_API_KEY (or NVIDIA_NIM_KEY) is required for live LLM explanations")

async def call_nim(prompt: str, model: str | None = None) -> str:
    key = nvidia_key()
    base = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
    model = model or os.getenv("NVIDIA_MODEL", "z-ai/glm-5.1")
    timeout = float(os.getenv("NIM_CALL_TIMEOUT_SECONDS", "8"))
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "system", "content": "Return only valid JSON matching the requested schema; prose must be inside string fields."}, {"role": "user", "content": prompt}], "temperature": 0.4},
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]

async def call_nim_with_optional_fallback(prompt: str) -> tuple[str, bool]:
    try:
        return await call_nim(prompt), False
    except Exception:
        fallback_model = os.getenv("NVIDIA_FALLBACK_MODEL")
        if fallback_model:
            return await call_nim(prompt, fallback_model), True
        raise
