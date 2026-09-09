# Modelos Pydantic para autenticação

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    cnpj: str = Field(..., description="CNPJ do cliente")
    password: str = Field(..., description="Senha do cliente")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    cnpj: str
    name: str
    role: str = "cliente"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserCreate(BaseModel):
    cnpj: str
    password: str
    name: str = ""
