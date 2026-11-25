# Autenticação mobile do entregador (login via telefone + senha)

import re
from fastapi import APIRouter, HTTPException

from app.auth.security import create_access_token, verify_password
from app.db.database import connection, execute_query


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _tabela(cnpj: str) -> str:
    return f"tb_entregadores_{_cnpj_limpo(cnpj)}"


def _garantir(cnpj: str) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_entregadores_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(255) NOT NULL,
                    telefone VARCHAR(50) DEFAULT '',
                    email VARCHAR(255) DEFAULT '',
                    senha VARCHAR(255) DEFAULT '',
                    ativo TINYINT(1) NOT NULL DEFAULT 1,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
        finally:
            cur.close()


def autenticar_entregador(cnpj: str, telefone: str, senha: str):
    """Valida credenciais do entregador. Retorna dict ou None."""
    _garantir(cnpj)
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cur = conn.cursor(dictionary=True, buffered=True)
        try:
            cur.execute(
                f"SELECT * FROM `tb_entregadores_{c}` WHERE telefone=%s AND ativo=1",
                (telefone,),
            )
            row = cur.fetchone()
            if not row:
                return None
            stored = row.get("senha") or ""
            # Suporta senha em texto puro (criada no dashboard) ou hash bcrypt
            if stored and stored[:4] == "$2b$":
                ok = verify_password(senha, stored)
            else:
                ok = stored == senha
            if not ok:
                return None
            return {
                "id": row["id"],
                "nome": row["nome"],
                "telefone": row["telefone"],
            }
        finally:
            cur.close()


def token_para_entregador(cnpj: str, entregador: dict) -> str:
    return create_access_token(
        {
            "cnpj": cnpj,
            "entregador_id": entregador["id"],
            "role": "entregador",
            "name": entregador["nome"],
        }
    )


def obter_entregador_por_id(cnpj: str, entregador_id: int):
    _garantir(cnpj)
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(
                f"SELECT id, nome, telefone, email, ativo FROM `tb_entregadores_{c}` WHERE id=%s",
                (entregador_id,),
            )
            return cur.fetchone()
        finally:
            cur.close()


router = APIRouter(prefix="/api/mobile", tags=["App Entregador"])


@router.post("/login", status_code=200)
def login_mobile(payload: dict):
    cnpj = (payload.get("cnpj") or "").strip()
    telefone = (payload.get("telefone") or "").strip()
    senha = payload.get("senha") or ""
    if not cnpj or not telefone or not senha:
        raise HTTPException(status_code=400, detail="CNPJ, telefone e senha são obrigatórios")

    print(f"[mobile_auth] login tentativa: cnpj={cnpj} tel={telefone}")
    entregador = autenticar_entregador(cnpj, telefone, senha)
    if not entregador:
        print(f"[mobile_auth] login falhou: cnpj={cnpj} tel={telefone}")
        raise HTTPException(status_code=401, detail="Telefone ou senha inválidos")

    token = token_para_entregador(cnpj, entregador)
    return {
        "sucesso": True,
        "access_token": token,
        "entregador": entregador,
        "cnpj": cnpj,
    }