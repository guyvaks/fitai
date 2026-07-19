"""Retry-path coverage for app.services.calorie_calculator._ask_claude.

Unlike the CrewAI plan-generation retry (see test_agents_crew.py), this route
retries transient errors inside the Anthropic SDK itself (max_retries=1) and
uses a structured-output JSON schema, so there is no JSON-parse-failure branch
to test. The only app-level behavior to verify is: on persistent failure
(SDK exhausts its retries and raises), the app must surface a visible,
identified HTTPException — not swallow it or return an empty/fake result.
This is the "(א)" classification from the retry-path mapping: already
correct, previously untested.
"""
import httpx
import pytest
import anthropic
from fastapi import HTTPException

from app.services import calorie_calculator

_REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


class _FakeMessages:
    def __init__(self, raise_exc=None, response_items=None):
        self._raise_exc = raise_exc
        self._response_items = response_items

    def create(self, **kwargs):
        if self._raise_exc:
            raise self._raise_exc
        return _FakeResponse(self._response_items)


class _FakeResponse:
    def __init__(self, items):
        import json as _json

        self.stop_reason = "end_turn"
        self.content = [_FakeBlock(_json.dumps({"items": items or []}))]


class _FakeBlock:
    def __init__(self, text):
        self.type = "text"
        self.text = text


class _FakeClient:
    def __init__(self, raise_exc=None, response_items=None):
        self.messages = _FakeMessages(raise_exc, response_items)


def _patch_client(monkeypatch, **kwargs):
    monkeypatch.setattr(calorie_calculator, "_client", lambda: _FakeClient(**kwargs))


def test_ask_claude_success_returns_items(monkeypatch):
    _patch_client(monkeypatch, response_items=[
        {"name": "תפוח", "estimated_quantity_g": 100, "calories": 52,
         "protein_g": 0.3, "fat_g": 0.2, "carbs_g": 14},
    ])
    items = calorie_calculator._ask_claude("system", "תפוח")
    assert items[0]["name"] == "תפוח"
    assert items[0]["source"] == "ai_estimate"


def test_ask_claude_raises_visible_429_on_persistent_rate_limit(monkeypatch):
    exc = anthropic.RateLimitError(
        "rate limited", response=httpx.Response(429, request=_REQUEST), body=None
    )
    _patch_client(monkeypatch, raise_exc=exc)

    with pytest.raises(HTTPException) as exc_info:
        calorie_calculator._ask_claude("system", "תפוח")
    assert exc_info.value.status_code == 429


def test_ask_claude_raises_visible_502_on_persistent_api_status_error(monkeypatch):
    exc = anthropic.APIStatusError(
        "server error", response=httpx.Response(500, request=_REQUEST), body=None
    )
    _patch_client(monkeypatch, raise_exc=exc)

    with pytest.raises(HTTPException) as exc_info:
        calorie_calculator._ask_claude("system", "תפוח")
    assert exc_info.value.status_code == 502


def test_ask_claude_raises_visible_502_on_persistent_connection_error(monkeypatch):
    exc = anthropic.APIConnectionError(message="connection failed", request=_REQUEST)
    _patch_client(monkeypatch, raise_exc=exc)

    with pytest.raises(HTTPException) as exc_info:
        calorie_calculator._ask_claude("system", "תפוח")
    assert exc_info.value.status_code == 502


def test_calculate_calories_endpoint_surfaces_429_not_silent_fallback(client, monkeypatch):
    """End-to-end: the /calculate-calories endpoint must propagate the visible
    error as an actual HTTP error response, not a 200 with an empty/fake item list."""
    from tests.conftest import get_auth_headers

    exc = anthropic.RateLimitError(
        "rate limited", response=httpx.Response(429, request=_REQUEST), body=None
    )
    monkeypatch.setattr(calorie_calculator, "_client", lambda: _FakeClient(raise_exc=exc))

    headers = get_auth_headers(client)
    # "קינואה מוזרה" won't match the internal DB, forcing the Claude fallback path.
    response = client.post(
        "/api/v1/nutrition/calculate-calories",
        headers=headers,
        json={"type": "text", "query": "קינואה מוזרה שלא קיימת במאגר"},
    )
    assert response.status_code == 429
