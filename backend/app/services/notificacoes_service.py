# Serviço de notificações - tabela tb_notif_<cnpj>
# Detecta eventos derivados dos dados (novas vendas, status de entregas)
# e os persiste para controle de leitura.

import re
from datetime import datetime, timedelta

from app.db.database import connection, execute_query
from app.services import vendas_service, entrega_service


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _parse_dt(valor) -> datetime | None:
    """Converte ISO/string em datetime naive. Retorna None se inválido."""
    if isinstance(valor, datetime):
        if valor.tzinfo is not None:
            return valor.replace(tzinfo=None)
        return valor
    if isinstance(valor, str) and valor:
        for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(valor[:19], fmt[:19])
            except Exception:
                continue
    return None


def _garantir_tabelas(cnpj: str) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_notif_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tipo VARCHAR(20) NOT NULL,
                    evento VARCHAR(30) NOT NULL,
                    titulo VARCHAR(255) NOT NULL,
                    mensagem TEXT NULL,
                    link VARCHAR(255) NULL,
                    ref_tipo VARCHAR(20) NULL,
                    ref_id INT NULL,
                    lida TINYINT(1) NOT NULL DEFAULT 0,
                    criado_em DATETIME NOT NULL,
                    UNIQUE KEY uniq_ref (tipo, evento, ref_tipo, ref_id)
                )
                """
            )
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_notif_estado_{c}` (
                    id INT PRIMARY KEY,
                    ultimo_pedido_id INT NULL,
                    ultima_checada DATETIME NULL
                )
                """
            )
            conn.commit()
        finally:
            cursor.close()


def _ler_estado(cnpj: str) -> dict:
    c = _cnpj_limpo(cnpj)
    rows = execute_query(
        f"SELECT * FROM `tb_notif_estado_{c}` WHERE id=1",
        dictionary=True,
    )
    if not rows:
        return {"ultimo_pedido_id": 0, "ultima_checada": None}
    return {
        "ultimo_pedido_id": rows[0].get("ultimo_pedido_id") or 0,
        "ultima_checada": _parse_dt(rows[0].get("ultima_checada")),
    }


