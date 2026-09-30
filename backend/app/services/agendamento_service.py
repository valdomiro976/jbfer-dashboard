# Serviço de agendamentos de entregas - CRUD na tabela tb_agendamentos_entregas_<cnpj>
# CRIADO EM: 29/09/2026 - gerencia os agendamentos criados pelo chatbot WhatsApp.
# Schema (mesmo do bot): id, whatsapp, nome, pedido_id, produto, endereco, cidade,
# uf, cep, data_entrega (DATE), hora_entrega (VARCHAR), observacoes (TEXT),
# status ('aguardando_entrega' | 'aguardando_data' | 'agendado' | 'imediata' | 'saiu_para_entrega' | 'cancelado' | 'entregue'),
# criado_em, atualizado_em

import re
from datetime import date, datetime

from app.db.database import connection, execute_query

# 29/09/2026 - campos editaveis via CRUD do dashboard
_CAMPOS_EDITAVEIS = {
    "whatsapp": "whatsapp",
    "nome": "nome",
    "pedido_id": "pedido_id",
    "produto": "produto",
    "endereco": "endereco",
    "cidade": "cidade",
    "uf": "uf",
    "cep": "cep",
    "data_entrega": "data_entrega",
    "hora_entrega": "hora_entrega",
    "observacoes": "observacoes",
    "status": "status",
}

# 30/09/2026 - 'saiu_para_entrega' entra na lista: entregador saiu com a mercadoria.
_STATUS_VALIDOS = ("aguardando_entrega", "aguardando_data", "agendado", "imediata", "saiu_para_entrega", "cancelado", "entregue")


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _garantir_tabela(cnpj: str) -> None:
    # 29/09/2026 - cria a tabela de agendamentos caso ainda nao exista (idempotente)
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_agendamentos_entregas_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    whatsapp VARCHAR(50) NOT NULL,
                    nome VARCHAR(255) DEFAULT NULL,
                    pedido_id INT DEFAULT NULL,
                    produto VARCHAR(500) DEFAULT NULL,
                    endereco VARCHAR(500) DEFAULT NULL,
                    cidade VARCHAR(255) DEFAULT NULL,
                    uf VARCHAR(2) DEFAULT NULL,
                    cep VARCHAR(20) DEFAULT NULL,
                    data_entrega DATE DEFAULT NULL,
                    hora_entrega VARCHAR(10) DEFAULT NULL,
                    observacoes TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'aguardando_data',
                    criado_em DATETIME DEFAULT NULL,
                    atualizado_em DATETIME DEFAULT NULL,
                    INDEX idx_whatsapp (whatsapp),
                    INDEX idx_status (status)
                )
                """
            )
            conn.commit()
        finally:
            cursor.close()


def _date_para_db(valor):
    """Converte 'YYYY-MM-DD' ou 'DD/MM/YYYY' do frontend para date (ou None)."""
    if not valor:
        return None
    v = str(valor).strip()
    if not v:
        return None
    try:
        if "/" in v:
            d, m, y = v.split("/")
            return date(int(y), int(m), int(d))
        return date.fromisoformat(v)
    except Exception:
        return None


def _pedido_id_para_db(valor):
    if valor in (None, ""):
        return None
    try:
        return int(valor)
    except Exception:
        return None


def _parserow(r: dict) -> dict:
    # 29/09/2026 - normaliza os valores para consumir no frontend (JSON seguro)
    return {
        "id": r.get("id"),
        "whatsapp": r.get("whatsapp") or "",
        "nome": r.get("nome") or "",
        "pedido_id": r.get("pedido_id"),
        "produto": r.get("produto") or "",
        "endereco": r.get("endereco") or "",
        "cidade": r.get("cidade") or "",
        "uf": r.get("uf") or "",
        "cep": r.get("cep") or "",
        "data_entrega": r.get("data_entrega").isoformat() if r.get("data_entrega") else None,
        "hora_entrega": r.get("hora_entrega") or "",
        "observacoes": r.get("observacoes") or "",
        "status": r.get("status") or "aguardando_data",
        "criado_em": r.get("criado_em").isoformat() if r.get("criado_em") else None,
        "atualizado_em": r.get("atualizado_em").isoformat() if r.get("atualizado_em") else None,
    }


def listar_agendamentos(cnpj: str, status: str | None = None) -> list[dict]:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    if status:
        rows = execute_query(
            f"SELECT * FROM `tb_agendamentos_entregas_{c}` WHERE status=%s ORDER BY id DESC LIMIT 300",
            (status,),
            dictionary=True,
        )
    else:
        rows = execute_query(
            f"SELECT * FROM `tb_agendamentos_entregas_{c}` ORDER BY id DESC LIMIT 300",
            dictionary=True,
        )
    return [_parserow(r) for r in rows]


def obter_agendamento(cnpj: str, agend_id: int) -> dict | None:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    rows = execute_query(
        f"SELECT * FROM `tb_agendamentos_entregas_{c}` WHERE id=%s",
        (agend_id,),
        dictionary=True,
    )
    if not rows:
        return None
    return _parserow(rows[0])


def criar_agendamento(cnpj: str, dados: dict) -> dict:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    agora = datetime.now()
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                INSERT INTO `tb_agendamentos_entregas_{c}`
                (whatsapp, nome, pedido_id, produto, endereco, cidade, uf, cep,
                 data_entrega, hora_entrega, observacoes, status, criado_em, atualizado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    (dados.get("whatsapp") or "").strip(),
                    (dados.get("nome") or "").strip(),
                    _pedido_id_para_db(dados.get("pedido_id")),
                    (dados.get("produto") or "").strip(),
                    (dados.get("endereco") or "").strip(),
                    (dados.get("cidade") or "").strip(),
                    (dados.get("uf") or "").strip()[:2],
                    (dados.get("cep") or "").strip(),
                    _date_para_db(dados.get("data_entrega")),
                    (dados.get("hora_entrega") or "").strip(),
                    (dados.get("observacoes") or "").strip(),
                    (dados.get("status") or "aguardando_data").strip(),
                    agora,
                    agora,
                ),
            )
            conn.commit()
            novo_id = cursor.lastrowid
            return obter_agendamento(cnpj, novo_id)
        finally:
            cursor.close()


def atualizar_agendamento(cnpj: str, agend_id: int, campos: dict) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    sets = []
    params: list = []
    for k, col in _CAMPOS_EDITAVEIS.items():
        if k not in campos:
            continue
        v = campos[k]
        if k == "data_entrega":
            v = _date_para_db(v)
        elif k == "pedido_id":
            v = _pedido_id_para_db(v)
        elif v is None:
            v = ""
        else:
            v = str(v).strip()
            if k == "uf":
                v = v[:2]
        sets.append(f"`{col}`=%s")
        params.append(v)
    if not sets:
        return False
    sets.append("`atualizado_em`=%s")
    params.append(datetime.now())
    params.append(agend_id)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `tb_agendamentos_entregas_{c}` SET {', '.join(sets)} WHERE id=%s",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def mudar_status(cnpj: str, agend_id: int, status: str) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `tb_agendamentos_entregas_{c}` SET status=%s, atualizado_em=%s WHERE id=%s",
                (status, datetime.now(), agend_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def remover_agendamento(cnpj: str, agend_id: int) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"DELETE FROM `tb_agendamentos_entregas_{c}` WHERE id=%s",
                (agend_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()