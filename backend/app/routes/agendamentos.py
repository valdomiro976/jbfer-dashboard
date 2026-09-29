# Rotas de agendamentos de entregas (CRUD na tabela tb_agendamentos_entregas_<cnpj>)
# CRIADO EM: 29/09/2026 - gerencia os agendamentos de entrega criados pelo chatbot

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_cnpj
from app.services import agendamento_service

router = APIRouter(prefix="/api/agendamentos", tags=["Agendamentos"])


class AgendamentoModel(BaseModel):
    # 29/09/2026 - campos do agendamento (data_entrega em 'YYYY-MM-DD' ou 'DD/MM/YYYY')
    whatsapp: Optional[str] = ""
    nome: Optional[str] = ""
    pedido_id: Optional[int] = None
    produto: Optional[str] = ""
    endereco: Optional[str] = ""
    cidade: Optional[str] = ""
    uf: Optional[str] = ""
    cep: Optional[str] = ""
    data_entrega: Optional[str] = None
    hora_entrega: Optional[str] = ""
    observacoes: Optional[str] = ""
    status: Optional[str] = "aguardando_data"


@router.get("", status_code=status.HTTP_200_OK)
def get_agendamentos(status_ag: str = "", user: dict = Depends(get_current_cnpj)):
    # 29/09/2026 - lista com filtro opcional por status
    cnpj = user["cnpj"]
    try:
        dados = agendamento_service.listar_agendamentos(cnpj, status_ag or None)
        return {"sucesso": True, "cnpj": cnpj, "dados": dados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter agendamentos: {str(e)}")


@router.get("/{agend_id}", status_code=status.HTTP_200_OK)
def get_agendamento(agend_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        item = agendamento_service.obter_agendamento(cnpj, agend_id)
        if not item:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return {"sucesso": True, "dados": item}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter agendamento: {str(e)}")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_agendamento(payload: AgendamentoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        if not (payload.whatsapp or "").strip():
            raise HTTPException(status_code=422, detail="O WhatsApp é obrigatório")
        resultado = agendamento_service.criar_agendamento(cnpj, payload.model_dump())
        return {"sucesso": True, "dados": resultado}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar agendamento: {str(e)}")


@router.put("/{agend_id}", status_code=status.HTTP_200_OK)
def update_agendamento(agend_id: int, payload: AgendamentoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = agendamento_service.atualizar_agendamento(cnpj, agend_id, payload.model_dump(exclude_unset=True))
        if not ok:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return {"sucesso": True, "mensagem": "Agendamento atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar agendamento: {str(e)}")


@router.post("/{agend_id}/status", status_code=status.HTTP_200_OK)
def update_status_agendamento(agend_id: int, status_ag: str, user: dict = Depends(get_current_cnpj)):
    # 29/09/2026 - troca rapida de status (agendado/imediata/cancelado etc.)
    cnpj = user["cnpj"]
    if status_ag not in agendamento_service._STATUS_VALIDOS:
        raise HTTPException(status_code=422, detail="Status inválido")
    try:
        ok = agendamento_service.mudar_status(cnpj, agend_id, status_ag)
        if not ok:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return {"sucesso": True, "mensagem": "Status atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar status: {str(e)}")


@router.delete("/{agend_id}", status_code=status.HTTP_200_OK)
def delete_agendamento(agend_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = agendamento_service.remover_agendamento(cnpj, agend_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return {"sucesso": True, "mensagem": "Agendamento removido"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover agendamento: {str(e)}")