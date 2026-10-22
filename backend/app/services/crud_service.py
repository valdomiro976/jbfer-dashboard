# Motor genérico de CRUD por tabela dinâmica do cliente (tb_<tabela>_<cnpj>)
# Tabelas suportadas e os campos default sensíveis de exibição/edição.

import re
from datetime import datetime, timedelta

from app.db.database import connection, execute_query

# tabela_rota -> (nome_fisico, rótulo humano)
TABELAS = {
    "chaves_pix": ("tb_chaves_pix", "Chaves PIX"),
    "clientes": ("tb_clientes", "Clientes"),
    "config": ("tb_config", "Configurações"),
    "formas_pgtos": ("tb_formas_pgtos", "Formas de Pagamento"),
    "pedidos": ("tb_pedidos", "Pedidos"),
    "redir": ("tb_redir", "Redirecionamentos"),
}

# campos que não devem ser editados/manipulados pelo CRUD
CAMPOS_PROTEGIDOS = {"id"}
# por tabela: campos extras protegidos (além de id)
CAMPOS_PROTEGIDOS_POR_TABELA = {
    "chaves_pix": {"tipo"},
}
CAMPOS_TIMESTAMP = {"criado_em", "created_at", "updated_at"}

# colunas do tipo text/longtext -> textarea no frontend
TEXTAREA = {"text", "mediumtext", "longtext", "tinytext"}

# colunas booleanas (tinyint(1)) já detectadas pelo schema


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _tabela_fisica(cnpj: str, rota: str) -> str:
    if rota not in TABELAS:
        raise ValueError(f"Tabela '{rota}' não permitida")
    nome, _ = TABELAS[rota]
    return f"{nome}_{_cnpj_limpo(cnpj)}"


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


def _columns(tabela: str) -> list[dict]:
    """Retorna metadados das colunas da tabela (SHOW COLUMNS)."""
    rows = execute_query(f"SHOW COLUMNS FROM `{tabela}`", dictionary=True)
    return rows or []


def _eh_bool(col: dict) -> bool:
    t = (col.get("Type") or "").lower()
    return t.startswith("tinyint") and t.endswith("(1)")


def _tipo_coluna(col: dict) -> str:
    t = (col.get("Type") or "").lower()
    if t.startswith("tinyint") and t.endswith("(1)"):
        return "bool"
    if t.startswith(("varchar", "char")):
        return "text"
    if t.startswith("int"):
        return "int"
    if t.startswith(("decimal", "float", "double")) or t in ("decimal", "float"):
        return "number"
    if t.startswith(("text", "longtext", "mediumtext", "tinytext")):
        return "textarea"
    if t.startswith(("timestamp", "datetime")):
        return "datetime"
    if t.startswith("date"):
        return "date"
    if t.startswith("time"):
        return "time"
    return "text"


def _serializar(v, col: dict, tipo_campo: str):
    if v is None:
        return None
    try:
        if tipo_campo == "bool":
            return bool(int(v))
        if tipo_campo in ("datetime", "date"):
            if isinstance(v, datetime):
                return v.isoformat()
            return str(v)
        if tipo_campo == "time":
            if isinstance(v, timedelta):
                total = int(v.total_seconds())
                h, rem = divmod(total, 3600)
                m = rem // 60
                return f"{h:02d}:{m:02d}"
            if isinstance(v, datetime):
                return v.strftime("%H:%M")
            return str(v)
        if tipo_campo == "number":
            try:
                return float(v)
            except (TypeError, ValueError):
                return v
        if tipo_campo == "int":
            return int(v)
    except Exception:
        pass
    return v


def _deserializar(v, tipo_campo: str):
    """Converte valor do frontend para o formato para gravar no banco."""
    if v is None:
        return None
    if tipo_campo == "bool":
        return 1 if v else 0
    if tipo_campo == "int":
        if isinstance(v, str) and v.strip() == "":
            return None
        try:
            return int(str(v).strip())
        except (TypeError, ValueError):
            return None
    if tipo_campo == "number":
        if isinstance(v, str) and v.strip() == "":
            return None
        try:
            return float(str(v).replace(",", "."))
        except (TypeError, ValueError):
            return None
    if tipo_campo == "blank_as_null":
        if isinstance(v, str) and v.strip() == "":
            return None
    return v


def metadados(cnpj: str) -> list[dict]:
    """Metadados de todas as tabelas permitidas (para gerar a UI)."""
    resultado = []
    for rota, (nome, rotulo) in TABELAS.items():
        tabela = f"{nome}_{_cnpj_limpo(cnpj)}"
        if not _tabela_existe(tabela):
            resultado.append({"rota": rota, "nome": nome, "rotulo": rotulo, "existe": False, "colunas": []})
            continue
        cols = _columns(tabela)
        camposs = []
        for c in cols:
            campo = c.get("Field")
            tipo = _tipo_coluna(c)
            protegido = campo in CAMPOS_PROTEGIDOS or campo in CAMPOS_PROTEGIDOS_POR_TABELA.get(rota, set())
            legend = ""
            if rota == "chaves_pix" and campo == "tipo":
                legend = "Somente leitura — preenchido automaticamente pelo sistema (email, cpf, cnpj, telefone, aleatoria)"
            camposs.append({
                "field": campo,
                "type": tipo,
                "bool": _eh_bool(c),
                "null": (c.get("Null") or "YES") == "YES",
                "default": c.get("Default"),
                "key": c.get("Key") or "",
                "extra": c.get("Extra") or "",
                "protegido": protegido,
                "readonly": protegido,
                "legend": legend,
                "timestamp": campo in CAMPOS_TIMESTAMP,
                "textarea": tipo in TEXTAREA,
            })
        resultado.append({
            "rota": rota,
            "nome": nome,
            "rotulo": rotulo,
            "existe": True,
            "colunas": camposs,
        })
    return resultado


