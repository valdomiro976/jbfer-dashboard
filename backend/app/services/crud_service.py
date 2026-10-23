# Motor genérico de CRUD por tabela dinâmica do cliente (tb_<tabela>_<cnpj>)
# Tabelas suportadas e os campos default sensíveis de exibição/edição.

import re
from datetime import datetime, timedelta

from app.db.database import connection, execute_query

# tabela_rota -> (nome_fisico, rótulo humano)
TABELAS = {
    # Tabelas do sistema principal (PDV/Chatbot)
    "chaves_pix": ("tb_chaves_pix", "Chaves PIX"),
    "clientes": ("tb_clientes", "Clientes (Chatbot)"),
    "config": ("tb_config", "Configurações"),
    "formas_pgtos": ("tb_formas_pgtos", "Formas de Pagamento"),
    "pedidos": ("tb_pedidos", "Pedidos"),
    "redir": ("tb_redir", "Redirecionamentos"),
    "produtos": ("tb_prod", "Produtos (Catálogo)"),
    # Tabelas do Dashboard (Entregas/Entregadores)
    "entregadores": ("tb_entregadores", "Entregadores"),
    "entregas": ("tb_entregas", "Entregas"),
    "clientes_entrega": ("tb_clientes", "Clientes (Entrega)"),
    "localizacao": ("tb_localizacao", "Localização GPS"),
    "agendamentos_entregas": ("tb_agendamentos_entregas", "Agendamentos de Entregas"),
    # Notificações
    "notificacoes": ("tb_notif", "Notificações"),
    "notificacoes_estado": ("tb_notif_estado", "Estado Notificações"),
    # Departamentos/Setores
    "departamentos": ("tb_dpto", "Departamentos/Setores"),
    # Avisos/Agendamentos
    "avisos_pendentes": ("tb_avisos_pendentes", "Avisos Pendentes"),
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


# ============================================================
# Criação automática de tabelas (schemas idênticos aos services)
# ============================================================

def _garantir_tabela(cnpj: str, rota: str) -> None:
    """Cria a tabela se não existir, usando o schema oficial de cada service."""
    c = _cnpj_limpo(cnpj)
    tabela = _tabela_fisica(cnpj, rota)
    if _tabela_existe(tabela):
        return

    schemas = {
        # Tabelas do sistema principal
        "chaves_pix": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chave_pix VARCHAR(200) DEFAULT '',
                tipo VARCHAR(20) DEFAULT '',
                beneficiario VARCHAR(100) DEFAULT '',
                cidade VARCHAR(60) DEFAULT '',
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY ix_chave (chave_pix)
            )
        """,
        "clientes": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        "config": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                `key` VARCHAR(100) NOT NULL,
                `value` TEXT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_key (`key`)
            )
        """,
        "formas_pgtos": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_forma (nome)
            )
        """,
        "pedidos": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                whatsapp VARCHAR(50) NOT NULL,
                produto VARCHAR(500) NOT NULL,
                valor DECIMAL(10,2) NOT NULL DEFAULT 0,
                nome VARCHAR(255) DEFAULT NULL,
                pagamento VARCHAR(100) DEFAULT NULL,
                dados JSON DEFAULT NULL,
                origem VARCHAR(20) DEFAULT 'WHATSAPP',
                operador VARCHAR(100) DEFAULT NULL,
                troco DECIMAL(10,2) DEFAULT NULL,
                chave_pix_usada VARCHAR(200) DEFAULT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """,
        "redir": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                origem VARCHAR(100) NOT NULL,
                destino VARCHAR(500) NOT NULL,
                ativo TINYINT(1) DEFAULT 1,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_origem (origem)
            )
        """,
        "produtos": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        # Tabelas do Dashboard (Entregas/Entregadores)
        "entregadores": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(50) DEFAULT '',
                email VARCHAR(255) DEFAULT '',
                senha VARCHAR(255) DEFAULT '',
                ativo TINYINT(1) NOT NULL DEFAULT 1,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """,
        "entregas": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        "clientes_entrega": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        "localizacao": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entregador_id INT NOT NULL,
                lat DECIMAL(10,7) NOT NULL,
                lng DECIMAL(10,7) NOT NULL,
                precisao DECIMAL(10,2) DEFAULT NULL,
                velocidade DECIMAL(10,2) DEFAULT NULL,
                direcao INT DEFAULT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_entregador (entregador_id),
                INDEX idx_criado_em (criado_em)
            )
        """,
        "agendamentos_entregas": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        "notificacoes": f"""
            CREATE TABLE `{tabela}` (
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
        """,
        "notificacoes_estado": f"""
            CREATE TABLE `{tabela}` (
                id INT PRIMARY KEY,
                ultimo_pedido_id INT NULL,
                ultima_checada DATETIME NULL
            )
        """,
        "departamentos": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                departamento VARCHAR(100) NOT NULL,
                num_whatsapp VARCHAR(20) NULL DEFAULT '',
                nome_contato VARCHAR(100) NULL DEFAULT '',
                expediente_h_inicio TIME NULL,
                expediente_h_final TIME NULL,
                expediente_dia_semana VARCHAR(50) NULL DEFAULT '',
                criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
            )
        """,
        "avisos_pendentes": f"""
            CREATE TABLE `{tabela}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                whatsapp VARCHAR(50) NOT NULL,
                mensagem TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pendente',
                criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                enviado_em DATETIME NULL,
                tentativas INT DEFAULT 0
            )
        """,
    }

    sql = schemas.get(rota)
    if not sql:
        return  # rota não tem schema definido

    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(sql)
            conn.commit()
            # Remove colunas legadas pix_beneficiario / pix_cidade de tb_config_*
            if rota == "config":
                _remover_colunas_pix_legadas_dashboard(conn, tabela)
        finally:
            cursor.close()


def _remover_colunas_pix_legadas_dashboard(conn, nome_tabela):
    """Remove colunas pix_beneficiario e pix_cidade de tb_config_* (legacy).
    Esses dados agora ficam em tb_chaves_pix_* (beneficiario, cidade)."""
    for col in ('pix_beneficiario', 'pix_cidade'):
        try:
            with conn.cursor() as cur:
                cur.execute(f"SHOW COLUMNS FROM `{nome_tabela}` LIKE '{col}'")
                if cur.fetchone():
                    cur.execute(f"ALTER TABLE `{nome_tabela}` DROP COLUMN `{col}`")
                    conn.commit()
        except Exception:
            pass


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
    """Metadados de todas as tabelas permitidas (para gerar a UI).
    Cria a tabela automaticamente se não existir."""
    resultado = []
    for rota, (nome, rotulo) in TABELAS.items():
        # Garante que a tabela exista (cria se necessário)
        _garantir_tabela(cnpj, rota)
        tabela = f"{nome}_{_cnpj_limpo(cnpj)}"
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
    """Lista registros + metadados da tabela. Cria a tabela automaticamente se não existir."""
    _garantir_tabela(cnpj, rota)
    tabela = _tabela_fisica(cnpj, rota)
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
    _garantir_tabela(cnpj, rota)
    tabela = _tabela_fisica(cnpj, rota)
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
    _garantir_tabela(cnpj, rota)
    tabela = _tabela_fisica(cnpj, rota)
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
    _garantir_tabela(cnpj, rota)
    tabela = _tabela_fisica(cnpj, rota)
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
    _garantir_tabela(cnpj, rota)
    tabela = _tabela_fisica(cnpj, rota)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"DELETE FROM `{tabela}` WHERE id=%s", (rid,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()