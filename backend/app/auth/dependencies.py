# Dependências de autenticação (FastAPI)

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional

from app.auth.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_cnpj(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """Extrai o CNPJ do token JWT. O CNPJ é o identificador do cliente (multi-tenant)."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    cnpj = payload.get("cnpj")
    role = payload.get("role", "cliente")
    name = payload.get("name", "")

    if not cnpj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem identificador de cliente",
        )

    return {"cnpj": cnpj, "role": role, "name": name}