def listar(cnpj: str, rota: str, limite: int = 500) -> dict:
    """Lista registros + metadados da tabela. Retorna None-ish se tabela não existe."""
    tabela = _tabela_fisica(cnpj, rota)
    if not _tabela_existe(tabela):
        return {"existe": False, "colunas": [], "dados": []}
    cols = _columns(tabela)
    meta = []
    for c in cols:
        campo = c.get("Field")
        protegido = campo in CAMPOS_PROTEGIDOS or campo in CAMPOS_PROTEGIDOS_POR_TABELA.get(rota, set())
        legend = ""
        if rota == "chaves_pix" and campo == "tipo":
            legend = "Somente leitura — preenchido automaticamente pelo sistema (email, cpf, cnpj, telefone, aleatoria)"
        meta.append({
            "field": campo,
            "type": _tipo_coluna(c),
            "bool": _eh_bool(c),
            "null": (c.get("Null") or "YES") == "YES",
            "protegido": protegido,
            "readonly": protegido,
            "legend": legend,
            "timestamp": campo in CAMPOS_TIMESTAMP,
            "textarea": (c.get("Type") or "").lower() in TEXTAREA,
        })
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"SELECT * FROM `{tabela}` ORDER BY `id` DESC LIMIT {int(limite)}"
            )
            rows = cursor.fetchall() or []
        finally:
            cursor.close()
    dados = []
    for r in rows:
        linha = {}
        for m in meta:
            linha[m["field"]] = _serializar(r.get(m["field"]), {}, m["type"])
        dados.append(linha)
    return {"existe": True, "colunas": meta, "dados": dados}


def obter(cnpj: str, rota: str, rid: int) -> dict | None:
    tabela = _tabela_fisica(cnpj, rota)
    if not _tabela_existe(tabela):
        return None
    cols = _columns(tabela)
    meta = [{
        "field": c.get("Field"),
        "type": _tipo_coluna(c),
    } for c in cols]
    rows = execute_query(
        f"SELECT * FROM `{tabela}` WHERE id=%s", (rid,), dictionary=True
    )
    if not rows:
        return None
    r = rows[0]
    return {
        m["field"]: _serializar(r.get(m["field"]), {}, m["type"])
        for m in meta
    }


def _campos_editaveis(colunas: list[dict], rota: str = "") -> list[dict]:
    protegidos = set(CAMPOS_PROTEGIDOS)
    protegidos.update(CAMPOS_PROTEGIDOS_POR_TABELA.get(rota, set()))
    return [
        c for c in colunas
        if c.get("Field") not in protegidos and not c.get("timestamp")
    ]


def criar(cnpj: str, rota: str, dados: dict) -> dict:
    tabela = _tabela_fisica(cnpj, rota)
    if not _tabela_existe(tabela):
        raise ValueError(f"Tabela '{rota}' não existe para este CNPJ")
    cols = _columns(tabela)
    editaveis = _campos_editaveis(cols, rota)
    campos = []
    valores = []
    for c in editaveis:
        campo = c.get("Field")
        tipo = _tipo_coluna(c)
        if campo not in dados:
            continue
        campos.append(f"`{campo}`")
        if tipo in TEXTAREA:
            valores.append(dados.get(campo) or None)
        else:
            valores.append(_deserializar(dados.get(campo), tipo))
    if not campos:
        raise ValueError("Nenhum campo fornecido para inserção")
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"INSERT INTO `{tabela}` ({', '.join(campos)}) VALUES ({', '.join(['%s'] * len(campos))})",
                valores,
            )
            conn.commit()
            novo_id = cursor.lastrowid
        finally:
            cursor.close()
    return obter(cnpj, rota, novo_id) or {"id": novo_id}


def _registro_existe(tabela: str, rid: int) -> bool:
    # CRIADO EM: 14/10/2026 - salvar sem alteracao dava 404 (rowcount 0):
    # distingue "nao existe" de "nada mudou".
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT 1 FROM `{tabela}` WHERE id=%s LIMIT 1", (rid,))
            return cursor.fetchone() is not None
        finally:
            cursor.close()


def atualizar(cnpj: str, rota: str, rid: int, dados: dict) -> bool:
    tabela = _tabela_fisica(cnpj, rota)
    if not _tabela_existe(tabela):
        raise ValueError(f"Tabela '{rota}' não existe para este CNPJ")
    cols = _columns(tabela)
    editaveis = _campos_editaveis(cols, rota)
    sets = []
    valores = []
    for c in editaveis:
        campo = c.get("Field")
        tipo = _tipo_coluna(c)
        if campo not in dados:
            continue
        sets.append(f"`{campo}`=%s")
        valores.append(_deserializar(dados.get(campo), tipo))
    if not sets:
        return _registro_existe(tabela, rid)
    valores.append(rid)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `{tabela}` SET {', '.join(sets)} WHERE id=%s",
                valores,
            )
            conn.commit()
            if cursor.rowcount > 0:
                return True
            return _registro_existe(tabela, rid)
        finally:
            cursor.close()


def remover(cnpj: str, rota: str, rid: int) -> bool:
    tabela = _tabela_fisica(cnpj, rota)
    if not _tabela_existe(tabela):
        return False
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"DELETE FROM `{tabela}` WHERE id=%s", (rid,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()