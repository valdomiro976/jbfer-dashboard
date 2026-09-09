import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ShoppingBag, Truck, CheckCircle2, XCircle, Clock, CheckCheck, Inbox } from 'lucide-react'
import api from '../api/client'
import { formatDate } from './utils'

const icone = {
  venda: { Comp: ShoppingBag, cls: 'notif-venda' },
  entrega: { Comp: Truck, cls: 'notif-entrega' },
}

const badgeEvento = {
  nova: { text: 'Nova', cls: 'badge badge-success' },
  em_transito: { text: 'Em trânsito', cls: 'badge badge-warning' },
  pendente: { text: 'Pendente', cls: 'badge badge-warning' },
  aceita: { text: 'Aceita', cls: 'badge badge-primary' },
  entregue: { text: 'Entregue', cls: 'badge badge-success' },
  cancelada: { text: 'Cancelada', cls: 'badge badge-danger' },
}

export function NotificacoesBell() {
  const [aberto, setAberto] = useState(false)
  const [nItens, setNItens] = useState(0)
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const carregar = async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/notificacoes', { params: { limite: 30 } })
      setNItens(data.nao_lidas || 0)
      setDados(data.dados || [])
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    const t = setInterval(() => carregar(true), 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const clicarItem = async (n) => {
    try {
      if (!n.lida) {
        await api.patch('/notificacoes/marcar-lidas', { ids: [n.id] })
        setNItens((x) => Math.max(0, x - 1))
        setDados((ds) => ds.map((d) => (d.id === n.id ? { ...d, lida: 1 } : d)))
      }
    } catch (e) {
      console.error(e)
    }
    setAberto(false)
    if (n.link) navigate(n.link)
  }

  const marcarTodas = async () => {
    try {
      await api.patch('/notificacoes/marcar-lidas')
      setNItens(0)
      setDados((ds) => ds.map((d) => ({ ...d, lida: 1 })))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="btn btn-ghost notif-bell"
        onClick={() => setAberto(!aberto)}
        title="Notificações"
      >
        <Bell size={16} />
        Notificações
        {nItens > 0 && <span className="notif-badge">{nItens > 99 ? '99+' : nItens}</span>}
      </button>

      {aberto && (
        <div className="notif-panel">
          <div className="notif-head">
            <span className="fw-700">Notificações</span>
            {nItens > 0 && (
              <button className="btn btn-ghost notif-marcar" onClick={marcarTodas}>
                <CheckCheck size={14} />
                Marcar todas
              </button>
            )}
          </div>
          <div className="notif-list">
            {carregando && dados.length === 0 && (
              <div className="notif-empty text-muted">Carregando...</div>
            )}
            {!carregando && dados.length === 0 && (
              <div className="notif-empty text-muted">
                <Inbox size={22} style={{ opacity: 0.5, marginBottom: 6 }} />
                <br />
                Sem notificações
              </div>
            )}
            {dados.map((n) => {
              const ic = icone[n.tipo] || icone.venda
              const badge = badgeEvento[n.evento] || { text: n.evento, cls: 'badge' }
              const { Comp } = ic
              return (
                <button
                  key={n.id}
                  className={'notif-item' + (n.lida ? ' lida' : '')}
                  onClick={() => clicarItem(n)}
                >
                  <div className={`notif-ic ${ic.cls}`}>
                    <Comp size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-titulo">{n.titulo}</div>
                    {n.mensagem && <div className="notif-msg">{n.mensagem}</div>}
                    <div className="notif-data">{formatDate(n.criado_em)}</div>
                  </div>
                  <span className={badge.cls} style={{ marginLeft: 8, flexShrink: 0 }}>
                    {badge.text}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Mantém compatibilidade: Topbar usa NotificacoesBell para o sino
export default NotificacoesBell