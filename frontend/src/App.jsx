import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Sidebar } from './components/Sidebar'
import { Login } from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Vendas = lazy(() => import('./pages/Vendas'))
const Produtos = lazy(() => import('./pages/Produtos'))
const Chat = lazy(() => import('./pages/Chat'))
const Entregas = lazy(() => import('./pages/Entregas'))
const Rastreamento = lazy(() => import('./pages/Rastreamento'))
const Entregadores = lazy(() => import('./pages/Entregadores'))
const Agendamentos = lazy(() => import('./pages/Agendamentos'))
const Redirecionamentos = lazy(() => import('./pages/Redirecionamentos'))
const Cadastros = lazy(() => import('./pages/Cadastros'))

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Suspense fallback={<div style={{ padding: 24 }}>Carregando...</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/entregas" element={<Entregas />} />
          <Route path="/rastreamento" element={<Rastreamento />} />
          <Route path="/entregadores" element={<Entregadores />} />
          <Route path="/agendamentos" element={<Agendamentos />} />
          <Route path="/redirecionamentos" element={<Redirecionamentos />} />
          <Route path="/departamentos" element={<Cadastros padrao="departamentos" />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}