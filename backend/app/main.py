# Dashboard JBFER - Backend FastAPI
# Dashboard multi-cliente na nuvem (dados do chatbot em MySQL)

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
load_dotenv(BASE_DIR / ".env", override=True)

from app.config import settings
from app.routes import auth, vendas, chat, entregas, mobile_auth, mobile_driver, produtos, dptos, notificacoes, cruds, agendamentos

app = FastAPI(
    title="Dashboard JBFER API",
    description="API do dashboard multi-cliente para vendas, WhatsApp e entregas",
    version=settings.version,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas
app.include_router(auth.router)
app.include_router(vendas.router)
app.include_router(chat.router)
app.include_router(entregas.router)
app.include_router(produtos.router)
app.include_router(dptos.router)
app.include_router(notificacoes.router)
app.include_router(cruds.router)
app.include_router(agendamentos.router)
app.include_router(mobile_auth.router)
app.include_router(mobile_driver.router)


@app.get("/")
def root():
    if DIST_DIR.is_dir() and (DIST_DIR / "index.html").is_file():
        return FileResponse(str(DIST_DIR / "index.html"))
    return {
        "app": settings.app_name,
        "version": settings.version,
        "status": "online",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}



# ---------------------------------------------------------------
# WebSocket: atualizações em tempo real de entregadores/localização
# ---------------------------------------------------------------
import asyncio
import json as _json


@app.websocket("/ws/entregadores")
async def ws_entregadores(websocket: WebSocket, token: str = ""):
    from app.auth.security import decode_token
    from app.services import entrega_service

    payload = decode_token(token) if token else None
    if not payload:
        await websocket.close(code=4001)
        return
    cnpj = payload.get("cnpj")
    if not cnpj:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    try:
        while True:
            try:
                dados = entrega_service.listar_localizacoes(cnpj)
                await websocket.send_text(_json.dumps({"tipo": "localizacoes", "dados": dados}, default=str))
            except Exception:
                pass
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass


# ---------------------------------------------------------------
# Frontend estático (build) servido pelo próprio FastAPI em produção.
# Rota de fallback SPA: qualquer path que não seja API -> index.html
# ---------------------------------------------------------------
if DIST_DIR.is_dir():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def spa(caminho: str):
        if not caminho or caminho.startswith("api/"):
            return JSONResponse({"sucesso": False, "erro": "Rota da API não encontrada"}, status_code=404)
        alvo = (DIST_DIR / caminho).resolve()
        if str(alvo).startswith(str(DIST_DIR.resolve())) and alvo.is_file():
            return FileResponse(str(alvo))
        return FileResponse(str(DIST_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8500"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=settings.debug)
