# Rotas genéricas de CRUD para tabelas dinâmicas do cliente (tb_<tabela>_<cnpj>)

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_cnpj
from app.services import crud_service

router = APIRouter(prefix="/api/cruds", tags=["CRUD Genérico"])


class PayloadModel(BaseModel):
    dados: dict[str, Any]


@router.get("/tabelas", status_code=status.HTTP_200_OK)
def get_tabelas(user: dict = Depends(get_current_cnpj)):
    """Metadados das tabelas permitidas (para gerar a UI)."""
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": crud_service.metadados(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter tabelas: {str(e)}")


@router.get("/{tabela}", status_code=status.HTTP_200_OK)
def listar(tabela: str, limite: int = Query(500, ge=1, le=2000), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        result = crud_service.listar(cnpj, tabela, limite)
        if not result.get("existe"):
            raise HTTPException(status_code=404, detail=f"Tabela '{tabela}' não encontrada")
        return {"sucesso": True, "cnpj": cnpj, "total": len(result["dados"]), **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar '{tabela}': {str(e)}")


@router.get("/{tabela}/{rid}", status_code=status.HTTP_200_OK)
def obter(tabela: str, rid: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        resultado = crud_service.obter(cnpj, tabela, rid)
        if resultado is None:
            raise HTTPException(status_code=404, detail="Registro não encontrado")
        return {"sucesso": True, "dados": resultado}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter registro: {str(e)}")


@router.post("/{tabela}", status_code=status.HTTP_201_CREATED)
def criar(tabela: str, payload: PayloadModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        resultado = crud_service.criar(cnpj, tabela, payload.dados)
        return {"sucesso": True, "dados": resultado}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar registro: {str(e)}")


@router.put("/{tabela}/{rid}", status_code=status.HTTP_200_OK)
def atualizar(tabela: str, rid: int, payload: PayloadModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = crud_service.atualizar(cnpj, tabela, rid, payload.dados)
        if not ok:
            raise HTTPException(status_code=404, detail="Registro não encontrado")
        return {"sucesso": True, "mensagem": "Registro atualizado"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar registro: {str(e)}")


@router.delete("/{tabela}/{rid}", status_code=status.HTTP_200_OK)
def remover(tabela: str, rid: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = crud_service.remover(cnpj, tabela, rid)
        if not ok:
            raise HTTPException(status_code=404, detail="Registro não encontrado")
        return {"sucesso": True, "mensagem": "Registro removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover registro: {str(e)}")