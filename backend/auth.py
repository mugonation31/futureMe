"""
JWT authentication using HS256 with our own secret.
"""
import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings
from models import CurrentUserContext
import database as db

security = HTTPBearer()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        # Reject special-purpose tokens (e.g. password reset) from being used as session tokens
        if payload.get("purpose") is not None:
            raise pyjwt.InvalidTokenError("Special-purpose token cannot be used as a session token")
        return payload
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except pyjwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(payload: dict = Depends(verify_token)) -> CurrentUserContext:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ID not found in token",
        )
    household = await db.get_household_by_user(user_id)
    household_id = household["id"] if household else None
    return CurrentUserContext(user_id=user_id, household_id=household_id)
