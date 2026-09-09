# Serviço de usuários (login via CNPJ + senha)
# Cria tabela tb_dashboard_usuarios no mesmo MySQL do chatbot.

from datetime import datetime

from app.db.database import connection


def _garantir_tabela_usuarios() -> None:
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS `tb_dashboard_usuarios` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    cnpj VARCHAR(20) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255) DEFAULT '',
                    email VARCHAR(255) DEFAULT '',
                    role VARCHAR(50) DEFAULT 'cliente',
                    ativo TINYINT(1) NOT NULL DEFAULT 1,
                    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
        finally:
            cursor.close()


def get_user_by_cnpj(cnpj: str) -> dict | None:
    _garantir_tabela_usuarios()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "SELECT id, cnpj, password_hash, name, email, role, ativo FROM tb_dashboard_usuarios WHERE cnpj=%s",
                (cnpj,),
            )
            row = cursor.fetchone()
            return row
        finally:
            cursor.close()


def create_user(cnpj: str, password_hash: str, name: str = "", email: str = "", role: str = "cliente") -> dict:
    _garantir_tabela_usuarios()
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute(
                "INSERT INTO tb_dashboard_usuarios (cnpj, password_hash, name, email, role, ativo) VALUES (%s, %s, %s, %s, %s, 1)",
                (cnpj, password_hash, name, email, role),
            )
            conn.commit()
            return {"id": cursor.lastrowid, "cnpj": cnpj, "name": name, "role": role, "ativo": True}
        finally:
            cursor.close()


def update_user(cnpj: str, **fields) -> bool:
    _garantir_tabela_usuarios()
    if not fields:
        return False

    allowed = {"password_hash", "name", "email", "role", "ativo"}
    sets = []
    params = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=%s")
            params.append(v)
    if not sets:
        return False

    params.append(cnpj)
    with connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(f"UPDATE tb_dashboard_usuarios SET {', '.join(sets)}, atualizado_em=NOW() WHERE cnpj=%s", params)
            conn.commit()
            return cursor.rowcount > 0
        finally:
            cursor.close()
