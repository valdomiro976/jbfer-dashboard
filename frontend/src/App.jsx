import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Sidebar } from './components/Sidebar'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Vendas } from './pages/Vendas'
import { Produtos } from './pages/Produtos'
import { Chat } from './pages/Chat'
import { Entregas } from './pages/Entregas'
import { Rastreamento } from './pages/Rastreamento'
import { Entregadores } from './pages/Entregadores'
import { Agendamentos } from './pages/Agendamentos'
import { Redirecionamentos } from './pages/Redirecionamentos'
import { Cadastros } from './pages/Cadastros'

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
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
          <Route path="/produtos" element={<Cadastros padrao="produtos" />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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