# Serviço de produtos - CRUD na tabela tb_prod_<cnpj>
# Schema existente: CodigoDoProduto, NomeDoProduto, CodigoDaCategoria,
# QuantidadePorUnidade, PrecoUnitario, UnidadesEmEstoque, ATIVO, NCM,
# Unidade, PrecoEspecial, texto_busca, atributos_json, origem_id, atualizado_em

import re
from datetime import datetime

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
                CREATE TABLE IF NOT EXISTS `tb_prod_{c}` (
                    CodigoDoProduto INT AUTO_INCREMENT PRIMARY KEY,
                    NomeDoProduto VARCHAR(150) NULL,
                    CodigoDaCategoria INT NULL,
                    QuantidadePorUnidade VARCHAR(25) NULL,
                    PrecoUnitario DECIMAL(19,4) NULL,
                    UnidadesEmEstoque INT NULL DEFAULT 0,
                    ATIVO TINYINT(1) NULL DEFAULT 1,
                    NCM VARCHAR(255) NULL,
                    Unidade VARCHAR(255) NULL,
                    PrecoEspecial DECIMAL(19,4) NULL,
                    texto_busca TEXT NULL,
                    atributos_json JSON NULL,
                    origem_id VARCHAR(100) NULL,
                    atualizado_em DATETIME NULL
                )
                """
            )
            conn.commit()
        finally:
            cursor.close()


def _parserow(r: dict) -> dict:
    try:
        preco = float(r.get("PrecoUnitario") or 0)
    except (TypeError, ValueError):
        preco = 0
    try:
        estoque = int(r.get("UnidadesEmEstoque") or 0)
    except (TypeError, ValueError):
        estoque = 0
    try:
        categoria_id = int(r.get("CodigoDaCategoria")) if r.get("CodigoDaCategoria") is not None else None
    except (TypeError, ValueError):
        categoria_id = None
    return {
        "id": r.get("CodigoDoProduto"),
        "nome": r.get("NomeDoProduto") or "",
        "categoria_id": categoria_id,
        "preco": preco,
        "estoque": estoque,
        "ativo": bool(r.get("ATIVO")),
        "unidade": r.get("Unidade") or "",
        "ncm": r.get("NCM") or "",
        "preco_especial": r.get("PrecoEspecial"),
        "texto_busca": r.get("texto_busca") or "",
    }


def listar_produtos(cnpj: str, somente_ativos: bool = False) -> list[dict]:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    sql = f"SELECT * FROM `tb_prod_{c}`"
    if somente_ativos:
        sql += " WHERE ATIVO = 1"
    sql += " ORDER BY NomeDoProduto"
    rows = execute_query(sql, dictionary=True)
    return [_parserow(r) for r in rows]


def obter_produto(cnpj: str, produto_id: int) -> dict | None:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    rows = execute_query(
        f"SELECT * FROM `tb_prod_{c}` WHERE CodigoDoProduto=%s",
        (produto_id,),
        dictionary=True,
    )
    if not rows:
        return None
    return _parserow(rows[0])


def criar_produto(
    cnpj: str,
    nome: str,
    preco: float = 0,
    estoque: int = 0,
    categoria_id: int | None = None,
    ativo: bool = True,
    unidade: str = "",
    texto_busca: str = "",
) -> dict:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    agora = datetime.now()
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT COALESCE(MAX(CodigoDoProduto), 0) + 1 AS next_id FROM `tb_prod_{c}`")
            next_id = int(cursor.fetchone()[0])
            cursor.execute(
                f"""
                INSERT INTO `tb_prod_{c}`
                (CodigoDoProduto, NomeDoProduto, CodigoDaCategoria, PrecoUnitario, UnidadesEmEstoque, ATIVO, Unidade, texto_busca, atualizado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    next_id,
                    nome,
                    categoria_id,
                    preco,
                    estoque,
                    1 if ativo else 0,
                    unidade,
                    (texto_busca or "").strip() or nome,
                    agora,
                ),
            )
            conn.commit()
            return {
                "id": next_id,
                "nome": nome,
                "categoria_id": categoria_id,
                "preco": preco,
                "estoque": estoque,
                "ativo": ativo,
                "unidade": unidade,
                "texto_busca": (texto_busca or "").strip() or nome,
            }
        finally:
            cursor.close()


def atualizar_produto(cnpj: str, produto_id: int, campos: dict) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    mapeamento = {
        "nome": "NomeDoProduto",
        "preco": "PrecoUnitario",
        "estoque": "UnidadesEmEstoque",
        "categoria_id": "CodigoDaCategoria",
        "ativo": "ATIVO",
        "unidade": "Unidade",
        "texto_busca": "texto_busca",
    }
    sets = []
    params: list = []
    _nome_novo = None
    _texto_informado = "texto_busca" in campos
    for k, v in campos.items():
        col = mapeamento.get(k)
        if col is None or v is None:
            continue
        if k == "preco":
            v = float(v)
        elif k == "estoque":
            v = int(v)
        elif k == "categoria_id":
            v = int(v) if v != "" else None
        elif k == "ativo":
            v = 1 if v else 0
        elif k in ("nome", "texto_busca"):
            v = str(v).strip()
            if k == "nome":
                _nome_novo = v
        sets.append(f"`{col}`=%s")
        params.append(v)
    if not sets:
        return False
    # Se o nome mudou e o texto_busca NAO foi informado, mantem texto_busca
    # sincronizado com o novo nome (fallback). Se foi informado, prevalece.
    if _nome_novo is not None and not _texto_informado:
        sets.append("texto_busca=%s")
        params.append(_nome_novo)
    sets.append("atualizado_em=%s")
    params.append(datetime.now())
    params.append(produto_id)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `tb_prod_{c}` SET {', '.join(sets)} WHERE CodigoDoProduto=%s",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def remover_produto(cnpj: str, produto_id: int) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabela(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"DELETE FROM `tb_prod_{c}` WHERE CodigoDoProduto=%s",
                (produto_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()