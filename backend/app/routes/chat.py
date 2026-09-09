# Rotas de conversas WhatsApp

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import get_current_cnpj
from app.services import chat_service

router = APIRouter(prefix="/api/chat", tags=["Chat WhatsApp"])


@router.get("/conversas", status_code=status.HTTP_200_OK)
def get_conversas(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        conversas = chat_service.listar_conversas(cnpj)
        return {"sucesso": True, "cnpj": cnpj, "total": len(conversas), "dados": conversas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter conversas: {str(e)}")


@router.get("/conversas/{numero}", status_code=status.HTTP_200_OK)
def get_mensagens(numero: str, limite: int = Query(200, ge=1, le=1000), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        mensagens = chat_service.obter_mensagens(cnpj, numero, limite)
        return {"sucesso": True, "cnpj": cnpj, "numero": numero, "total": len(mensagens), "dados": mensagens}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter mensagens: {str(e)}")


@router.get("/buscar", status_code=status.HTTP_200_OK)
def buscar_mensagens(termo: str = Query(..., min_length=1), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        resultados = chat_service.buscar_conversas(cnpj, termo)
        return {"sucesso": True, "cnpj": cnpj, "total": len(resultados), "dados": resultados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar mensagens: {str(e)}")


@router.delete("/conversas/{numero}", status_code=status.HTTP_200_OK)
def excluir_mensagens(numero: str, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        apagadas = chat_service.remover_mensagens(cnpj, numero)
        return {"sucesso": True, "cnpj": cnpj, "numero": numero, "removidas": apagadas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao excluir mensagens: {str(e)}")
