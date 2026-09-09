# Painel Cloud JBFER Distribuidora

Sistema multi-tenant para clientes JBFER visualizarem vendas, histórico de conversas de WhatsApp, entregas e rastreamento em tempo real dos entregadores (mapa OpenStreetMap), com um aplicativo Android para os entregadores.

## Arquitetura

```
dashboard/
├── backend/                 # API FastAPI (Python) — porta 8500
├── frontend/                # Dashboard web (React + Vite) — porta 5173
└── mobile/
    └── delivery-driver-app/ # App Android dos entregadores (Kotlin + OSMdroid)
```

- **Backend**: Python 3 + FastAPI, MySQL (mesmo banco do chatbot existente `jbfer_chat_bot`), JWT.
- **Frontend**: React 18 + Vite, react-router, axios, lucide-react, recharts, react-leaflet (OpenStreetMap).
- **Mobile**: Kotlin/Android nativo, OSMdroid (OpenStreetMap), Retrofit, Gson, Google Play Services Location.

## Credenciais padrão (admin)

- CNPJ: `02408190000136-1`
- Senha: `jbfer2026`

> As tabelas do cliente usam o sufixo do CNPJ normalizado, ex.: `tb_pedidos_02408190000136-1`.

## Como rodar — Backend

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
# configure o .env conforme o .env.example (credenciais do banco)
uvicorn app.main:app --host 0.0.0.0 --port 8500 --reload
```

Criar o usuário admin (se ainda não existir):

```bash
python setup_admin.py
```

## Como rodar — Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxy /api -> localhost:8500)
```

Build de produção:

```bash
npm run build
```

## Como rodar — App Android (Entregadores)

Abra a pasta `mobile/delivery-driver-app` no Android Studio (ou via Gradle):

```bash
cd mobile/delivery-driver-app
./gradlew :app:assembleDebug
# APK gerado em: app/build/outputs/apk/debug/app-debug.apk
```

Configuração da URL do servidor em `gradle.properties`:

```properties
BASE_URL=http://SEU-IP:8500/
```

> Para testes em dispositivo físico apontar para o IP da máquina; emulator usa `http://10.0.2.2:8500/`.

## Resumo das rotas da API

Autenticação (dashboard):
- `POST /api/auth/login` — login CNPJ + password → JWT
- `POST /api/auth/register` — criar conta

Vendas:
- `GET /api/vendas/kpisdash` — KPIs (faturamento, pedidos, ticket médio)
- `GET /api/vendas/pedidos` — lista de pedidos
- `GET /api/vendas/pedidos/{id}` — detalhe do pedido
- `POST /api/vendas/pedidos/{id}/status` — alterar status do pedido
- `GET /api/vendas/vendas-dia` — vendas por dia
- `GET /api/vendas/metodos-pagamento` — métodos de pagamento

Chat / WhatsApp:
- `GET /api/chat/conversas` — lista de conversas
- `GET /api/chat/conversas/{numero}` — conversa de um número
- `GET /api/chat/buscar` — buscar conversas

Entregas:
- `GET /api/entregas` — lista de entregas
- `POST /api/entregas` — criar entrega
- `POST /api/entregas/{id}/status` — alterar status
- `GET /api/entregas/entregadores` — lista de entregadores
- `POST /api/entregas/entregadores` — criar entregador
- `PUT /api/entregas/entregadores/{id}` — editar entregador
- `DELETE /api/entregas/entregadores/{id}` — remover entregador

Rastreamento (GPS):
- `POST /api/entregas/localizacao` — registrar localização (admin)
- `GET /api/entregas/localizacoes` — localizações recentes (usado no mapa)
- `GET /api/entregas/localizacao/{entregador_id}` — localização de um entregador

App mobile (entregadores):
- `POST /api/mobile/login` — login do entregador (cnpj + telefone + senha)
- `GET /api/mobile/tarefas` — tarefas atribuídas
- `GET /api/mobile/tarefas/historico` — histórico de tarefas
- `POST /api/mobile/tarefas/{entrega_id}/atualizar` — atualizar status da tarefa
- `POST /api/mobile/localizacao` — enviar posição GPS (`{"lat":..., "lng":..., "precisao":..., "velocidade":...}`)
- `GET /api/mobile/perfil` — perfil do entregador

## Recursos principais

- **Vendas**: cards de KPIs, gráficos (recharts), exportação CSV.
- **Chat**: histórico de conversas do WhatsApp por cliente.
- **Entregas**: CRUD de entregas com atualização de status.
- **Rastreamento**: mapa OpenStreetMap (react-leaflet) com a posição dos entregadores, atualização periódica.
- **App Android**: entregadores aceitam/atualizam entregas e enviam a localização GPS em tempo real.