import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingBag,
  MessageCircle,
  Truck,
  MapPin,
  Users,
  Database,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  CalendarClock,
  CornerDownRight,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/entregas', icon: Truck, label: 'Entregas' },
  { to: '/agendamentos', icon: CalendarClock, label: 'Agendamentos' },
  { to: '/redirecionamentos', icon: CornerDownRight, label: 'Redirecionamentos' },
  { to: '/rastreamento', icon: MapPin, label: 'Rastreamento' },
  { to: '/chat', icon: MessageCircle, label: 'WhatsApp' },
  { to: '/cadastros', icon: Database, label: 'Cadastros' },
]

const statusOnline = (loc) => {
  if (!loc || !loc.criado_em) return false
  try {
    let s = loc.criado_em
    if (typeof s === 'string' && !s.endsWith('Z') && !/[+-]\\d{2}:?\\d{2}$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z'
    }
    const criado = new Date(s)
    return (Date.now() - criado.getTime()) < 2 * 60 * 1000
  } catch {
    return false
  }
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  // ALTERADO EM: 25/09/2026 - Ajuda abre a aba Ajuda do Cadastros
  const ajudaAtiva = pathname === '/cadastros' && search.includes('ajuda=1')
  const [collapsed, setCollapsed] = useState(false)
  // RESPONSIVO (15/10/2026): drawer no mobile via evento 'sidebar:toggle'
  // (hamburger no Topbar). Fecha ao navegar ou no overlay.
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const abrir = () => setMobileOpen((v) => !v)
    const fechar = () => setMobileOpen(false)
    window.addEventListener('sidebar:toggle', abrir)
    window.addEventListener('sidebar:close', fechar)
    return () => {
      window.removeEventListener('sidebar:toggle', abrir)
      window.removeEventListener('sidebar:close', fechar)
    }
  }, [])
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, search])
  const [entregAberto, setEntregAberto] = useState(false)
  const [entregadores, setEntregadores] = useState([])
  const [vendasAberto, setVendasAberto] = useState(false)
  const [vendas, setVendas] = useState([])
  const [vendasCarregadas, setVendasCarregadas] = useState(false)

  const loadEntregadores = async () => {
    try {
      const { data } = await api.get('/entregas/localizacoes')
      setEntregadores(data.dados || [])
    } catch (e) {
      console.error(e)
    }
  }

  // Todas as vendas (não só as geolocalizadas) acopladas ao status/entregador
  const loadVendas = async () => {
    try {
      const [ped, rot, entregas] = await Promise.all([
        api.get('/vendas/pedidos', { params: { limite: 500 }, timeout: 60000 }),
        api.get('/entregas/rotas', { timeout: 120000 }),
        api.get('/entregas', { timeout: 60000 }),
      ])
      const pedidos = ped.data.dados || []
      const porPedido = {}
      ;(rot.data.dados || []).forEach((r) => {
        ;(r.destinos || []).forEach((d) => {
          if (d.pedido_id != null) porPedido[d.pedido_id] = r.entregador
        })
      })
      // Status real da entrega por pedido (do mais relevante para o menos)
      const entregasPedido = {}
      ;(entregas.data.dados || []).forEach((en) => {
        const pid = en.pedido_id
        if (pid == null) return
        const prioridade = { entregue: 4, em_transito: 3, aceita: 2, aceito: 2, pendente: 1, cancelada: 1 }[en.status] ?? 0
        const atual = entregasPedido[pid]
        if (!atual || prioridade > atual.p) entregasPedido[pid] = { p: prioridade, status: en.status }
      })
      // Sinalização: verde=entregue, amarelo=em rota/aceita, vermelho=aguardando aceite/atribuição
      const corVenda = (v) => {
        const en = entregasPedido[v.id]
        const st = en?.status || v.status || 'pendente'
        if (st === 'entregue') return 'verde'
        if (st === 'em_transito' || st === 'aceita' || st === 'aceito' || st === 'em_andamento') return 'amarelo'
        return 'vermelho'
      }
      const vendasComEnt = pedidos.map((v) => ({ ...v, entregador: porPedido[v.id] || null, corVenda: corVenda(v) }))
      const ordemCor = { vermelho: 0, amarelo: 1, verde: 2 }
      vendasComEnt.sort((a, b) => {
        const ca = ordemCor[a.corVenda] ?? 0
        const cb = ordemCor[b.corVenda] ?? 0
        if (ca !== cb) return ca - cb
        return (a.nome || '').localeCompare(b.nome || '')
      })
      setVendas(vendasComEnt)
      setVendasCarregadas(true)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!collapsed && entregAberto) {
      loadEntregadores()
      const interval = setInterval(loadEntregadores, 10000)
      return () => clearInterval(interval)
    }
  }, [collapsed, entregAberto])

  useEffect(() => {
    if (!collapsed && vendasAberto && !vendasCarregadas) loadVendas()
  }, [collapsed, vendasAberto, vendasCarregadas])

  // Atualiza o submenu de vendas imediatamente quando uma venda é editada/atribuída
  useEffect(() => {
    const handler = () => {
      if (!collapsed && vendasAberto) loadVendas()
    }
    window.addEventListener('vendas:atualizado', handler)
    return () => window.removeEventListener('vendas:atualizado', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendasAberto, collapsed])

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="logo">
        <div className="logo-icon">J</div>
        {!collapsed && <span>Dashboard JBFER</span>}
      </div>

      <nav>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            title={item.label}
            onClick={() => window.dispatchEvent(new Event('sidebar:close'))}
          >
            <item.icon size={18} />
            {!collapsed && item.label}
          </NavLink>
        ))}
        <button
          className={ajudaAtiva ? 'nav-item active' : 'nav-item'}
          onClick={() => {
            window.dispatchEvent(new Event('sidebar:close'))
            navigate('/cadastros?ajuda=1')
          }}
          title="Ajuda"
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <HelpCircle size={18} />
          {!collapsed && 'Ajuda'}
        </button>

        {/* Vendas: submenu sanfona */}
        <div className={`nav-item ${vendasAberto ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <button
            className="nav-toggle"
            onClick={() => {
              setVendasAberto(!vendasAberto)
              if (!vendasAberto && collapsed) setCollapsed(false)
            }}
            title="Vendas"
          >
            <ShoppingBag size={18} />
            {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>Vendas</span>}
            {!collapsed && <ChevronDown size={16} style={{ transform: vendasAberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
          </button>

          {!collapsed && vendasAberto && (
            <div className="nav-sub">
              {vendas.map((v) => (
                <button
                  key={v.id}
                  className="nav-sub-item"
                  onClick={() => {
                    window.dispatchEvent(new Event('sidebar:close'))
                    navigate(`/vendas?venda=${v.id}`)
                  }}
                  title={`Venda #${v.id} - ${v.nome}`}
                >
                  <span className={`venda-dot venda-${v.corVenda}`} />
                  <span className="nav-venda-id">#{v.id}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</span>
                </button>
              ))}
              {!vendasCarregadas && vendas.length === 0 && <div className="nav-sub-item text-muted" style={{ justifyContent: 'center', fontSize: 12 }}>Carregando vendas...</div>}
              {vendasCarregadas && vendas.length === 0 && <div className="nav-sub-item text-muted" style={{ justifyContent: 'center', fontSize: 12 }}>Sem vendas</div>}
              <a
                className="nav-sub-link"
                href="javascript:void(0)"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setVendasAberto(false)
                  window.dispatchEvent(new Event('sidebar:close'))
                  if (window.location.pathname === '/vendas') {
                    window.location.assign('/vendas')
                  } else {
                    navigate('/vendas')
                  }
                }}
              >
                <Plus size={14} />
                Ver todas as vendas
              </a>
            </div>
          )}
        </div>

        {/* Entregadores: submenu sanfona */}
        <div className={`nav-item ${entregAberto ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <button
            className="nav-toggle"
            onClick={() => {
              setEntregAberto(!entregAberto)
              if (!entregAberto && collapsed) setCollapsed(false)
            }}
            title="Entregadores"
          >
            <Users size={18} />
            {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>Entregadores</span>}
            {!collapsed && <ChevronDown size={16} style={{ transform: entregAberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
          </button>

          {!collapsed && entregAberto && (
            <div className="nav-sub">
              {entregadores.map((d) => {
                const online = statusOnline(d.localizacao)
                return (
                    <button
                      key={d.entregador.id}
                      className="nav-sub-item"
                      onClick={() => {
                        window.dispatchEvent(new Event('sidebar:close'))
                        navigate(`/rastreamento?entregador=${d.entregador.id}`)
                      }}
                      title="Localizar no mapa"
                    >
                    <span className={`dot ${online ? 'dot-online' : 'dot-offline'}`} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.entregador.nome}</span>
                    <span className="text-muted text-sm">{online ? 'On' : 'Off'}</span>
                  </button>
                )
              })}
              {entregadores.length === 0 && <div className="nav-sub-item text-muted" style={{ justifyContent: 'center', fontSize: 12 }}>Sem entregadores</div>}
              <NavLink to="/entregadores" className="nav-sub-link" end
                onClick={() => window.dispatchEvent(new Event('sidebar:close'))}>
                <Plus size={14} />
                Cadastro
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      <div className="user-box">
        {!collapsed && (
          <>
            <div className="user-name">{user?.name || 'Cliente'}</div>
            <div className="user-cnpj">CNPJ: {user?.cnpj}</div>
          </>
        )}
        <button
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: collapsed ? 10 : 14, justifyContent: 'center' }}
          onClick={logout}
          title="Sair"
        >
          <LogOut size={16} />
          {!collapsed && 'Sair'}
        </button>
      </div>

      <button
        className="btn btn-ghost sidebar-collapse-btn"
        onClick={() => setCollapsed(!collapsed)}
        style={{ marginTop: 12, justifyContent: 'center' }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
    </>
  )
}