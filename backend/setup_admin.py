# Script de setup inicial: cria o usuário admin (CNPJ + senha) para acesso ao dashboard
# Uso: python setup_admin.py

from app.auth.security import hash_password
from app.services.user_service import create_user, get_user_by_cnpj

CNPJ = "02408190000136-1"
NOME = "JBFER Distribuidora"
SENHA = "jbfer2026"  # Altere antes de usar em produção!


def main():
    if get_user_by_cnpj(CNPJ):
        print(f"Usuário {CNPJ} já existe. Nada a fazer.")
        return

    create_user(CNPJ, hash_password(SENHA), NOME, role="admin")
    print(f"Usuário admin criado:")
    print(f"  CNPJ: {CNPJ}")
    print(f"  Nome: {NOME}")
    print(f"  Senha: {SENHA}")
    print("Faça login no dashboard com estes dados.")


if __name__ == "__main__":
    main()