# Serviço de histórico de conversas WhatsApp - lê tb_hist_msg_arq_<cnpj>
# ALTERADO EM: 29/09/2026 - passou a ler o ARQUIVO PERMANENTE (append-only).
# O bot apaga o histórico de trabalho (tb_hist_msg_<cnpj>) a cada ociosidade/
# confirmação/SAIR para limpar o contexto da IA; o arquivo nunca é apagado,
# preservando o chat completo no Dashboard.

import re
from typing import Any, Optional

from app.db.database import connection, execute_query


def _tabela(cnpj: str) -> str:
    cnpj_limpo = re.sub(r"[^0-9A-Za-z_-]", "", cnpj)
    return f"tb_hist_msg_arq_{cnpj_limpo}"


def _tabela_clientes(cnpj: str) -> str:
    cnpj_limpo = re.sub(r"[^0-9A-Za-z_-]", "", cnpj)
    return f"tb_clientes_{cnpj_limpo}"


def _tabela_existe(tabela: str) -> bool:
    rows = execute_query(
        """
        SELECT COUNT(*) as qtd FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        """,
        (tabela,),
        dictionary=True,
    )
    return bool(rows and rows[0]["qtd"] > 0)


def _columns(tabela: str) -> set[str]:
    rows = execute_query(
        "SHOW COLUMNS FROM `" + tabela + "`",
        dictionary=True,
    )
    return {r["Field"] for r in rows}


def listar_conversas(cnpj: str) -> list[dict]:
    """Lista as conversas (números únicos) com última mensagem."""
    tabela = _tabela(cnpj)
    if not _tabela_existe(tabela):
        return []

    cols = _columns(tabela)
    order_col = "created_at" if "created_at" in cols else ("timestamp" if "timestamp" in cols else "id")

    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"""
                SELECT numero,
                       COUNT(*) as total_mensagens,
                       MAX(`{order_col}`) as ultima_atividade
                FROM `{tabela}`
                GROUP BY numero
                ORDER BY ultima_atividade DESC
                LIMIT 200
                """
            )
            conversas = cursor.fetchall() or []

            nomes = {}
            tb_cli = _tabela_clientes(cnpj)
            if _tabela_existe(tb_cli):
                try:
                    cur2 = conn.cursor(dictionary=True)
                    try:
                        cur2.execute(f"SELECT whatsapp, nome FROM `{tb_cli}`")
                        for r in (cur2.fetchall() or []):
                            nomes[str(r.get("whatsapp") or "")] = r.get("nome") or ""
                    finally:
                        cur2.close()
                except Exception:
                    nomes = {}

            result = []
            for c in conversas:
                numero = str(c.get("numero") or "")
                try:
                    if c.get("ultima_atividade"):
                        c["ultima_atividade"] = c["ultima_atividade"].isoformat()
                except Exception:
                    pass
                result.append({
                    "numero": numero,
                    "nome": nomes.get(numero, "") or "Desconhecido",
                    "total_mensagens": c.get("total_mensagens", 0),
                    "ultima_atividade": c.get("ultima_atividade"),
                })
            return result
        finally:
            cursor.close()


def obter_mensagens(cnpj: str, numero: str, limite: int = 200) -> list[dict]:
    """Retorna o histórico de mensagens de uma conversa."""
    tabela = _tabela(cnpj)
    if not _tabela_existe(tabela):
        return []

    cols = _columns(tabela)
    order_col = "created_at" if "created_at" in cols else ("timestamp" if "timestamp" in cols else "id")

    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"""
                SELECT * FROM `{tabela}`
                WHERE numero=%s
                ORDER BY `{order_col}` ASC
                LIMIT %s
                """,
                (numero, limite),
            )
            rows = cursor.fetchall() or []
            result = []
            for r in rows:
                for campo in ("created_at", "timestamp", "criado_em", "data", "dt"):
                    if campo in r and r[campo]:
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
                result.append(r)
            return result
        finally:
            cursor.close()


def remover_mensagens(cnpj: str, numero: str) -> int:
    """Remove todas as mensagens de uma conversa (número). Retorna qtde apagada."""
    tabela = _tabela(cnpj)
    if not _tabela_existe(tabela):
        return 0
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"DELETE FROM `{tabela}` WHERE numero=%s",
                (numero,),
            )
            conn.commit()
            return cursor.rowcount
        finally:
            cursor.close()


def buscar_conversas(cnpj: str, termo: str, limite: int = 50) -> list[dict]:
    """Busca mensagens que contenham um termo."""
    tabela = _tabela(cnpj)
    if not _tabela_existe(tabela):
        return []

    cols = _columns(tabela)
    ordem_col = "created_at" if "created_at" in cols else ("timestamp" if "timestamp" in cols else "id")
    texto_col = "mensagem" if "mensagem" in cols else ("texto" if "texto" in cols else "mensagem")

    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"""
                SELECT * FROM `{tabela}`
                WHERE `{texto_col}` LIKE %s
                ORDER BY `{ordem_col}` DESC
                LIMIT %s
                """,
                (f"%{termo}%", limite),
            )
            rows = cursor.fetchall() or []
            result = []
            for r in rows:
                for campo in ("created_at", "timestamp", "criado_em", "data", "dt"):
                    if campo in r and r[campo]:
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
                result.append(r)
            return result
        finally:
            cursor.close()