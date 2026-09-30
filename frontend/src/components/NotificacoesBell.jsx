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
  // CRIADO EM: 29/09/2026 - lembrete proativo de entregas agendadas (bot):
  // entregas atrasadas ou prestes a vencer.
  entrega_prox: { text: 'Próxima', cls: 'badge badge-warning' },
  entrega_atrasada: { text: 'Atrasada', cls: 'badge badge-danger' },
}

const SOM_REMINDER = (() => {
  let ctx = null
  return function tocar() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') ctx.resume()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      // 'Ding-dong' curto (440 Hz -> 660 Hz)
      o.frequency.setValueAtTime(440, ctx.currentTime)
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
      o.start()
      o.stop(ctx.currentTime + 0.5)
    } catch (e) {
      console.warn('AudioContext indisponível', e)
    }
  }
})()

export function NotificacoesBell() {
  const [aberto, setAberto] = useState(false)
  const [nItens, setNItens] = useState(0)
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(false)
  const ref = useRef(null)
  const refIds = useRef(new Set())
  const navigate = useNavigate()

  // CRIADO EM: 29/09/2026 - quando chega notificacao NOVA (nao lida) de lembrete
  // de entrega agendada (proxima/atrasada), toca um som no navegador chamando a
  // atencao do operador. So toca 1x por notificacao (refIds).
  const lembrarSom = (lista) => {
    try {
      const novas = (lista || []).filter(
        (n) =>
          !n.lida &&
          (n.evento === 'entrega_prox' || n.evento === 'entrega_atrasada') &&
          !refIds.current.has(n.id)
      )
      if (novas.length > 0) SOM_REMINDER()
      novas.forEach((n) => refIds.current.add(n.id))
      if (refIds.current.size > 500) {
        const lista = [...refIds.current].sort((a, b) => a - b)
        refIds.current = new Set(lista.slice(-250))
      }
    } catch (e) {
      console.warn(e)
    }
  }

  const carregar = async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/notificacoes', { params: { limite: 30 } })
      setNItens(data.nao_lidas || 0)
      setDados(data.dados || [])
      lembrarSom(data.dados)
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