# Rotas de autenticação (login via CNPJ)

from fastapi import APIRouter, HTTPException, status

from app.auth.security import create_access_token, hash_password, verify_password
from app.models.auth import LoginRequest, LoginResponse, UserCreate
from app.services.user_service import create_user, get_user_by_cnpj
from app.utils.cnpj import extrair_cnpj_base

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def login(payload: LoginRequest):
    cnpj = payload.cnpj.strip()
    user = get_user_by_cnpj(cnpj)

    if not user or not user.get("ativo"):
        raise HTTPException(status_code=401, detail="CNPJ não cadastrado")

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha incorreta")

    token = create_access_token(
        {"cnpj": cnpj, "role": user["role"], "name": user["name"]}
    )
    return LoginResponse(
        access_token=token,
        cnpj=cnpj,
        name=user["name"] or cnpj,
        role=user["role"],
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate):
    cnpj = payload.cnpj.strip()
    if not extrair_cnpj_base(cnpj):
        raise HTTPException(
            status_code=400,
            detail="CNPJ inválido. Use o formato CNPJ-Counter (ex.: 02408190000136-1)",
        )

    if get_user_by_cnpj(cnpj):
        raise HTTPException(status_code=409, detail="CNPJ já cadastrado")

    password_hash = hash_password(payload.password)
    user = create_user(cnpj, password_hash, payload.name)
    return {"sucesso": True, "usuario": user, "mensagem": "Usuário criado com sucesso"}
