from lotto_agent.tools import http_tools


def test_internal_headers_include_token(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")
    assert http_tools._headers() == {"x-internal-token": "secret"}


def test_internal_headers_empty_without_token(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    assert http_tools._headers() == {}
