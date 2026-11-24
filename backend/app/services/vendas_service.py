# Serviço de vendas e pedidos - lê as tabelas tb_pedidos_<cnpj> do chatbot

import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Optional

import requests

from app.db.database import connection, list_cnpjs

logger = logging.getLogger("vendas.service")


def _tabela_pedidos(cnpj: str) -> str:
    cnpj_limpo = re.sub(r"[^0-9A-Za-z_-]", "", cnpj)
    return f"tb_pedidos_{cnpj_limpo}"


def _garantir_tabela(cnpj: str) -> bool:
    """Verifica se a tabela de pedidos do CNPJ existe."""
    from app.db.database import execute_query
    rows = execute_query(
        """
        SELECT COUNT(*) as qtd FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        """,
        (_tabela_pedidos(cnpj),),
        dictionary=True,
    )
    return bool(rows and rows[0]["qtd"] > 0)


def _parse_valor(valor) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def listar_pedidos(cnpj: str, limite: int = 100) -> list[dict]:
    """Lista os pedidos mais recentes de um CNPJ."""
    if not _garantir_tabela(cnpj):
        return []
    table = _tabela_pedidos(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"SELECT * FROM `{table}` ORDER BY criado_em DESC, id DESC LIMIT %s",
                (limite,),
            )
            rows = cursor.fetchall() or []
            result = []
            for r in rows:
                r["valor"] = _parse_valor(r.get("valor"))
                r["processado"] = bool(r.get("processado", 0))
                try:
                    if r.get("criado_em"):
                        r["criado_em"] = r["criado_em"].isoformat()
                except Exception:
                    pass
                result.append(r)
            return result
        finally:
            cursor.close()


