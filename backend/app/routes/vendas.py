# Rotas de vendas e pedidos

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional

from app.auth.dependencies import get_current_cnpj
from app.services import entrega_service, vendas_service

router = APIRouter(prefix="/api/vendas", tags=["Vendas"])

# Status que só existem quando há uma entrega (e, portanto, um entregador) vinculada ao pedido
STATUS_DEPENDENTES_DE_ENTREGA = {"aceita", "em_transito", "entregue", "cancelada"}


def _status_exige_entrega(pedido_id: int, cnpj: str, status: str):
    """Bloqueia status de ciclo de entrega quando o pedido não tem entrega/entregador vinculado."""
    if status not in STATUS_DEPENDENTES_DE_ENTREGA:
        return
    vinculo = entrega_service.obter_entrega_por_pedido(cnpj, pedido_id)
    if not vinculo:
        raise HTTPException(
            status_code=400,
            detail='Status "em transito" (ou outro de entrega) exige que a venda esteja atribuída a um entregador.',
        )


class PedidoUpdate(BaseModel):
    nome: Optional[str] = None
    produto: Optional[str] = None
    whatsapp: Optional[str] = None
    endereco: Optional[str] = None
    cep: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    pagamento: Optional[str] = None
    valor: Optional[float] = None
    status: Optional[str] = None


@router.get("/kpisdash", status_code=status.HTTP_200_OK)
def get_kpis(dias: int = Query(30, ge=1, le=365), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": vendas_service.get_kpis(cnpj, dias)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter KPIs: {str(e)}")


@router.get("/pedidos", status_code=status.HTTP_200_OK)
def get_pedidos(limite: int = Query(100, ge=1, le=1000), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "total": len(vendas_service.listar_pedidos(cnpj, limite)), "dados": vendas_service.listar_pedidos(cnpj, limite)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter pedidos: {str(e)}")


@router.get("/pedidos/geo", status_code=status.HTTP_200_OK)
def get_pedidos_geo(limite: int = Query(100, ge=1, le=1000), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        dados = vendas_service.listar_pedidos_geolocalizados(cnpj, limite)
        return {"sucesso": True, "cnpj": cnpj, "total": len(dados), "dados": dados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao geolocalizar pedidos: {str(e)}")


@router.get("/pedidos/{pedido_id}", status_code=status.HTTP_200_OK)
def get_pedido(pedido_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        pedido = vendas_service.obter_pedido(cnpj, pedido_id)
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")
        return {"sucesso": True, "dados": pedido}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter pedido: {str(e)}")


@router.get("/pedidos/{pedido_id}/geo", status_code=status.HTTP_200_OK)
def get_pedido_geo(pedido_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        pedido = vendas_service.geolocalizar_pedido(cnpj, pedido_id)
        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")
        return {"sucesso": True, "dados": pedido}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao geolocalizar pedido: {str(e)}")


@router.put("/pedidos/{pedido_id}", status_code=status.HTTP_200_OK)
def update_pedido(pedido_id: int, payload: PedidoUpdate, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        campos = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not campos:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
        if "status" in campos:
            _status_exige_entrega(pedido_id, cnpj, campos["status"])
        ok = vendas_service.atualizar_pedido(cnpj, pedido_id, campos)
        if not ok:
            raise HTTPException(status_code=404, detail="Pedido não encontrado")
        return {"sucesso": True, "mensagem": "Pedido atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar pedido: {str(e)}")


@router.get("/vendas-dia", status_code=status.HTTP_200_OK)
def get_vendas_por_dia(dias: int = Query(30, ge=1, le=365), user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": vendas_service.get_vendas_por_dia(cnpj, dias)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter vendas do dia: {str(e)}")


@router.get("/metodos-pagamento", status_code=status.HTTP_200_OK)
def get_metodos_pagamento(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": vendas_service.get_metodos_pagamento(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter métodos de pagamento: {str(e)}")


@router.post("/pedidos/{pedido_id}/status", status_code=status.HTTP_200_OK)
def update_pedido_status(pedido_id: int, status_pedido: str, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        _status_exige_entrega(pedido_id, cnpj, status_pedido)
        ok = vendas_service.movimentar_pedido_status(cnpj, pedido_id, status_pedido)
        if not ok:
            raise HTTPException(status_code=404, detail="Pedido não encontrado ou status não alterado")
        return {"sucesso": True, "mensagem": "Status atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar status: {str(e)}")
