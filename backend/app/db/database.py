# Conexão com banco de dados MySQL (multi-tenant por CNPJ)

import os
import threading
from contextlib import contextmanager
from typing import Any

import mysql.connector
from mysql.connector import pooling

from app.config import settings

_lock = threading.Lock()
_pool = None


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = pooling.MySQLConnectionPool(
                    pool_name="dashboard_pool",
                    pool_size=min(int(os.getenv("DB_POOL_SIZE", "10")), 32),
                    pool_reset_session=True,
                    host=settings.db_host,
                    user=settings.db_user,
                    password=settings.db_password,
                    database=settings.db_name,
                    port=settings.db_port,
                )
    return _pool


def obter_conexao():
    return _get_pool().get_connection()


@contextmanager
def connection(database: str | None = None):
    conn = mysql.connector.connect(
        host=settings.db_host,
        port=settings.db_port,
        database=database or settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
    )
    try:
        yield conn
    finally:
        conn.close()


def execute_query(sql: str, params: tuple = (), dictionary: bool = False) -> list[dict[str, Any]]:
    """Executa uma consulta SELECT e retorna linhas."""
    with connection() as conn:
        cursor = conn.cursor(dictionary=dictionary)
        try:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return rows or []
        finally:
            cursor.close()


def execute_write(sql: str, params: tuple = ()) -> int:
    """Executa INSERT/UPDATE/DELETE e retorna rowcount."""
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(sql, params)
            conn.commit()
            return cursor.rowcount
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()


def get_all_tables() -> list[dict]:
    """Lista todas as tabelas do banco (multi-tenant)."""
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT
                FROM information_schema.tables
                WHERE table_schema = %s
                ORDER BY TABLE_NAME
                """,
                (settings.db_name,),
            )
            return cursor.fetchall() or []
        finally:
            cursor.close()


def list_cnpjs() -> list[str]:
    """Extrai os CNPJs únicos a partir das tabelas padronizadas (tb_pedidos_<cnpj>)."""
    tables = get_all_tables()
    cnpjs = set()
    for t in tables:
        name = t.get("TABLE_NAME") or ""
        if name.startswith("tb_pedidos_"):
            cnpj = name[len("tb_pedidos_"):]
            cnpjs.add(cnpj)
    return sorted(cnpjs)
