from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


def get_client_ip(request: Request) -> str:
    """Per-client key for rate limiting.

    Railway terminates TLS at its own edge proxy and forwards requests to
    this service internally, so `request.client.host` is the proxy's
    address, not the caller's -- every request would share one bucket.
    Railway's edge sets X-Forwarded-For with the real client IP first, so
    prefer that (first entry, in case of further chained proxies) and only
    fall back to the raw connection address for local/direct requests
    (e.g. tests, `uvicorn --reload` on a dev machine).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "יותר מדי ניסיונות, נסה שוב מאוחר יותר"},
    )
