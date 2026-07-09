"""
Calorie calculator service — estimates calories + macros for a food item
given free text or a photo.

Resolution order for text: the internal Hebrew food DB first (exact/substring
match, source="internal_db"), Claude only as fallback (source="ai_estimate").
Images always go to Claude Vision.
"""
import json

import anthropic
from fastapi import HTTPException

from app.core.config import settings
from app.data.foods import search_foods

MODEL = "claude-opus-4-8"

# Structured-output schema: guarantees the response is valid JSON in this shape,
# so no defensive parsing/regex is needed on the way out.
ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "estimated_quantity_g": {"type": "number"},
                    "calories": {"type": "number"},
                    "protein_g": {"type": "number"},
                    "fat_g": {"type": "number"},
                    "carbs_g": {"type": "number"},
                },
                "required": [
                    "name", "estimated_quantity_g", "calories",
                    "protein_g", "fat_g", "carbs_g",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

TEXT_SYSTEM = (
    "אתה מומחה תזונה. המשתמש מזין שם מוצר מזון (בעברית או באנגלית), לעיתים עם כמות. "
    "החזר את הערכים התזונתיים שלו. אם לא צוינה כמות — החזר ערכים ל-100 גרם "
    "עם estimated_quantity_g=100. אם צוינה כמות, החזר את הערכים לכמות שצוינה. "
    "name יוחזר בעברית. אם הקלט אינו מוצר מזון כלל, החזר רשימת items ריקה."
)

IMAGE_SYSTEM = (
    "אתה מומחה תזונה. נתונה תמונה של מוצר/י מזון. זהה כל פריט מזון בתמונה, "
    "הערך את הכמות שלו בגרמים לפי מה שנראה, וחשב קלוריות ומאקרו לכמות המוערכת. "
    "name יוחזר בעברית. אם אין מזון בתמונה, החזר רשימת items ריקה."
)


def _client() -> anthropic.Anthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI service is not configured")
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0, max_retries=1)


def _ask_claude(system: str, content) -> list[dict]:
    try:
        response = _client().messages.create(
            model=MODEL,
            max_tokens=2048,
            system=system,
            output_config={"format": {"type": "json_schema", "schema": ITEMS_SCHEMA}},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="AI service is rate limited, try again shortly")
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI service error ({e.status_code})")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="Could not reach AI service")

    if response.stop_reason == "refusal" or not response.content:
        return []
    text = next((b.text for b in response.content if b.type == "text"), "")
    items = json.loads(text)["items"]
    for item in items:
        item["source"] = "ai_estimate"
    return items


def calculate_from_text(query: str) -> list[dict]:
    query = query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query must not be empty")

    # Internal DB first — exact values, no AI cost/latency
    matches = search_foods(query)
    if matches:
        best = min(matches, key=lambda f: len(f["name"]))
        return [{
            "name": best["name"],
            "estimated_quantity_g": 100,
            "calories": best["calories"],
            "protein_g": best["protein"],
            "fat_g": best["fat"],
            "carbs_g": best["carbs"],
            "source": "internal_db",
        }]

    return _ask_claude(TEXT_SYSTEM, query)


def calculate_from_image(image_base64: str, media_type: str = "image/jpeg") -> list[dict]:
    if not image_base64:
        raise HTTPException(status_code=400, detail="Image data must not be empty")
    # Tolerate data-URL input from the browser ("data:image/png;base64,....")
    if image_base64.startswith("data:"):
        header, _, image_base64 = image_base64.partition(",")
        media_type = header.split(";")[0].removeprefix("data:") or media_type

    content = [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": image_base64},
        },
        {"type": "text", "text": "זהה את המזון בתמונה והחזר ערכים תזונתיים."},
    ]
    return _ask_claude(IMAGE_SYSTEM, content)
