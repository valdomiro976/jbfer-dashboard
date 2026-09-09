# Rotas de setores/departamentos (CRUD na tabela tb_dpto_<cnpj>)

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_cnpj
from app.services import dpto_service

router = APIRouter(prefix="/api/dptos", tags=["Departamentos"])


class DptoModel(BaseModel):
    departamento: str
    num_whatsapp: Optional[str] = ""
    nome_contato: Optional[str] = ""
    expediente_h_inicio: Optional[str] = ""
    expediente_h_final: Optional[str] = ""
    expediente_dia_semana: Optional[str] = ""


@router.get("", status_code=status.HTTP_200_OK)
def get_dptos(user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": dpto_service.listar_dptos(cnpj)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter departamentos: {str(e)}")


@router.get("/{dpto_id}", status_code=status.HTTP_200_OK)
def get_dpto(dpto_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        dpto = dpto_service.obter_dpto(cnpj, dpto_id)
        if not dpto:
            raise HTTPException(status_code=404, detail="Departamento não encontrado")
        return {"sucesso": True, "dados": dpto}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter departamento: {str(e)}")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dpto(payload: DptoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        if not payload.departamento.strip():
            raise HTTPException(status_code=422, detail="O nome do departamento é obrigatório")
        resultado = dpto_service.criar_dpto(cnpj, payload.model_dump())
        return {"sucesso": True, "dados": resultado}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar departamento: {str(e)}")


@router.put("/{dpto_id}", status_code=status.HTTP_200_OK)
def update_dpto(dpto_id: int, payload: DptoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = dpto_service.atualizar_dpto(cnpj, dpto_id, payload.model_dump())
        if not ok:
            raise HTTPException(status_code=404, detail="Departamento não encontrado")
        return {"sucesso": True, "mensagem": "Departamento atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar departamento: {str(e)}")


@router.delete("/{dpto_id}", status_code=status.HTTP_200_OK)
def delete_dpto(dpto_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = dpto_service.remover_dpto(cnpj, dpto_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Departamento não encontrado")
        return {"sucesso": True, "mensagem": "Departamento removido"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover departamento: {str(e)}")