def _salvar_estado(cnpj: str, estado: dict) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                INSERT INTO `tb_notif_estado_{c}` (id, ultimo_pedido_id, ultima_checada)
                VALUES (1, %s, %s)
                ON DUPLICATE KEY UPDATE ultimo_pedido_id=VALUES(ultimo_pedido_id), ultima_checada=VALUES(ultima_checada)
                """,
                (estado.get("ultimo_pedido_id"), estado.get("ultima_checada")),
            )
            conn.commit()
        finally:
            cursor.close()


def _formatar_valor(v) -> str:
    try:
        return f"R$ {float(v or 0):.2f}".replace(".", ",")
    except (TypeError, ValueError):
        return ""


def _nova_notificacao(cnpj: str, tipo: str, evento: str, titulo: str, mensagem: str,
                      link: str, ref_tipo: str, ref_id: int | None, criado_em: datetime) -> None:
    """Insere uma notificação (ignora se já existir para o mesmo evento/ref)."""
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"""
                INSERT IGNORE INTO `tb_notif_{c}`
                (tipo, evento, titulo, mensagem, link, ref_tipo, ref_id, lida, criado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0, %s)
                """,
                (tipo, evento, titulo[:255], mensagem, link, ref_tipo, ref_id, criado_em),
            )
            conn.commit()
        finally:
            cursor.close()


def _gerar_eventos_pedidos(cnpj: str, estado: dict, so_marcar: bool = False) -> int:
    """Cria notificações de novas vendas (pedidos criados após o último marcador)."""
    if not vendas_service._garantir_tabela(cnpj):
        return 0
    table = vendas_service._tabela_pedidos(cnpj)
    ultimo = estado.get("ultimo_pedido_id") or 0
    rows = execute_query(
        f"SELECT id, nome, produto, valor, criado_em FROM `{table}` WHERE id > %s ORDER BY id ASC LIMIT 200",
        (ultimo,),
        dictionary=True,
    )
    if isinstance(rows, list):
        rows = rows or []
    for r in rows:
        if so_marcar:
            continue
        criado = _parse_dt(r.get("criado_em")) or datetime.now()
        nome = r.get("nome") or "Cliente"
        _nova_notificacao(
            cnpj,
            "venda",
            "nova",
            f"Nova venda #{r['id']}",
            f"{nome} — {str(r.get('produto') or 'Pedido')} · {_formatar_valor(r.get('valor'))}",
            f"/vendas?venda={r['id']}",
            "pedido",
            r["id"],
            criado,
        )
    if rows:
        estado["ultimo_pedido_id"] = max(r["id"] for r in rows)
    return len(rows)


def _gerar_eventos_entregas(cnpj: str, estado: dict) -> int:
    """Cria notificações de status de entregas ocorridos após a última checagem."""
    ultima = estado.get("ultima_checada")
    entregas = entrega_service.listar_entregas(cnpj)
    geradas = 0
    for en in entregas:
        status = en.get("status")
        en_id = en.get("id")
        cliente = en.get("cliente_nome") or "Cliente"
        entregador = en.get("entregador_nome") or ""
        produto = en.get("pedido_descricao") or ""
        link = f"/vendas?venda={en.get('pedido_id')}" if en.get("pedido_id") else f"/entregas?entrega={en_id}"

        def _marcador(campo, evento, titulo):
            nonlocal geradas
            if ultima is None:
                return
            valor = _parse_dt(en.get(campo))
            if not valor or valor <= ultima:
                return
            msg = cliente
            if entregador:
                msg += f" · {entregador}"
            if produto:
                msg += f" · {produto}"
            _nova_notificacao(
                cnpj, "entrega", evento, titulo, msg,
                link, "entrega", en_id, valor,
            )
            geradas += 1

        if status == "em_transito":
            _marcador("coletado_em", "em_transito", "Entrega em andamento")
        elif status == "aceita":
            _marcador("aceito_em", "aceita", "Entrega aceita")
        elif status == "entregue":
            _marcador("entregue_em", "entregue", "Entrega entregue")
        elif status == "cancelada":
            _marcador("cancelado_em", "cancelada", "Entrega cancelada")
        elif status == "pendente":
            _marcador("criado_em", "pendente", "Nova entrega pendente")
    return geradas


def sincronizar(cnpj: str) -> None:
    """Descobre e persiste novas notificações desde a última checagem."""
    _garantir_tabelas(cnpj)
    estado = _ler_estado(cnpj)
    primeira = estado.get("ultimo_pedido_id") == 0
    if primeira:
        # Primeira execução: apenas registra os marcadores, sem notificar histórico antigo.
        n = _gerar_eventos_pedidos(cnpj, estado, so_marcar=True)
    else:
        _gerar_eventos_pedidos(cnpj, estado)
        _gerar_eventos_entregas(cnpj, estado)
    estado["ultima_checada"] = datetime.now()
    _salvar_estado(cnpj, estado)


def listar_notificacoes(cnpj: str, somente_nao_lidas: bool = False, limite: int = 100) -> list[dict]:
    _garantir_tabelas(cnpj)
    c = _cnpj_limpo(cnpj)
    sql = f"SELECT * FROM `tb_notif_{c}`"
    if somente_nao_lidas:
        sql += " WHERE lida=0"
    sql += " ORDER BY criado_em DESC, id DESC LIMIT %s"
    rows = execute_query(sql, (limite,), dictionary=True)
    result = []
    for r in rows:
        criado = _parse_dt(r.get("criado_em"))
        if criado:
            r["criado_em"] = criado.isoformat()
        result.append(r)
    return result


def contar_nao_lidas(cnpj: str) -> int:
    _garantir_tabelas(cnpj)
    c = _cnpj_limpo(cnpj)
    rows = execute_query(
        f"SELECT COUNT(*) AS n FROM `tb_notif_{c}` WHERE lida=0",
        dictionary=True,
    )
    return int(rows[0]["n"]) if rows else 0


def marcar_lidas(cnpj: str, ids: list[int] | None = None) -> int:
    _garantir_tabelas(cnpj)
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            if ids:
                fmt = ",".join(["%s"] * len(ids))
                cursor.execute(
                    f"UPDATE `tb_notif_{c}` SET lida=1 WHERE id IN ({fmt})",
                    ids,
                )
            else:
                cursor.execute(f"UPDATE `tb_notif_{c}` SET lida=1 WHERE lida=0")
            conn.commit()
            return cursor.rowcount
        finally:
            cursor.close()


def limpar_notificacoes(cnpj: str, dias: int = 30) -> int:
    """Remove notificações antigas (já lidas) para controlar o crescimento."""
    _garantir_tabelas(cnpj)
    c = _cnpj_limpo(cnpj)
    corte = datetime.now() - timedelta(days=dias)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"DELETE FROM `tb_notif_{c}` WHERE lida=1 AND criado_em < %s",
                (corte,),
            )
            conn.commit()
            return cursor.rowcount
        finally:
            cursor.close()