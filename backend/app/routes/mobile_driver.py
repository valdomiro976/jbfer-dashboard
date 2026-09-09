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


def _garantir_clientes(cnpj: str) -> None:
    """Garante a tabela de clientes com colunas de coordenadas (lat/lng)."""
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_clientes_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    whatsapp VARCHAR(50) NOT NULL,
                    nome VARCHAR(255) DEFAULT NULL,
                    tipo_cliente VARCHAR(20) DEFAULT NULL,
                    bot_ativo TINYINT(1) DEFAULT 1,
                    cep VARCHAR(20) DEFAULT NULL,
                    cidade VARCHAR(255) DEFAULT NULL,
                    uf VARCHAR(2) DEFAULT NULL,
                    bairro VARCHAR(255) DEFAULT NULL,
                    endereco VARCHAR(500) DEFAULT NULL,
                    referencia VARCHAR(500) DEFAULT NULL,
                    numero VARCHAR(50) DEFAULT NULL,
                    ddd1 VARCHAR(10) DEFAULT NULL,
                    ddd2 VARCHAR(10) DEFAULT NULL,
                    ddd3 VARCHAR(10) DEFAULT NULL,
                    ddd4 VARCHAR(10) DEFAULT NULL,
                    ddd5 VARCHAR(10) DEFAULT NULL,
                    fone1 VARCHAR(50) DEFAULT NULL,
                    fone2 VARCHAR(50) DEFAULT NULL,
                    fone3 VARCHAR(50) DEFAULT NULL,
                    fone4 VARCHAR(50) DEFAULT NULL,
                    fone5 VARCHAR(50) DEFAULT NULL,
                    obs TEXT DEFAULT NULL,
                    lat DECIMAL(10,7) DEFAULT NULL,
                    lng DECIMAL(10,7) DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_whatsapp (whatsapp)
                )
                """
            )
            for col, tipo in [("lat", "DECIMAL(10,7) DEFAULT NULL"), ("lng", "DECIMAL(10,7) DEFAULT NULL")]:
                cur.execute(f"SHOW COLUMNS FROM `tb_clientes_{c}` LIKE '{col}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE `tb_clientes_{c}` ADD COLUMN `{col}` {tipo}")
            conn.commit()
        finally:
            cur.close()


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


def _cliente_coords(cur, c: str, entrega: dict) -> tuple:
    """Retorna (lat, lng) do cliente vinculado à entrega, ou (None, None)."""
    def tem_colunas(table: str) -> bool:
        try:
            cur.execute(f"SELECT lat, lng FROM `{table}` LIMIT 1")
            cur.fetchall()
            return True
        except Exception:
            return False

    if not tem_colunas(f"tb_clientes_{c}"):
        return None, None

    whatsapp = None
    pedido_id = entrega.get("pedido_id")
    if pedido_id:
        try:
            cur.execute(f"SELECT whatsapp FROM `tb_pedidos_{c}` WHERE id=%s", (pedido_id,))
            row = cur.fetchone()
            if row:
                whatsapp = row.get("whatsapp")
        except Exception:
            whatsapp = None

    if whatsapp:
        try:
            cur.execute(f"SELECT lat, lng FROM `tb_clientes_{c}` WHERE whatsapp=%s", (whatsapp,))
            row = cur.fetchone()
            if row and row.get("lat") is not None and row.get("lng") is not None:
                return float(row["lat"]), float(row["lng"])
        except Exception:
            pass
    else:
        try:
            cur.execute(
                f"SELECT lat, lng FROM `tb_clientes_{c}` WHERE nome=%s ORDER BY id DESC LIMIT 1",
                (entrega.get("cliente_nome") or "",),
            )
            row = cur.fetchone()
            if row and row.get("lat") is not None and row.get("lng") is not None:
                return float(row["lat"]), float(row["lng"])
        except Exception:
            pass
    return None, None


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
                lat, lng = _cliente_coords(cur, c, r)
                r["cliente_lat"] = lat
                r["cliente_lng"] = lng
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
            result = []
            for r in rows:
                for campo in ("criado_em", "aceito_em", "coletado_em", "entregue_em", "cancelado_em"):
                    if r.get(campo):
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
                lat, lng = _cliente_coords(cur, c, r)
                r["cliente_lat"] = lat
                r["cliente_lng"] = lng
                result.append(r)
            return {"sucesso": True, "tarefas": result}
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


@router.post("/tarefas/{entrega_id}/coordenadas-cliente", status_code=200)
def coordenadas_cliente(
    entrega_id: int,
    payload: dict,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Atualiza as coordenadas (lat/lng) do cliente da entrega no endereço do cliente.

    O entregador, estando no local, envia a localização exata do dispositivo;
    o endereço do cliente (tb_clientes_<cnpj>) é sobrescrito com essas coordenadas.
    """
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])
    _garantir_clientes(ctx["cnpj"])

    lat = payload.get("lat")
    lng = payload.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="lat e lng são obrigatórios")
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="lat e lng devem ser números")

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordenadas fora do intervalo válido")

    with connection() as conn:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(
                f"SELECT pedido_id, cliente_nome FROM `tb_entregas_{c}` WHERE id=%s AND entregador_id=%s",
                (entrega_id, ctx["entregador_id"]),
            )
            entrega = cur.fetchone()
            if not entrega:
                raise HTTPException(status_code=404, detail="Tarefa não encontrada para este entregador")

            cliente_whatsapp = None
            pedido_id = entrega.get("pedido_id")
            if pedido_id:
                cur.execute(
                    f"SELECT whatsapp FROM `tb_pedidos_{c}` WHERE id=%s",
                    (pedido_id,),
                )
                pedido_row = cur.fetchone()
                if pedido_row:
                    cliente_whatsapp = pedido_row.get("whatsapp")

            if not cliente_whatsapp:
                # Sem pedido vinculado: tenta pelo nome do cliente
                cur.execute(
                    f"SELECT whatsapp FROM `tb_clientes_{c}` WHERE nome=%s ORDER BY id DESC LIMIT 1",
                    (entrega.get("cliente_nome") or "",),
                )
                cliente_row = cur.fetchone()
                if cliente_row:
                    cliente_whatsapp = cliente_row.get("whatsapp")

            if not cliente_whatsapp:
                raise HTTPException(status_code=404, detail="Cliente da entrega não encontrado")

            cur.execute(
                f"UPDATE `tb_clientes_{c}` SET lat=%s, lng=%s WHERE whatsapp=%s",
                (lat, lng, cliente_whatsapp),
            )
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Cliente não localizado no cadastro")
            return {
                "sucesso": True,
                "mensagem": f"Endereço do cliente atualizado: {lat:.6f}, {lng:.6f}",
            }
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