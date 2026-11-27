# Endpoints do app Android do entregador: tarefas de entrega e localização GPS

import json
import re
import requests
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


def _marcar_agendamento_saiu(cnpj: str, entrega_id: int) -> None:
    """CRIADO EM: 30/09/2026 - quando o entregador marca a tarefa como EM
    TRANSITO no app, o agendamento do MESMO pedido (tb_agendamentos_entregas_*)
    passa a 'saiu_para_entrega' (a mercadoria ja esta a caminho)."""
    c = _cnpj_limpo(cnpj)
    try:
        from app.services import agendamento_service

        agendamento_service._garantir_tabela(cnpj)
        with connection() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    f"SELECT pedido_id FROM `tb_entregas_{c}` WHERE id=%s",
                    (entrega_id,),
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    return
                cur.execute(
                    f"UPDATE `tb_agendamentos_entregas_{c}` "
                    f"SET status='saiu_para_entrega', atualizado_em=NOW() "
                    f"WHERE pedido_id=%s AND status='agendado'",
                    (row[0],),
                )
                conn.commit()
                # CRIADO EM: 30/09/2026 - mercadoria saiu: avisa o cliente
                # (fila tb_avisos_pendentes, Delphi envia).
                if cur.rowcount:
                    cur.execute(
                        f"SELECT id FROM `tb_agendamentos_entregas_{c}` "
                        f"WHERE pedido_id=%s AND status='saiu_para_entrega'",
                        (row[0],),
                    )
                    for (agend_id,) in cur.fetchall() or []:
                        agendamento_service._enfileirar_aviso_cliente(cnpj, agend_id, 'saiu_para_entrega')
            finally:
                cur.close()
    except Exception:
        pass


def _marcar_agendamento_voltou_agendado(cnpj: str, entrega_id: int) -> None:
    """CRIADO EM: 30/09/2026 - quando o entregador REVERTE a tarefa que estava
    EM TRANSITO (volta p/ 'aceita'), o agendamento do mesmo pedido que estava
    'saiu_para_entrega' volta para 'agendado' e o cliente e avisado sobre a
    alteracao."""
    c = _cnpj_limpo(cnpj)
    try:
        from app.services import agendamento_service

        agendamento_service._garantir_tabela(cnpj)
        with connection() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    f"SELECT pedido_id FROM `tb_entregas_{c}` WHERE id=%s",
                    (entrega_id,),
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    return
                cur.execute(
                    f"UPDATE `tb_agendamentos_entregas_{c}` "
                    f"SET status='agendado', atualizado_em=NOW() "
                    f"WHERE pedido_id=%s AND status='saiu_para_entrega'",
                    (row[0],),
                )
                conn.commit()
                if cur.rowcount:
                    cur.execute(
                        f"SELECT id FROM `tb_agendamentos_entregas_{c}` "
                        f"WHERE pedido_id=%s AND status='agendado'",
                        (row[0],),
                    )
                    for (agend_id,) in cur.fetchall() or []:
                        agendamento_service._enfileirar_aviso_cliente(cnpj, agend_id, 'agendado')
            finally:
                cur.close()
    except Exception:
        pass