def obter_pedido(cnpj: str, pedido_id: int) -> dict | None:
    if not _garantir_tabela(cnpj):
        return None
    table = _tabela_pedidos(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(f"SELECT * FROM `{table}` WHERE id=%s", (pedido_id,))
            r = cursor.fetchone()
            if r:
                r["valor"] = _parse_valor(r.get("valor"))
                try:
                    if r.get("criado_em"):
                        r["criado_em"] = r["criado_em"].isoformat()
                except Exception:
                    pass
            return r
        finally:
            cursor.close()


def get_kpis(cnpj: str, dias: int = 30) -> dict:
    """Retorna KPIs de vendas para o dashboard."""
    pedidos = listar_pedidos(cnpj, limite=10000)
    if not pedidos:
        return {"total_pedidos": 0, "receita_total": 0, "ticket_medio": 0, "pedidos_dia": 0, "top_produtos": []}

    total_pedidos = len(pedidos)
    receita = sum(p.get("valor", 0) for p in pedidos)
    ticket_medio = receita / total_pedidos if total_pedidos else 0

    # Pedidos nos últimos 'dias'
    agora = datetime.now()
    corte = agora - timedelta(days=dias)
    pedidos_recentes = []
    for p in pedidos:
        criado = None
        try:
            criado = datetime.fromisoformat(p.get("criado_em") or "")
        except (ValueError, TypeError):
            criado = None
        if criado is not None and criado >= corte:
            pedidos_recentes.append(p)

    # Contagem de produtos por nome
    produtos = {}
    for p in pedidos:
        nome = (p.get("produto") or "").strip()
        if not nome:
            continue
        qtd = 1
        dados = p.get("dados") or "[]"
        try:
            dados_list = json.loads(dados) if isinstance(dados, str) else dados
            for d in dados_list:
                if isinstance(d, dict) and d.get("campo") == "quantidade":
                    try:
                        qtd = int(float(str(d.get("valor", 1)).replace(",", ".").strip()))
                    except (TypeError, ValueError):
                        qtd = 1
        except (json.JSONDecodeError, TypeError):
            pass
        produtos[nome] = {
            "nome": nome,
            "quantidade": produtos.get(nome, {}).get("quantidade", 0) + qtd,
            "receita": produtos.get(nome, {}).get("receita", 0) + p.get("valor", 0),
        }

    top_produtos = sorted(produtos.values(), key=lambda x: x["quantidade"], reverse=True)[:10]

    return {
        "total_pedidos": total_pedidos,
        "receita_total": round(receita, 2),
        "ticket_medio": round(ticket_medio, 2),
        "pedidos_periodo": len(pedidos_recentes),
        "top_produtos": top_produtos,
    }


def get_vendas_por_dia(cnpj: str, dias: int = 30) -> list[dict]:
    """Vendas agrupadas por dia para o gráfico."""
    pedidos = listar_pedidos(cnpj, limite=10000)
    agora = datetime.now()
    corte = agora - timedelta(days=dias)
    dias_map: dict[str, dict] = {}

    for p in pedidos:
        try:
            criado = datetime.fromisoformat(p.get("criado_em") or "")
        except (ValueError, TypeError):
            continue
        if criado < corte:
            continue
        dia = criado.strftime("%Y-%m-%d")
        if dia not in dias_map:
            dias_map[dia] = {"data": dia, "pedidos": 0, "receita": 0.0}
        dias_map[dia]["pedidos"] += 1
        dias_map[dia]["receita"] += p.get("valor", 0)

    # Preenche todos os dias do período
    result = []
    for i in range(dias, -1, -1):
        d = (agora - timedelta(days=i)).strftime("%Y-%m-%d")
        if d in dias_map:
            dias_map[d]["receita"] = round(dias_map[d]["receita"], 2)
            result.append(dias_map[d])
        else:
            result.append({"data": d, "pedidos": 0, "receita": 0.0})

    return result


def get_metodos_pagamento(cnpj: str) -> list[dict]:
    """Distribuição de métodos de pagamento."""
    pedidos = listar_pedidos(cnpj, limite=10000)
    metodos: dict[str, dict] = {}

    for p in pedidos:
        pagamento = (p.get("pagamento") or "Não informado").strip()
        if not pagamento:
            pagamento = "Não informado"
        if pagamento not in metodos:
            metodos[pagamento] = {"metodo": pagamento, "quantidade": 0, "receita": 0.0}
        metodos[pagamento]["quantidade"] += 1
        metodos[pagamento]["receita"] += p.get("valor", 0)

    for m in metodos.values():
        m["receita"] = round(m["receita"], 2)

    return sorted(metodos.values(), key=lambda x: x["quantidade"], reverse=True)


def movimentar_pedido_status(cnpj: str, pedido_id: int, status: str) -> bool:
    """Atualiza o status de processado/entrega de um pedido."""
    if not _garantir_tabela(cnpj):
        return False
    table = _tabela_pedidos(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            # Adiciona coluna status se não existir
            cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE 'status'")
            if not cursor.fetchone():
                cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN status VARCHAR(50) DEFAULT 'pendente'")
            cursor.execute(
                f"UPDATE `{table}` SET status=%s, processado=1 WHERE id=%s",
                (status, pedido_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


# Campos editáveis de um pedido (evita SQL injection em UPDATE dinâmico)
_CAMPOS_EDITAVEIS_PEDIDO = {
    "produto", "nome", "whatsapp", "endereco", "cep", "cidade", "uf",
    "pagamento", "valor", "status",
}


def atualizar_pedido(cnpj: str, pedido_id: int, campos: dict) -> bool:
    """Atualiza campos editáveis de um pedido. Retorna True se alterou algo."""
    if not _garantir_tabela(cnpj):
        return False
    table = _tabela_pedidos(cnpj)
    permitidos = {k: v for k, v in campos.items() if k in _CAMPOS_EDITAVEIS_PEDIDO and v is not None}
    if not permitidos:
        return False

    sets = []
    params: list = []
    for k, v in permitidos.items():
        sets.append(f"`{k}`=%s")
        params.append(v)
    sets.append("processado=1")
    params.append(pedido_id)

    with connection() as conn:
        cursor = conn.cursor()
        try:
            # Garante a coluna status (algumas tabelas antigas não têm)
            cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE 'status'")
            if not cursor.fetchone():
                cursor.execute(f"ALTER TABLE `{table}` ADD COLUMN status VARCHAR(50) DEFAULT 'pendente'")
            cursor.execute(
                f"UPDATE `{table}` SET {', '.join(sets)} WHERE id=%s",
                params,
            )
            conn.commit()
            if cursor.rowcount > 0:
                return True
            cursor.execute(f"SELECT 1 FROM `{table}` WHERE id=%s LIMIT 1", (pedido_id,))
            return cursor.fetchone() is not None
        finally:
            cursor.close()


# ---------------------------------------------------------------
# Geocodificação das vendas (via Nominatim/OpenStreetMap)
# ---------------------------------------------------------------

_GEO_CACHE: dict[str, dict | None] = {}
_GEO_CACHE_TTL = 24 * 3600  # 24h
_GEO_LOCK = threading.Lock()
# Cache persistente em disco (sobrevive a reinícios do backend)
_GEO_CACHE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "geo_cache.json")
# Para respeitar a política de uso do Nominatim: máx ~1 requisição/segundo
_NOMINATIM_MIN_INTERVAL = 1.0
_LAST_GEO_CALL = 0.0

GEO_USER_AGENT = "JBFER-Dashboard/1.0 (admin@jbfer.com.br)"


def _carregar_cache_geo():
    """Carrega o cache persistente de geocodificação do disco."""
    global _GEO_CACHE
    try:
        path = os.path.abspath(_GEO_CACHE_FILE)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                _GEO_CACHE = json.load(f)
    except Exception as e:
        logger.warning("Não foi possível carregar o cache geo: %s", e)


def _salvar_cache_geo():
    """Persiste o cache de geocodificação no disco."""
    try:
        path = os.path.abspath(_GEO_CACHE_FILE)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(_GEO_CACHE, f, ensure_ascii=False)
    except Exception as e:
        logger.warning("Não foi possível salvar o cache geo: %s", e)


_carregar_cache_geo()


def _limpar_endereco(endereco: str) -> str:
    """Remove espaços duplicados e normaliza para geocodificação."""
    return " ".join(str(endereco).split()).strip()


def _montar_query(pedido: dict) -> str:
    """Monta a query de geocodificação com o endereço e, se houver, cidade/UF."""
    end = _limpar_endereco(pedido.get("endereco", ""))
    if not end:
        return ""
    cidade = _limpar_endereco(pedido.get("cidade", "") or "")
    uf = _limpar_endereco(pedido.get("uf", "") or "")
    if cidade and uf:
        return f"{end}, {cidade}, {uf}, Brasil"
    if cidade:
        return f"{end}, {cidade}, Brasil"
    cep = _limpar_endereco(pedido.get("cep", "") or "")
    if cep:
        return f"{end}, CEP {cep}, Brasil"
    return f"{end}, Brasil"


def geocodificar(endereco_query: str) -> dict | None:
    """Consulta o Nominatim (OpenStreetMap) e retorna {lat, lng} ou None."""
    global _LAST_GEO_CALL
    if not endereco_query:
        return None

    norm = " ".join(endereco_query.split()).lower()
    with _GEO_LOCK:
        now = time.time()
        if norm in _GEO_CACHE:
            val = _GEO_CACHE[norm]
            if val is not None and now - _GEO_CACHE.get(f"ts_{norm}", 0) < _GEO_CACHE_TTL:
                return dict(val)
            if val is None and now - _GEO_CACHE.get(f"ts_{norm}", 0) < 600:
                return None

        # Rate limit do Nominatim
        intervalo = now - _LAST_GEO_CALL
        if intervalo < _NOMINATIM_MIN_INTERVAL:
            time.sleep(_NOMINATIM_MIN_INTERVAL - intervalo)

        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": endereco_query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "br",
                },
                headers={"User-Agent": GEO_USER_AGENT},
                timeout=10,
            )
            _LAST_GEO_CALL = time.time()
            data = r.json() if r.status_code == 200 else []
            if data:
                item = data[0]
                res = {
                    "lat": float(item.get("lat")),
                    "lng": float(item.get("lon")),
                    "display_name": item.get("display_name", ""),
                }
                _GEO_CACHE[norm] = res
                _GEO_CACHE[f"ts_{norm}"] = time.time()
                _salvar_cache_geo()
                return dict(res)
            _GEO_CACHE[norm] = None
            _GEO_CACHE[f"ts_{norm}"] = time.time()
            _salvar_cache_geo()
            return None
        except Exception as e:
            logger.warning("Erro ao geocodificar '%s': %s", endereco_query, e)
            return None


def listar_pedidos_geolocalizados(cnpj: str, limite: int = 100) -> list[dict]:
    """Retorna vendas com coordenadas reais obtidas por geocodificação do endereço."""
    pedidos = listar_pedidos(cnpj, limite=limite)
    resultado = []
    for p in pedidos:
        end = _limpar_endereco(p.get("endereco", ""))
        if not end:
            continue
        query = _montar_query(p)
        geo = geocodificar(query) if query else None
        resultado.append({
            "id": p.get("id"),
            "cliente": p.get("nome") or "Cliente",
            "endereco": end,
            "cep": p.get("cep"),
            "cidade": p.get("cidade"),
            "uf": p.get("uf"),
            "produto": p.get("produto"),
            "valor": p.get("valor"),
            "status": p.get("status", "pendente"),
            "criado_em": p.get("criado_em"),
            "lat": geo["lat"] if geo else None,
            "lng": geo["lng"] if geo else None,
            "endereco_geo": geo["display_name"] if geo else None,
        })
    return resultado


def geolocalizar_pedido(cnpj: str, pedido_id: int) -> dict | None:
    """Geolocaliza um pedido específico (para exibir no mapa do modal)."""
    pedido = obter_pedido(cnpj, pedido_id)
    if not pedido:
        return None
    end = _limpar_endereco(pedido.get("endereco", ""))
    query = _montar_query(pedido) if end else ""
    geo = geocodificar(query) if query else None
    return {
        **pedido,
        "cliente": pedido.get("nome") or "Cliente",
        "lat": geo["lat"] if geo else None,
        "lng": geo["lng"] if geo else None,
        "endereco_geo": geo["display_name"] if geo else None,
    }
