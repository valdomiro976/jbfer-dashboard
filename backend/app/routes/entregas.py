# Rotas de entregas e rastreamento

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.auth.dependencies import get_current_cnpj
from app.services import entrega_service

router = APIRouter(prefix="/api/entregas", tags=["Entregas e Rastreamento"])


class EntregadorModel(BaseModel):
    nome: str
    telefone: str = ""
    email: str = ""
    senha: str = ""


class EntregaModel(BaseModel):
    entregador_id: Optional[int] = None
    pedido_id: Optional[int] = None
    pedido_descricao: str = ""
    cliente_nome: str = ""
    cliente_endereco: str = ""
    cliente_cidade: str = ""
    cliente_uf: str = ""
    cliente_cep: str = ""
    valor_total: float = 0
    entregador_nome: str = ""


class LocalizacaoModel(BaseModel):
    entregador_id: int
    lat: float
    lng: float


# ---- Entregadores ----

@router.get("/entregadores", status_code=status.HTTP_200_OK)
def get_entregadores(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": entrega_service.listar_entregadores(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter entregadores: {str(e)}")


@router.get("/pedido/{pedido_id}/vinculo", status_code=status.HTTP_200_OK)
def get_vinculo_pedido(pedido_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        vinculo = entrega_service.obter_entrega_por_pedido(cnpj, pedido_id)
        return {"sucesso": True, "dados": vinculo}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter vínculo do pedido: {str(e)}")


@router.post("/entregadores", status_code=status.HTTP_201_CREATED)
def create_entregador(payload: EntregadorModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        print("criando entregador", cnpj, payload)
        resultado = entrega_service.criar_entregador(cnpj, payload.nome, payload.telefone, payload.senha)
        return {"sucesso": True, "dados": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar entregador: {str(e)}")


@router.put("/entregadores/{entregador_id}", status_code=status.HTTP_200_OK)
def update_entregador(entregador_id: int, payload: EntregadorModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = entrega_service.atualizar_entregador(
            cnpj, entregador_id,
            nome=payload.nome, telefone=payload.telefone,
            email=payload.email, senha=payload.senha,
        )
        if not ok:
            raise HTTPException(status_code=404, detail="Entregador não encontrado")
        return {"sucesso": True, "mensagem": "Entregador atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar entregador: {str(e)}")


@router.delete("/entregadores/{entregador_id}", status_code=status.HTTP_200_OK)
def delete_entregador(entregador_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = entrega_service.remover_entregador(cnpj, entregador_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Entregador não encontrado")
        return {"sucesso": True, "mensagem": "Entregador removido"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover entregador: {str(e)}")


# ---- Entregas ----

@router.get("", status_code=status.HTTP_200_OK)
def get_entregas(status_: str | None = None, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": entrega_service.listar_entregas(cnpj, status_)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter entregas: {str(e)}")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_entrega(payload: EntregaModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        print("criando entrega", cnpj, payload)
        resultado = entrega_service.criar_entrega(cnpj, payload.model_dump())
        return {"sucesso": True, "dados": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar entrega: {str(e)}")


@router.post("/{entrega_id}/status", status_code=status.HTTP_200_OK)
def update_status_entrega(entrega_id: int, status_entrega: str, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = entrega_service.atualizar_status_entrega(cnpj, entrega_id, status_entrega)
        if not ok:
            raise HTTPException(status_code=404, detail="Entrega não encontrada")
        return {"sucesso": True, "mensagem": "Status atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar entrega: {str(e)}")


# ---- Rastreamento ----

@router.post("/localizacao", status_code=status.HTTP_200_OK)
def salvar_localizacao(payload: LocalizacaoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        print("salvando localizacao", cnpj, payload)
        resultado = entrega_service.salvar_localizacao(cnpj, payload.entregador_id, payload.lat, payload.lng)
        return {"sucesso": True, "dados": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar localização: {str(e)}")


@router.get("/localizacoes", status_code=status.HTTP_200_OK)
def get_localizacoes(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": entrega_service.listar_localizacoes(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter localizações: {str(e)}")


@router.get("/rotas", status_code=status.HTTP_200_OK)
def get_rotas(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": entrega_service.listar_rotas(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter rotas: {str(e)}")


@router.get("/localizacao/{entregador_id}", status_code=status.HTTP_200_OK)
def get_localizacao(entregador_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        loc = entrega_service.obter_ultima_localizacao(cnpj, entregador_id)
        return {"sucesso": True, "dados": loc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter localização: {str(e)}")


@router.get("/{entrega_id}/geo", status_code=status.HTTP_200_OK)
def get_geo_entrega(entrega_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        geo = entrega_service.geolocalizar_entrega(cnpj, entrega_id)
        if geo is None:
            raise HTTPException(status_code=404, detail="Entrega não encontrada")
        return {"sucesso": True, "dados": geo}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao geolocalizar entrega: {str(e)}")


class OrigemRotaModel(BaseModel):
    lat: float
    lng: float


class RotaOtimizadaModel(BaseModel):
    origem: Optional[OrigemRotaModel] = None
    entregador_id: Optional[int] = None
    entrega_ids: list[int] = []
    voltar_origem: bool = False


# CRIADO EM: 12/10/2026 - ordem mais curta de visita (loja/entregador -> N
# entregas), com geometria por estradas p/ o mapa.
@router.post("/rota-otimizada", status_code=status.HTTP_200_OK)
def post_rota_otimizada(payload: RotaOtimizadaModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        dados = entrega_service.otimizar_rota_entregas(
            cnpj,
            origem=payload.origem.model_dump() if payload.origem else None,
            entregador_id=payload.entregador_id,
            entrega_ids=payload.entrega_ids,
            voltar_origem=payload.voltar_origem)
        return {"sucesso": True, "cnpj": cnpj, "dados": dados}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao otimizar rota: {str(e)}")
