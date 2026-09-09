# Validação de identificador de cliente no formato CNPJ-Counter.
# Formato esperado: 14 dígitos do CNPJ + "-" + counter (0 a 99),
# ex.: 02408190000136-1

import re

# CNPJ (14 dígitos) + "-" + counter (1 ou 2 dígitos, 0..99)
_IDENTIFICADOR = re.compile(r"^(\d{14})-(\d{1,2})$")


def extrair_cnpj_base(identificador: str) -> str | None:
    """Extrai os 14 dígitos do CNPJ de um identificador CNPJ-Counter.

    Valida a estrutura do identificador (números + counter), ignorando o
    counter conforme especificação (CNPJ-Counter, ex.: 02408190000136-1).
    Não valida dígitos verificadores do CNPJ, apenas o formato.
    """
    m = _IDENTIFICADOR.match((identificador or "").strip())
    if not m:
        return None
    cnpj_base = m.group(1)
    if int(m.group(2)) > 99:
        return None
    return cnpj_base


def validar_identificador(identificador: str) -> bool:
    return extrair_cnpj_base(identificador) is not None