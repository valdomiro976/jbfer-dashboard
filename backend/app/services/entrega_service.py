# Serviço de entregas e rastreamento de entregadores
# Tabelas: tb_entregadores_<cnpj>, tb_entregas_<cnpj>, tb_localizacao_<cnpj>

import re
from datetime import datetime
from typing import Any, Optional

import math

import requests

from app.db.database import connection, execute_query

# Reutiliza a geocodificação do módulo de vendas (Nominatim + cache)
from app.services.vendas_service import _montar_query, geocodificar


def _cnpj_limpo(cnpj: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]", "", cnpj)


def _garantir_tabelas(cnpj: str) -> None:
    c = _cnpj_limpo(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            # Entregadores
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_entregadores_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nome VARCHAR(255) NOT NULL,
                    telefone VARCHAR(50) DEFAULT '',
                    email VARCHAR(255) DEFAULT '',
                    senha VARCHAR(255) DEFAULT '',
                    ativo TINYINT(1) NOT NULL DEFAULT 1,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Entregas
            cursor.execute(
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
            conn.commit()
        finally:
            cursor.close()


def listar_entregadores(cnpj: str) -> list[dict]:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(f"SELECT * FROM `tb_entregadores_{c}` ORDER BY nome")
            return cursor.fetchall() or []
        finally:
            cursor.close()


def criar_entregador(cnpj: str, nome: str, telefone: str = "", senha: str = "") -> dict:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"INSERT INTO `tb_entregadores_{c}` (nome, telefone, senha) VALUES (%s, %s, %s)",
                (nome, telefone, senha),
            )
            conn.commit()
            return {"id": cursor.lastrowid, "nome": nome, "telefone": telefone}
        finally:
            cursor.close()


def atualizar_entregador(cnpj: str, entregador_id: int, **fields) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    allowed = {"nome", "telefone", "email", "senha", "ativo"}
    sets = []
    params = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=%s")
            params.append(v)
    if not sets:
        return False
    params.append(entregador_id)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                f"UPDATE `tb_entregadores_{c}` SET {', '.join(sets)} WHERE id=%s",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def remover_entregador(cnpj: str, entregador_id: int) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"DELETE FROM `tb_entregadores_{c}` WHERE id=%s", (entregador_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def listar_entregas(cnpj: str, status: str | None = None) -> list[dict]:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            if status:
                cursor.execute(
                    f"SELECT * FROM `tb_entregas_{c}` WHERE status=%s ORDER BY criado_em DESC",
                    (status,),
                )
            else:
                cursor.execute(
                    f"SELECT * FROM `tb_entregas_{c}` ORDER BY criado_em DESC LIMIT 200"
                )
            rows = cursor.fetchall() or []
            result = []
            for r in rows:
                for campo in ("criado_em", "aceito_em", "coletado_em", "entregue_em", "cancelado_em"):
                    if r.get(campo):
                        try:
                            r[campo] = r[campo].isoformat()
                        except Exception:
                            pass
                result.append(r)
            return result
        finally:
            cursor.close()


def criar_entrega(cnpj: str, dados: dict) -> dict:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"""
                INSERT INTO `tb_entregas_{c}`
                (entregador_id, pedido_id, pedido_descricao, cliente_nome, cliente_endereco,
                 cliente_cidade, cliente_uf, cliente_cep, valor_total, entregador_nome)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    dados.get("entregador_id"),
                    dados.get("pedido_id"),
                    dados.get("pedido_descricao", ""),
                    dados.get("cliente_nome", ""),
                    dados.get("cliente_endereco", ""),
                    dados.get("cliente_cidade", ""),
                    dados.get("cliente_uf", ""),
                    dados.get("cliente_cep", ""),
                    dados.get("valor_total", 0),
                    dados.get("entregador_nome", ""),
                ),
            )
            conn.commit()
            return {"id": cursor.lastrowid, **dados, "status": "pendente"}
        finally:
            cursor.close()


def obter_entrega_por_pedido(cnpj: str, pedido_id: int) -> dict | None:
    """Retorna a entrega (mais recente, não cancelada) vinculada a um pedido de venda."""
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                f"SELECT * FROM `tb_entregas_{c}` WHERE pedido_id=%s ORDER BY criado_em DESC LIMIT 5",
                (pedido_id,),
            )
            rows = cursor.fetchall() or []
        finally:
            cursor.close()
    for r in rows:
        # Prefere a entrega ainda ativa; senão, a mais recente
        if r.get("status") not in ("cancelada",):
            entrega = r
            break
    else:
        entrega = rows[0] if rows else None
    if not entrega:
        return None
    for campo in ("criado_em", "aceito_em", "coletado_em", "entregue_em", "cancelado_em"):
        if entrega.get(campo):
            try:
                entrega[campo] = entrega[campo].isoformat()
            except Exception:
                pass
    return {"entrega": entrega, "entregador_id": entrega.get("entregador_id"), "entregador_nome": entrega.get("entregador_nome")}


def atualizar_status_entrega(cnpj: str, entrega_id: int, status: str) -> bool:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    campo_data = {
        "aceita": "aceito_em",
        "em_transito": "coletado_em",
        "entregue": "entregue_em",
        "cancelada": "cancelado_em",
    }.get(status)

    with connection() as conn:
        cursor = conn.cursor()
        try:
            if campo_data:
                cursor.execute(
                    f"UPDATE `tb_entregas_{c}` SET status=%s, {campo_data}=NOW() WHERE id=%s",
                    (status, entrega_id),
                )
            else:
                cursor.execute(
                    f"UPDATE `tb_entregas_{c}` SET status=%s WHERE id=%s",
                    (status, entrega_id),
                )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()


def salvar_localizacao(cnpj: str, entregador_id: int, lat: float, lng: float) -> dict:
    """Salva a localização atual de um entregador (tabela de rastreamento)."""
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            # Cria tabela de localização se não existir
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS `tb_localizacao_{c}` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    entregador_id INT NOT NULL,
                    lat DECIMAL(10,7) NOT NULL,
                    lng DECIMAL(10,7) NOT NULL,
                    precisao DECIMAL(8,2) DEFAULT NULL,
                    velocidade DECIMAL(8,2) DEFAULT NULL,
                    criado_em DATETIME NOT NULL,
                    INDEX idx_entregador (entregador_id)
                )
                """
            )
            now = datetime.now()
            cursor.execute(
                f"INSERT INTO `tb_localizacao_{c}` (entregador_id, lat, lng, precisao, velocidade, criado_em) VALUES (%s, %s, %s, %s, %s, %s)",
                (entregador_id, lat, lng, None, None, now),
            )
            conn.commit()
            return {"entregador_id": entregador_id, "lat": lat, "lng": lng, "criado_em": now.isoformat()}
        finally:
            cursor.close()


def obter_ultima_localizacao(cnpj: str, entregador_id: int) -> dict | None:
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT * FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = %s
                """,
                (f"tb_localizacao_{c}",),
            )
            if not cursor.fetchone():
                return None
            cursor.execute(
                f"SELECT * FROM `tb_localizacao_{c}` WHERE entregador_id=%s ORDER BY id DESC LIMIT 1",
                (entregador_id,),
            )
            r = cursor.fetchone()
            if r:
                try:
                    if r.get("criado_em"):
                        r["criado_em"] = r["criado_em"].isoformat()
                except Exception:
                    pass
            return r
        finally:
            cursor.close()


def listar_localizacoes(cnpj: str) -> list[dict]:
    """Retorna a última localização de cada entregador."""

    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    entregadores = listar_entregadores(cnpj)
    result = []
    for e in entregadores:
        loc = obter_ultima_localizacao(cnpj, e["id"])
        result.append({
            "entregador": e,
            "localizacao": loc,
        })
    return result


def _geolocalizar_destino(endereco: str, cidade: str, uf: str, cep: str) -> dict | None:
    """Geolocaliza um endereço de cliente a partir dos dados da entrega."""
    if not endereco:
        return None
    query = _montar_query({"endereco": endereco, "cidade": cidade, "uf": uf, "cep": cep})
    if not query:
        return None
    return geocodificar(query)


def geolocalizar_entrega(cnpj: str, entrega_id: int) -> dict | None:
    """Retorna a localização (lat/lng) do destino de uma entrega específica."""
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    entregas = listar_entregas(cnpj)
    en = next((e for e in entregas if e.get("id") == entrega_id), None)
    if not en:
        return None
    geo = _geolocalizar_destino(
        en.get("cliente_endereco", ""),
        en.get("cliente_cidade", ""),
        en.get("cliente_uf", ""),
        en.get("cliente_cep", ""),
    )
    return {"lat": geo["lat"] if geo else None, "lng": geo["lng"] if geo else None}


OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


def _rota_osrm(origem_lat: float, origem_lng: float, destino_lat: float, destino_lng: float,
               timeout: float = 8.0) -> list[tuple[float, float]] | None:
    """Calcula a rota por estradas usando a API pública do OSRM.
    Retorna lista de pontos [lat, lng] ou None se falhar (caller faz fallback para linha reta)."""
    try:
        # API OSRM espera lng,lat
        coords = f"{origem_lng},{origem_lat};{destino_lng},{destino_lat}"
        url = f"{OSRM_URL}/{coords}?overview=full&geometries=geojson"
        resp = requests.get(url, timeout=timeout, headers={"User-Agent": "JBFER-Dashboard/1.0"})
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return None
        # GeoJSON: coordinates é [[lng, lat], ...]
        coords_geo = data["routes"][0]["geometry"]["coordinates"]
        return [(round(float(c[1]), 6), round(float(c[0]), 6)) for c in coords_geo]
    except Exception:
        return None


def _rota_pontos(origem, destino) -> list[list[float]]:
    """Retorna os pontos da rota (por estradas via OSRM, com fallback para linha reta)."""
    if origem and destino:
        rota = _rota_osrm(origem["lat"], origem["lng"], destino["lat"], destino["lng"])
        if rota:
            return [[lat, lng] for lat, lng in rota]
    # Fallback: linha reta
    return [[origem["lat"], origem["lng"]], [destino["lat"], destino["lng"]]]


def listar_rotas(cnpj: str) -> list[dict]:
    """Retorna as rotas: para cada entregador localizado, as vendas/entregas
    ativas atribuídas a ele, com as coordenadas dos destinos."""
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    entregadores = listar_entregadores(cnpj)
    entregas = listar_entregas(cnpj)  # todas, para associar por entregador

    rotas = []
    for e in entregadores:
        loc = obter_ultima_localizacao(cnpj, e["id"])
        # Entregas ativas (não entregues/canceladas) deste entregador
        entregas_entregador = [
            en for en in entregas
            if en.get("entregador_id") == e["id"]
            and en.get("status") not in ("entregue", "cancelada")
        ]
        destinos = []
        origem = None
        if loc and loc.get("lat") is not None and loc.get("lng") is not None:
            origem = {"lat": float(loc["lat"]), "lng": float(loc["lng"])}
        for en in entregas_entregador:
            geo = _geolocalizar_destino(
                en.get("cliente_endereco", ""),
                en.get("cliente_cidade", ""),
                en.get("cliente_uf", ""),
                en.get("cliente_cep", ""),
            )
            destino = {"lat": geo["lat"] if geo else None, "lng": geo["lng"] if geo else None}
            rota = []
            if origem and destino["lat"] is not None and destino["lng"] is not None:
                rota = _rota_pontos(origem, destino)
            destinos.append({
                "entrega_id": en.get("id"),
                "pedido_id": en.get("pedido_id"),
                "cliente": en.get("cliente_nome") or "Cliente",
                "endereco": en.get("cliente_endereco", ""),
                "cidade": en.get("cliente_cidade", ""),
                "uf": en.get("cliente_uf", ""),
                "produto": en.get("pedido_descricao", ""),
                "valor": en.get("valor_total", 0),
                "status": en.get("status", "pendente"),
                "lat": destino["lat"],
                "lng": destino["lng"],
                "rota": rota,
            })
        rotas.append({
            "entregador": e,
            "localizacao": loc,
            "destinos": destinos,
        })
    return rotas


# ---- Rota otimizada (ordem mais curta de visita) ----
# CRIADO EM: 12/10/2026 - TSP (vizinho mais proximo + 2-opt) sobre destinos
# geolocalizados; geometria por estradas via OSRM (best-effort, cai p/ reta).

def haversine_km(lat1, lng1, lat2, lng2):
    """Distancia em km (linha reta) entre dois pontos. Puro."""
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lng2) - float(lng1))
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def ordenar_paradas(origem, pontos):
    """Ordem de visita (indices em `pontos`) partindo de `origem`.

    Puro (sem I/O): vizinho mais proximo + 2-opt, origem fixa.
    """
    pts = [(float(origem["lat"]), float(origem["lng"]))]
    for p in pontos:
        pts.append((float(p["lat"]), float(p["lng"])))
    n = len(pts)
    if n <= 1:
        return []
    visitado = [False] * n
    ordem = [0]
    visitado[0] = True
    for _ in range(n - 1):
        ult = ordem[-1]
        melhor, melhor_d = -1, None
        for i in range(1, n):
            if visitado[i]:
                continue
            d = haversine_km(pts[ult][0], pts[ult][1], pts[i][0], pts[i][1])
            if melhor_d is None or d < melhor_d:
                melhor, melhor_d = i, d
        ordem.append(melhor)
        visitado[melhor] = True
    def _tot(oo):
        return sum(haversine_km(pts[a][0], pts[a][1], pts[b][0], pts[b][1])
                   for a, b in zip(oo, oo[1:]))
    melhor_d = _tot(ordem)
    mudou = True
    while mudou:
        mudou = False
        for i in range(1, len(ordem) - 1):
            for k in range(i + 1, len(ordem)):
                nova = ordem[:i] + ordem[i:k + 1][::-1] + ordem[k + 1:]
                d = _tot(nova)
                if d < melhor_d - 1e-9:
                    ordem, melhor_d = nova, d
                    mudou = True
    return [i - 1 for i in ordem[1:]]


def otimizar_rota_entregas(cnpj, origem=None, entregador_id=None,
                           entrega_ids=None, voltar_origem=False):
    """Monta a rota otimizada: geolocaliza, ordena e traca por estradas."""
    c = _cnpj_limpo(cnpj)
    _garantir_tabelas(cnpj)
    org = None
    if origem and origem.get("lat") is not None and origem.get("lng") is not None:
        org = {"lat": float(origem["lat"]), "lng": float(origem["lng"])}
    elif entregador_id:
        loc = obter_ultima_localizacao(cnpj, int(entregador_id))
        if loc and loc.get("lat") is not None and loc.get("lng") is not None:
            org = {"lat": float(loc["lat"]), "lng": float(loc["lng"])}
    if not org:
        raise ValueError("origem ou entregador_id com localização são obrigatórios")
    ids = {int(i) for i in (entrega_ids or []) if str(i).isdigit()}
    if not ids:
        raise ValueError("entrega_ids vazios")
    entregas = listar_entregas(cnpj)
    alvos = [e for e in entregas
             if e.get("id") in ids
             and e.get("status") not in ("entregue", "cancelada")]
    if not alvos:
        raise ValueError("nenhuma entrega ativa nos ids informados")
    pts, sem_geo = [], []
    for e in alvos:
        geo = _geolocalizar_destino(
            e.get("cliente_endereco", ""), e.get("cliente_cidade", ""),
            e.get("cliente_uf", ""), e.get("cliente_cep", ""))
        if geo and geo.get("lat") is not None and geo.get("lng") is not None:
            pts.append({"entrega_id": e.get("id"),
                        "cliente": e.get("cliente_nome") or "Cliente",
                        "endereco": e.get("cliente_endereco", ""),
                        "lat": float(geo["lat"]), "lng": float(geo["lng"])})
        else:
            sem_geo.append(e.get("id"))
    if not pts:
        raise ValueError("nenhum destino geolocalizado")
    ordem = ordenar_paradas(org, pts)
    paradas, geometria, total = [], [], 0.0
    ant = org
    for n, idx in enumerate(ordem, 1):
        p = pts[idx]
        d = haversine_km(ant["lat"], ant["lng"], p["lat"], p["lng"])
        total += d
        trecho = _rota_osrm(ant["lat"], ant["lng"], p["lat"], p["lng"],
                            timeout=4.0)
        if trecho:
            if geometria:
                trecho = trecho[1:]
            geometria += [[la, ln] for la, ln in trecho]
        else:
            geometria += [[ant["lat"], ant["lng"]], [p["lat"], p["lng"]]]
        paradas.append({"n": n, "entrega_id": p["entrega_id"],
                        "cliente": p["cliente"], "endereco": p["endereco"],
                        "lat": p["lat"], "lng": p["lng"],
                        "km_etapa": round(d, 2)})
        ant = p
    if voltar_origem and pts:
        d = haversine_km(ant["lat"], ant["lng"], org["lat"], org["lng"])
        total += d
        trecho = _rota_osrm(ant["lat"], ant["lng"], org["lat"], org["lng"],
                            timeout=4.0)
        if trecho:
            geometria += [[la, ln] for la, ln in trecho[1:]]
        else:
            geometria += [[org["lat"], org["lng"]]]
    return {"origem": org, "ordem": paradas,
            "distancia_km": round(total, 2),
            "geometria": geometria,
            "nao_geolocalizadas": sem_geo,
            "voltar_origem": bool(voltar_origem)}
