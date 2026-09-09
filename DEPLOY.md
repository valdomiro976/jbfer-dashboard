# Deploy — Dashboard JBFER (EazyPanel + GitHub)

## Visão geral

- **Subdomínio**: `https://whats.jbfer.com.br/`
- **Painel**: EazyPanel — projeto `portal` em `/etc/easypanel/projects/portal/`
- **Code**: repositório próprio do dashboard (back + front + Dockerfile + easypanel.yaml)
- **Banco**: container MySQL do próprio EazyPanel (`portal_mysql_vendas`), acessado pelo **nome do serviço** (rede interna) — o dashboard apenas consome esse banco.

## Arquitetura de produção

Um único container:

1. **Frontend**: `npm run build` (estágio node) → `frontend/dist`.
2. **Backend**: FastAPI (+ uvicorn, 2 workers) serve a API em `/api/*`.
3. **SPA**: o próprio FastAPI serve o build estático na `/` com rota de fallback (`index.html`) para qualquer path não-API (deep links como `/vendas`, `/rastreamento`).

## Arquivos entregues

| Arquivo | Função |
|---|---|
| `Dockerfile` | Multi-stage: build do frontend + runtime Python |
| `easypanel.yaml` | Manifesto do projeto no EazyPanel |
| `backend/app/main.py` | StaticFiles + fallback SPA (monta `/assets` e serve `index.html`) |
| `.dockerignore` / `.gitignore` | Exclui venv, node_modules, `.env` e o app Android |

## Passo a passo

1. **Publicar o repo**

   ```bash
   cd dashboard
   git init
   git add .
   git commit -m "Dashboard JBFER - deploy inicial"
   git remote add origin https://github.com/valdomiro976/jbfer-dashboard.git
   git branch -M main
   git push -u origin main
   ```

2. **EazyPanel — criar projeto**
   - New Project → name: `jbfer-dashboard` (ou o que preferir dentro de `portal`).
   - Source: apontar para o repositório GitHub, branch `main`.
   - O EazyPanel lê o `easypanel.yaml` automaticamente.

3. **Configurar variáveis** (Valores padrão já definidos no `easypanel.yaml`):
   - `DB_SERVERNAME=portal_mysql_vendas`, `DB_USERNAME=mysql_root`, `DB_PASSWORD`, `DB_NAME=jbfer_chat_bot`
   - `CORS_ORIGINS=https://whats.jbfer.com.br`

4. **Domínio + SSL**
   - Adicionar `whats.jbfer.com.br` às domains do serviço.
   - Habilitar Let's Encrypt (auto).

5. **Deploy** → aguardar build → acessar `https://whats.jbfer.com.br/`.

## Teste de saúde

```bash
curl https://whats.jbfer.com.br/api/health   # -> {"status":"ok",...}
```

## Observações

- O `.env` (credenciais) **não** é versionado. Em produção use as variáveis do EazyPanel.
- O nome do serviço MySQL (`portal_mysql_vendas`) é resolvido pela rede Docker do projeto `portal`; o backend aceita `DB_SERVERNAME` (EazyPanel) ou `DB_HOST` (IP/host local).
- Se um dia o MySQL for um container do próprio projeto, descomente o bloco `mysql:` no `easypanel.yaml` e aponte `DB_HOST` para o nome do serviço (ex.: `mysql`).
- O app Android (`mobile/`) é publicado/acompanhado à parte.