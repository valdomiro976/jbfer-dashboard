# Serviço de setores/departamentos - CRUD na tabela tb_dpto_<cnpj>
# Schema existente: id, departamento, num_whatsapp, nome_contato,
# expediente_h_inicio (TIME), expediente_h_final (TIME),
# expediente_dia_semana, criado_em

import re
from datetime import datetime, timedelta

from app.db.database import connection, execute_query


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _garantir_tabela(cnpj: str) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_dpto_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    departamento VARCHAR(100) NOT NULL,
                    num_whatsapp VARCHAR(20) NULL DEFAULT '',
                    nome_contato VARCHAR(100) NULL DEFAULT '',
                    expediente_h_inicio TIME NULL,
                    expediente_h_final TIME NULL,
                    expediente_dia_semana VARCHAR(50) NULL DEFAULT '',
                    criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
        finally:
            cursor.close()


def _formata_hora(valor) -> str:
    """Converte TIME (datetime.timedelta/None) do MySQL para 'HH:MM'."""
    if valor is None:
        return ""
    if isinstance(valor, timedelta):
        total = int(valor.total_seconds())
        h, rem = divmod(total, 3600)
        m = rem // 60
        return f"{h:02d}:{m:02d}"
    if isinstance(valor, datetime):
        return valor.strftime("%H:%M")
    return str(valor)


def _parserow(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "departamento": r.get("departamento") or "",
        "num_whatsapp": r.get("num_whatsapp") or "",
        "nome_contato": r.get("nome_contato") or "",
        "expediente_h_inicio": _formata_hora(r.get("expediente_h_inicio")),
        "expediente_h_final": _formata_hora(r.get("expediente_h_final")),
        "expediente_dia_semana": r.get("expediente_dia_semana") or "",
        "criado_em": r.get("criado_em").isoformat() if r.get("criado_em") else None,
    }


def _hora_para_db(valor) -> str | None:
    """Converte 'HH:MM' do frontend para string aceita pela coluna TIME."""
    if not valor:
        return None
    v = str(valor).strip()
    if not v:
        return None
    try:
        h, m = v.split(":")
        h = int(h)
        m = int(m)
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        return f"{h:02d}:{m:02d}:00"
    except Exception:
        return None


def listar_dptos(cnpj: str) -> list[dict]:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    rows = execute_query(
        f"SELECT * FROM `tb_dpto_{c}` ORDER BY departamento",
        dictionary=True,
    )
    return [_parserow(r) for r in rows]


def obter_dpto(cnpj: str, dpto_id: int) -> dict | None:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    rows = execute_query(
        f"SELECT * FROM `tb_dpto_{c}` WHERE id=%s",
        (dpto_id,),
        dictionary=True,
    )
    if not rows:
        return None
    return _parserow(rows[0])


def criar_dpto(cnpj: str, dados: dict) -> dict:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    agora = datetime.now()
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                INSERT INTO `tb_dpto_{c}`
                (departamento, num_whatsapp, nome_contato,
                 expediente_h_inicio, expediente_h_final, expediente_dia_semana, criado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    (dados.get("departamento") or "").strip(),
                    (dados.get("num_whatsapp") or "").strip(),
                    (dados.get("nome_contato") or "").strip(),
                    _hora_para_db(dados.get("expediente_h_inicio")),
                    _hora_para_db(dados.get("expediente_h_final")),
                    (dados.get("expediente_dia_semana") or "").strip(),
                    agora,
                ),
            )
            conn.commit()
            novo_id = cursor.lastrowid
            return obter_dpto(cnpj, novo_id)
        finally:
            cursor.close()


def atualizar_dpto(cnpj: str, dpto_id: int, campos: dict) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    mapeamento = {
        "departamento": "departamento",
        "num_whatsapp": "num_whatsapp",
        "nome_contato": "nome_contato",
        "expediente_h_inicio": "expediente_h_inicio",
        "expediente_h_final": "expediente_h_final",
        "expediente_dia_semana": "expediente_dia_semana",
    }
    sets = []
    params: list = []
    for k, col in mapeamento.items():
        if k not in campos:
            continue
        v = campos[k]
        if k in ("expediente_h_inicio", "expediente_h_final"):
            v = _hora_para_db(v)
        elif v is None:
            v = ""
        else:
            v = str(v).strip()
        sets.append(f"`{col}`=%s")
        params.append(v)
    if not sets:
        return False
    params.append(dpto_id)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `tb_dpto_{c}` SET {', '.join(sets)} WHERE id=%s",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def remover_dpto(cnpj: str, dpto_id: int) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"DELETE FROM `tb_dpto_{c}` WHERE id=%s",
                (dpto_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()