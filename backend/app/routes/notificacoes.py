# Rotas de notificações

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_cnpj
from app.services import notificacoes_service

router = APIRouter(prefix="/api/notificacoes", tags=["Notificações"])


class MarcarLidasModel(BaseModel):
    ids: list[int] | None = None


@router.get("", status_code=status.HTTP_200_OK)
def get_notificacoes(
    somente_nao_lidas: bool = Query(False),
    limite: int = Query(50, ge=1, le=200),
    sincronizar: bool = Query(True),
    user: dict = Depends(get_current_cnpj),
):
    cnpj = user["cnpj"]
    try:
        if sincronizar:
            notificacoes_service.sincronizar(cnpj)
        nao_lidas = notificacoes_service.contar_nao_lidas(cnpj)
        dados = notificacoes_service.listar_notificacoes(cnpj, somente_nao_lidas, limite)
        return {
            "sucesso": True,
            "cnpj": cnpj,
            "nao_lidas": nao_lidas,
            "total": len(dados),
            "dados": dados,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter notificações: {str(e)}")


@router.patch("/marcar-lidas", status_code=status.HTTP_200_OK)
def marcar_lidas(payload: MarcarLidasModel | None = None, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ids = payload.ids if payload else None
        marcadas = notificacoes_service.marcar_lidas(cnpj, ids)
        return {"sucesso": True, "cnpj": cnpj, "marcadas": marcadas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao marcar notificações como lidas: {str(e)}")


@router.delete("/antigas", status_code=status.HTTP_200_OK)
def limpar_notificacoes(dias: int = Query(30, ge=1, le=365), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        removidas = notificacoes_service.limpar_notificacoes(cnpj, dias)
        return {"sucesso": True, "cnpj": cnpj, "removidas": removidas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao limpar notificações: {str(e)}")