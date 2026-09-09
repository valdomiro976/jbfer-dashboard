# Endpoints do app Android do entregador: tarefas de entrega e localização GPS

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.dependencies import get_current_cnpj
from app.auth.security import decode_token
from app.db.database import connection

router = APIRouter(prefix="/api/mobile", tags=["App Entregador"])

_bearer = HTTPBearer(auto_error=False)


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _get_driver_ctx(creds: HTTPAuthorizationCredentials):
    if creds is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    payload = decode_token(creds.credentials)
    if not payload or payload.get("role") != "entregador":
        raise HTTPException(status_code=401, detail="Token de entregador inválido")
    return {
        "cnpj": payload["cnpj"],
        "entregador_id": payload["entregador_id"],
        "name": payload.get("name", ""),
    }


def _garantir(cnpj: str) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_entregas_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entregador_id INT NULL,
                    pedido_id INT NULL,
                    pedido_descricao VARCHAR(500) DEFAULT '',
                    cliente_nome VARCHAR(255) DEFAULT '',
                    cliente_endereco VARCHAR(500) DEFAULT '',
                    cliente_cidade VARCHAR(255) DEFAULT '',
                    cliente_uf VARCHAR(2) DEFAULT '',
                    cliente_cep VARCHAR(20) DEFAULT '',
                    valor_total DECIMAL(10,2) DEFAULT 0,
                    status VARCHAR(50) NOT NULL DEFAULT 'pendente',
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    aceito_em DATETIME NULL,
                    coletado_em DATETIME NULL,
                    entregue_em DATETIME NULL,
                    cancelado_em DATETIME NULL,
                    entregador_nome VARCHAR(255) DEFAULT ''
                )
                """
            )
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_localizacao_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entregador_id INT NOT NULL,
                    lat DECIMAL(10,7) NOT NULL,
                    lng DECIMAL(10,7) NOT NULL,
                    precisao DECIMAL(8,2) DEFAULT NULL,
                    velocidade DECIMAL(8,2) DEFAULT NULL,
                    criado_em DATETIME NOT NULL,
                    Index idx_entregador (entregador_id)
                )
                """
            )
            conn.commit()
        finally:
            cur.close()


@router.get("/tarefas", status_code=200)
def minhas_tarefas(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])

    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(
                f"""
                SELECT * FROM `tb_entregas_{c}`
                WHERE entregador_id=%s AND status NOT IN ('cancelada','entregue')
                ORDER BY criado_em ASC
                """,
                (ctx["entregador_id"],),
            )
            rows = cur.fetchall() or []
            result = []
            for r in rows:
                for campo in ("criado_em", "aceito_em", "coletado_em", "entregue_em", "cancelado_em"):
                    if r.get(campo):
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
                result.append(r)
            return {"sucesso": True, "entregador": ctx["name"], "tarefas": result}
        finally:
            cur.close()


@router.get("/tarefas/historico", status_code=200)
def historico_tarefas(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])

    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(
                f"""
                SELECT * FROM `tb_entregas_{c}`
                WHERE entregador_id=%s AND status IN ('entregue','cancelada')
                ORDER BY criado_em DESC
                LIMIT 50
                """,
                (ctx["entregador_id"],),
            )
            rows = cur.fetchall() or []
            for r in rows:
                for campo in ("criado_em", "aceito_em", "coletado_em", "entregue_em", "cancelado_em"):
                    if r.get(campo):
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
            return {"sucesso": True, "tarefas": rows}
        finally:
            cur.close()


@router.post("/tarefas/{entrega_id}/atualizar", status_code=200)
def atualizar_tarefa(
    entrega_id: int,
    payload: dict,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
):
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])

    status = payload.get("status", "")
    valid_status = {"aceita", "em_transito", "entregue", "cancelada"}
    if status not in valid_status:
        raise HTTPException(status_code=400, detail="Status inválido")

    campo_data = {
        "aceita": "aceito_em",
        "em_transito": "coletado_em",
        "entregue": "entregue_em",
        "cancelada": "cancelado_em",
    }.get(status)

    with connection() as conn:
        cur = conn.cursor()
        try:
            if campo_data:
                cur.execute(
                    f"UPDATE `tb_entregas_{c}` SET status=%s, {campo_data}=NOW() WHERE id=%s AND entregador_id=%s",
                    (status, entrega_id, ctx["entregador_id"]),
                )
            else:
                cur.execute(
                    f"UPDATE `tb_entregas_{c}` SET status=%s WHERE id=%s AND entregador_id=%s",
                    (status, entrega_id, ctx["entregador_id"]),
                )
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Tarefa não encontrada para este entregador")
            return {"sucesso": True, "mensagem": f"Status atualizado para {status}"}
        finally:
            cur.close()


@router.post("/localizacao", status_code=200)
def enviar_localizacao(
    payload: dict,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
):
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])

    lat = payload.get("lat")
    lng = payload.get("lng")
    precisao = payload.get("precisao")
    velocidade = payload.get("velocidade")

    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="lat e lng são obrigatórios")

    with connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"INSERT INTO `tb_localizacao_{c}` (entregador_id, lat, lng, precisao, velocidade, criado_em) VALUES (%s, %s, %s, %s, %s, NOW())",
                (ctx["entregador_id"], float(lat), float(lng), precisao, velocidade),
            )
            conn.commit()
            return {"sucesso": True, "mensagem": "Localização registrada"}
        finally:
            cur.close()


@router.get("/perfil", status_code=200)
def perfil(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    ctx = _get_driver_ctx(creds)
    from app.routes.mobile_auth import obter_entregador_por_id
    entregador = obter_entregador_por_id(ctx["cnpj"], ctx["entregador_id"])
    if not entregador:
        raise HTTPException(status_code=404, detail="Entregador não encontrado")
    return {"sucesso": True, "entregador": entregador}