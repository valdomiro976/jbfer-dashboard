# Rotas de produtos (CRUD na tabela tb_prod_<cnpj>)

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import get_current_cnpj
from app.services import produto_service

router = APIRouter(prefix="/api/produtos", tags=["Produtos"])


class ProdutoModel(BaseModel):
    nome: str
    preco: Optional[float] = 0
    estoque: Optional[int] = 0
    categoria_id: Optional[int] = None
    ativo: Optional[bool] = True
    unidade: Optional[str] = ""


@router.get("", status_code=status.HTTP_200_OK)
def get_produtos(ativos: bool = False, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        return {"sucesso": True, "cnpj": cnpj, "dados": produto_service.listar_produtos(cnpj, somente_ativos=ativos)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter produtos: {str(e)}")


@router.get("/{produto_id}", status_code=status.HTTP_200_OK)
def get_produto(produto_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        produto = produto_service.obter_produto(cnpj, produto_id)
        if not produto:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        return {"sucesso": True, "dados": produto}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter produto: {str(e)}")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_produto(payload: ProdutoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        resultado = produto_service.criar_produto(
            cnpj,
            nome=payload.nome.strip(),
            preco=payload.preco or 0,
            estoque=payload.estoque or 0,
            categoria_id=payload.categoria_id,
            ativo=True if payload.ativo is None else payload.ativo,
            unidade=(payload.unidade or "").strip(),
        )
        return {"sucesso": True, "dados": resultado}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao criar produto: {str(e)}")


@router.put("/{produto_id}", status_code=status.HTTP_200_OK)
def update_produto(produto_id: int, payload: ProdutoModel, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = produto_service.atualizar_produto(
            cnpj,
            produto_id,
            payload.model_dump(),
        )
        if not ok:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        return {"sucesso": True, "mensagem": "Produto atualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar produto: {str(e)}")


@router.delete("/{produto_id}", status_code=status.HTTP_200_OK)
def delete_produto(produto_id: int, user: dict = Depends(get_current_cnpj)):
    cnpj = user["cnpj"]
    try:
        ok = produto_service.remover_produto(cnpj, produto_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        return {"sucesso": True, "mensagem": "Produto removido"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover produto: {str(e)}")