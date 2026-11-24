# Configuração do Dashboard JBFER

import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "Dashboard JBFER"
    version: str = "1.0.0"
    debug: bool = False

    # Banco de dados MySQL (mesmo do chatbot - multi-tenant por CNPJ)
    # Suporta DB_HOST (IP/host) ou DB_SERVERNAME (nome do serviço EazyPanel)
    db_host: str = os.getenv("DB_HOST", os.getenv("DB_SERVERNAME", "127.0.0.1"))
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_user: str = os.getenv("DB_USER", "root")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_name: str = os.getenv("DB_NAME", "jbfer_chat_bot")

    # Segurança
    secret_key: str = os.getenv("SECRET_KEY", "jbfer-dashboard-secret-key-2026")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

    # CORS
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
