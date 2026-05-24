"""
JWT Authentication module for verifying Supabase tokens.
Supports both HS256 (legacy) and ES256 (new ECC) signing keys.
"""
import jwt as pyjwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings
from models import CurrentUserContext
import database as db

# Security scheme for extracting Bearer token from headers
security = HTTPBearer()

# Only these two algorithms are accepted — explicitly blocks 'none' and any other value
_ALLOWED_ALGS = frozenset({"ES256", "HS256"})

# JWKS client to fetch public keys from Supabase for ES256 verification
_jwks_client = None

def get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verify JWT token from Supabase and extract user information.
    Tries ES256 (JWKS) first, falls back to HS256 (legacy secret).
    """
    token = credentials.credentials

    try:
        header = pyjwt.get_unverified_header(token)
        alg = header.get("alg", "")

        if alg not in _ALLOWED_ALGS:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if alg == "ES256":
            jwks_client = get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                options={"verify_aud": False}
            )
        else:
            payload = pyjwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )

        return payload

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(payload: dict = Depends(verify_token)) -> CurrentUserContext:
    """
    Extract user ID from verified JWT token and load household context.
    Returns a CurrentUserContext with user_id and optional household_id.
    """
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token",
        )

    household = await db.get_household_by_user(user_id)
    household_id = household["id"] if household else None

    return CurrentUserContext(user_id=user_id, household_id=household_id)
