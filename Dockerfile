# ============================================================
# Dashboard JBFER - imagem de produção
# Frontend (React + Vite) buildado e servido pelo FastAPI (StaticFiles)
# ============================================================

# ---------- Estágio 1: build do frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
RUN npm run build

# ---------- Estágio 2: runtime do backend ----------
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8500

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend

# Variáveis padrão (sobrescrevidas via EazyPanel se necessário)
ENV DB_HOST=104.237.9.229 \
    DB_PORT=3306 \
    DB_USER=mysql_root \
    DB_PASSWORD=Bravos2025& \
    DB_NAME=jbfer_chat_bot \
    SECRET_KEY=dashboard-jbfer-secret-key-2026-multitenant \
    CORS_ORIGINS="https://whats.jbfer.com.br"

EXPOSE 8500

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8500", "--workers", "2"]