def _marcar_agendamento_entregue(cnpj: str, entrega_id: int) -> None:
    """ALTERADO EM: 29/09/2026 - quando o entregador marca a tarefa como
    ENTREGUE no app, o agendamento do MESMO pedido (tb_agendamentos_entregas_*)
    tambem passa a 'entregue', para acompanhar no Dashboard."""
    c = _cnpj_limpo(cnpj)
    try:
        from app.services import agendamento_service

        agendamento_service._garantir_tabela(cnpj)
        with connection() as conn:
            cur = conn.cursor()
            try:
                cur.execute(
                    f"SELECT pedido_id FROM `tb_entregas_{c}` WHERE id=%s",
                    (entrega_id,),
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    return
                cur.execute(
                    f"UPDATE `tb_agendamentos_entregas_{c}` "
                    f"SET status='entregue', atualizado_em=NOW() "
                    f"WHERE pedido_id=%s AND status NOT IN ('cancelado','entregue')",
                    (row[0],),
                )
                conn.commit()
                # CRIADO EM: 30/09/2026 - entrega concluida: avisa o cliente
                # (fila tb_avisos_pendentes, Delphi envia).
                if cur.rowcount:
                    cur.execute(
                        f"SELECT id FROM `tb_agendamentos_entregas_{c}` "
                        f"WHERE pedido_id=%s AND status='entregue'",
                        (row[0],),
                    )
                    for (agend_id,) in cur.fetchall() or []:
                        agendamento_service._enfileirar_aviso_cliente(cnpj, agend_id, 'entregue')
            finally:
                cur.close()
    except Exception:
        pass


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
                    motivo_cancelamento VARCHAR(500) DEFAULT '',
                    entregador_nome VARCHAR(255) DEFAULT '',
                    cliente_lat DECIMAL(10,7) DEFAULT NULL,
                    cliente_lng DECIMAL(10,7) DEFAULT NULL
                )
                """
            )
            cur.execute(f"SHOW COLUMNS FROM `tb_entregas_{c}` LIKE 'motivo_cancelamento'")
            if not cur.fetchone():
                cur.execute(f"ALTER TABLE `tb_entregas_{c}` ADD COLUMN motivo_cancelamento VARCHAR(500) DEFAULT ''")
            for col, tipo in [("cliente_lat", "DECIMAL(10,7) DEFAULT NULL"), ("cliente_lng", "DECIMAL(10,7) DEFAULT NULL")]:
                cur.execute(f"SHOW COLUMNS FROM `tb_entregas_{c}` LIKE '{col}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE `tb_entregas_{c}` ADD COLUMN `{col}` {tipo}")
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
    """Retorna (lat, lng) do cliente vinculado à entrega, ou (None, None).

    Prioriza coordenadas salvas na própria entrega (cliente_lat/cliente_lng).
    Fallback: busca no cadastro de clientes (tb_clientes_<cnpj>).
    """
    lat = entrega.get("cliente_lat")
    lng = entrega.get("cliente_lng")
    if lat is not None and lng is not None:
        return float(lat), float(lng)

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


def _pedido_detalhes(cur, c: str, pedido_id) -> dict:
    """Retorna forma de pagamento, descrição dos itens e quantidade total do pedido."""
    if not pedido_id:
        return {"pagamento": None, "itens": None, "quantidade": None}
    try:
        cur.execute(f"SELECT produto, pagamento, dados FROM `tb_pedidos_{c}` WHERE id=%s", (pedido_id,))
        row = cur.fetchone()
    except Exception:
        return {"pagamento": None, "itens": None, "quantidade": None}
    if not row:
        return {"pagamento": None, "itens": None, "quantidade": None}

    pagamento = (row.get("pagamento") or "").strip() or None
    produto = (row.get("produto") or "").strip() or None
    quantidade = None

    dados = row.get("dados")
    try:
        if isinstance(dados, str):
            dados = json.loads(dados)
    except Exception:
        dados = None

    if isinstance(dados, list):
        qtds = []
        itens = []
        for d in dados:
            if not isinstance(d, dict):
                continue
            campo = d.get("campo", "")
            if campo == "item":
                nome = d.get("produto") or d.get("descricao") or ""
                qtd = int(d.get("quantidade") or 1)
                itens.append(f"{nome} x{qtd}")
                qtds.append(qtd)
            elif campo == "quantidade":
                try:
                    qtds.append(int(d.get("valor") or 1))
                except (TypeError, ValueError):
                    pass
        if qtds:
            quantidade = sum(qtds)
        if itens:
            produto = "; ".join(itens)
        elif produto and quantidade:
            produto = f"{produto} x{quantidade}"

    if produto and quantidade is None:
        quantidades = [int(m) for m in re.findall(r"x(\d+)", produto)]
        quantidade = sum(quantidades) if quantidades else 1

    return {"pagamento": pagamento, "itens": produto, "quantidade": quantidade or 1}


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
                for k, v in _pedido_detalhes(cur, c, r.get("pedido_id")).items():
                    r[k] = v
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
                for k, v in _pedido_detalhes(cur, c, r.get("pedido_id")).items():
                    r[k] = v
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
    valid_status = {"pendente", "aceita", "em_transito", "entregue", "cancelada"}
    if status not in valid_status:
        raise HTTPException(status_code=400, detail="Status inválido")

    if status == "cancelada":
        motivo = (payload.get("motivo") or "").strip()
        if not motivo:
            raise HTTPException(status_code=400, detail="Motivo do cancelamento é obrigatório")
        if len(motivo) > 500:
            raise HTTPException(status_code=400, detail="Motivo muito longo (máx. 500 caracteres)")

    campo_data = {
        "aceita": "aceito_em",
        "em_transito": "coletado_em",
        "entregue": "entregue_em",
        "cancelada": "cancelado_em",
    }.get(status)

    with connection() as conn:
        cur = conn.cursor()
        try:
            if status == "cancelada":
                cur.execute(
                    f"UPDATE `tb_entregas_{c}` SET status=%s, cancelado_em=NOW(), motivo_cancelamento=%s WHERE id=%s AND entregador_id=%s",
                    (status, motivo, entrega_id, ctx["entregador_id"]),
                )
            elif campo_data:
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
                # Distingue "não existe" de "nada mudou" (UPDATE que mantém
                # o mesmo valor retorna rowcount 0 no MySQL).
                cur.execute(
                    f"SELECT 1 FROM `tb_entregas_{c}` WHERE id=%s AND entregador_id=%s LIMIT 1",
                    (entrega_id, ctx["entregador_id"]),
                )
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Tarefa não encontrada para este entregador")
            if status == "em_transito":
                # CRIADO EM: 30/09/2026 - a mercadoria saiu com o entregador:
                # o agendamento do mesmo pedido passa a 'saiu_para_entrega'.
                _marcar_agendamento_saiu(ctx["cnpj"], entrega_id)
            if status == "aceita":
                # CRIADO EM: 30/09/2026 - entregador reverteu (saiu -> nao
                # saiu): o agendamento volta a 'agendado' e o cliente e avisado.
                _marcar_agendamento_voltou_agendado(ctx["cnpj"], entrega_id)
            if status == "entregue":
                _marcar_agendamento_entregue(ctx["cnpj"], entrega_id)
            return {"sucesso": True, "mensagem": f"Status atualizado para {status}"}
        finally:
            cur.close()


@router.post("/tarefas/{entrega_id}/coordenadas-cliente", status_code=200)
def coordenadas_cliente(
    entrega_id: int,
    payload: dict,
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Salva as coordenadas reais do local da entrega (gravadas pelo entregador no local)."""
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
                f"SELECT id, pedido_id, cliente_nome FROM `tb_entregas_{c}` WHERE id=%s AND entregador_id=%s",
                (entrega_id, ctx["entregador_id"]),
            )
            entrega = cur.fetchone()
            if not entrega:
                raise HTTPException(status_code=404, detail="Entrega não encontrada para este entregador")

            cur.execute(
                f"UPDATE `tb_entregas_{c}` SET cliente_lat=%s, cliente_lng=%s WHERE id=%s",
                (lat, lng, entrega_id),
            )

            cliente_whatsapp = None
            pedido_id = entrega.get("pedido_id")
            if pedido_id:
                try:
                    cur.execute(
                        f"SELECT whatsapp FROM `tb_pedidos_{c}` WHERE id=%s",
                        (pedido_id,),
                    )
                    pedido_row = cur.fetchone()
                    if pedido_row:
                        cliente_whatsapp = pedido_row.get("whatsapp")
                except Exception:
                    pass

            if not cliente_whatsapp:
                try:
                    cur.execute(
                        f"SELECT whatsapp FROM `tb_clientes_{c}` WHERE nome=%s ORDER BY id DESC LIMIT 1",
                        (entrega.get("cliente_nome") or "",),
                    )
                    cliente_row = cur.fetchone()
                    if cliente_row:
                        cliente_whatsapp = cliente_row.get("whatsapp")
                except Exception:
                    pass

            if cliente_whatsapp:
                try:
                    cur.execute(
                        f"UPDATE `tb_clientes_{c}` SET lat=%s, lng=%s WHERE whatsapp=%s",
                        (lat, lng, cliente_whatsapp),
                    )
                    # Reverse geocoding: se o cliente nao tem endereco, preenche via coordenadas
                    cur.execute(
                        f"SELECT endereco, cidade, uf, cep FROM `tb_clientes_{c}` WHERE whatsapp=%s",
                        (cliente_whatsapp,),
                    )
                    cli = cur.fetchone()
                    if cli and not (cli.get("endereco") or "").strip():
                        try:
                            r = requests.get(
                                "https://nominatim.openstreetmap.org/reverse",
                                params={"lat": lat, "lon": lng, "format": "json", "addressdetails": 1},
                                headers={"User-Agent": "JBFER-Dashboard/1.0"},
                                timeout=10,
                            )
                            if r.status_code == 200:
                                data = r.json()
                                addr = data.get("address", {}) or {}
                                road = addr.get("road") or addr.get("street") or ""
                                suburb = addr.get("suburb") or addr.get("neighbourhood") or ""
                                city = addr.get("city") or addr.get("town") or addr.get("village") or ""
                                state = addr.get("state") or ""
                                postcode = addr.get("postcode") or ""
                                endereco = ", ".join([p for p in [road, suburb] if p]).strip()
                                uf = ""
                                # Map state name to UF (simplificado)
                                uf_map = {
                                    "São Paulo": "SP", "Rio de Janeiro": "RJ", "Minas Gerais": "MG",
                                    "Paraná": "PR", "Santa Catarina": "SC", "Rio Grande do Sul": "RS",
                                    "Bahia": "BA", "Goiás": "GO", "Pernambuco": "PE", "Ceará": "CE",
                                    "Pará": "PA", "Maranhão": "MA", "Mato Grosso": "MT",
                                    "Mato Grosso do Sul": "MS", "Espírito Santo": "ES", "Rio Grande do Norte": "RN",
                                    "Paraíba": "PB", "Alagoas": "AL", "Sergipe": "SE", "Piauí": "PI",
                                    "Tocantins": "TO", "Rondônia": "RO", "Acre": "AC", "Amazonas": "AM",
                                    "Roraima": "RR", "Amapá": "AP", "Distrito Federal": "DF",
                                }
                                uf = uf_map.get(state, state[:2].upper() if state else "")
                                if endereco or city:
                                    cur.execute(
                                        f"UPDATE `tb_clientes_{c}` SET endereco=%s, cidade=%s, uf=%s, cep=%s WHERE whatsapp=%s",
                                        (endereco or None, city or None, uf or None, postcode or None, cliente_whatsapp),
                                    )
                        except Exception:
                            pass
                except Exception:
                    pass

            conn.commit()
            return {
                "sucesso": True,
                "mensagem": f"Coordenadas salvas: {lat:.6f}, {lng:.6f}",
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


@router.post("/logout", status_code=200)
def logout_entregador(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    """Marca o entregador como offline ao sair do app."""
    ctx = _get_driver_ctx(creds)
    c = _cnpj_limpo(ctx["cnpj"])
    _garantir(ctx["cnpj"])
    with connection() as conn:
        cur = conn.cursor()
        try:
            # Remove localizacoes recentes (ultimos 5 min) para aparecer offline imediatamente
            cur.execute(
                f"DELETE FROM `tb_localizacao_{c}` WHERE entregador_id=%s AND criado_em >= (NOW() - INTERVAL 5 MINUTE)",
                (ctx["entregador_id"],),
            )
            conn.commit()
        finally:
            cur.close()
    return {"sucesso": True, "mensagem": "Logout registrado"}


@router.get("/perfil", status_code=200)
def perfil(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    ctx = _get_driver_ctx(creds)
    from app.routes.mobile_auth import obter_entregador_por_id
    entregador = obter_entregador_por_id(ctx["cnpj"], ctx["entregador_id"])
    if not entregador:
        raise HTTPException(status_code=404, detail="Entregador não encontrado")
    return {"sucesso": True, "entregador": entregador}