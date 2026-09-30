import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, ShoppingBag, Truck, AlertTriangle, CheckCheck, Inbox, X } from 'lucide-react'
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

// CRIADO EM: 29/09/2026 - sons do sino via WebAudio.
// - 'proxima': dois tons suaves (relax, aviso leve).
// - 'atrasada': alarme insistente (3 toques agudos, repetidos para chamar a
//   atencao do operador ate a janela ser vista).
let _ctx = null
function getCtx() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      _ctx = null
    }
  }
  if (_ctx && _ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function nota(ctx, freq, inicio, duracao, vol = 0.28, tipo = 'sine') {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(freq, inicio)
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.exponentialRampToValueAtTime(vol, inicio + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao)
  o.connect(g)
  g.connect(ctx.destination)
  o.start(inicio)
  o.stop(inicio + duracao + 0.03)
}

function tocarProxima() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  nota(ctx, 523.25, t, 0.18) // C5
  nota(ctx, 659.25, t + 0.17, 0.3) // E5
}

function tocarAtrasada() {
  const ctx = getCtx()
  if (!ctx) return
  const base = ctx.currentTime
  for (let ciclo = 0; ciclo < 3; ciclo++) {
    const t = base + ciclo * 0.55
    nota(ctx, 880, t, 0.18, 0.3, 'square') // A5 beep
    nota(ctx, 880, t + 0.28, 0.18, 0.3, 'square')
    nota(ctx, 1174.66, t + 0.42, 0.26, 0.32, 'square') // D6
  }
}

export function NotificacoesBell() {
  const [aberto, setAberto] = useState(false)
  const [nItens, setNItens] = useState(0)
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [alerta, setAlerta] = useState(null) // notificacao em atraso em janela
  const ref = useRef(null)
  const refIds = useRef(new Set()) // ids ja sinalizados (som) nesta sessao
  const refAlertaIds = useRef(new Set()) // ids ja mostrados em janela
  const navigate = useNavigate()

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/notificacoes', { params: { limite: 30 } })
      const lista = data.dados || []
      setNItens(data.nao_lidas || 0)
      setDados(lista)

      const novas = lista.filter(
        (n) =>
          !n.lida &&
          (n.evento === 'entrega_prox' || n.evento === 'entrega_atrasada') &&
          !refIds.current.has(n.id)
      )
      novas.forEach((n) => refIds.current.add(n.id))
      if (refIds.current.size > 500) {
        const arr = [...refIds.current].sort((a, b) => a - b)
        refIds.current = new Set(arr.slice(-250))
      }

      // CRIADO EM: 29/09/2026 - separa os sons por gravidade.
      if (novas.some((n) => n.evento === 'entrega_prox')) tocarProxima()

      // CRIADO EM: 29/09/2026 - entrega em ATRASO abre janela central + alarme.
      const atrasadas = novas.filter((n) => n.evento === 'entrega_atrasada')
      if (atrasadas.length > 0) tocarAtrasada()
      setAlerta((anterior) => {
        if (anterior) return anterior // janela ja aberta; as demais ficam na fila
        const pendente = atrasadas.filter((n) => !refAlertaIds.current.has(n.id))
        if (pendente.length === 0) return null
        refAlertaIds.current.add(pendente[0].id)
        return pendente[0]
      })
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(() => carregar(true), 30000)
    return () => clearInterval(t)
  }, [carregar])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fecharAlerta = () => {
    setAlerta(null)
    // Abre a proxima atrasada ainda nao exibida, se houver.
    const pendente = dados.filter(
      (n) => !n.lida && n.evento === 'entrega_atrasada' && !refAlertaIds.current.has(n.id)
    )
    if (pendente.length > 0) {
      refAlertaIds.current.add(pendente[0].id)
      setAlerta(pendente[0])
    }
  }

  const irVer = async (n) => {
    setAlerta(null)
    try {
      if (!n.lida) await api.patch('/notificacoes/marcar-lidas', { ids: [n.id] })
      setNItens((x) => Math.max(0, x - 1))
      setDados((ds) => ds.map((d) => (d.id === n.id ? { ...d, lida: 1 } : d)))
    } catch (e) {
      console.error(e)
    }
    navigate('/agendamentos')
  }

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

      {/* CRIADO EM: 29/09/2026 - janela central de entrega em atraso.
          ALTERADO EM: 30/09/2026 - renderiza via portal no <body>: a topbar usa
          backdrop-filter, que vira containing block de position:fixed e fazia a
          janela abrir em posicao negativa fora da tela. */}
      {alerta &&
        createPortal(
          <div className="modal-overlay" onClick={fecharAlerta}>
            <div className="modal modal-alerta" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={fecharAlerta} title="Fechar">
                <X size={16} />
              </button>
              <div className="modal-alerta-head">
                <div className="modal-alerta-ic">
                  <AlertTriangle size={24} />
                </div>
                <span className="modal-alerta-titulo">Entrega em atraso</span>
              </div>
              <div className="modal-alerta-msg">{alerta.mensagem}</div>
              <div className="modal-alerta-actions">
                <button className="btn btn-ghost" onClick={fecharAlerta}>
                  Fechar
                </button>
                <button className="btn btn-primary" onClick={() => irVer(alerta)}>
                  <Truck size={15} style={{ marginRight: 6 }} />
                  Ver agendamentos
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

// Mantém compatibilidade: Topbar usa NotificacoesBell para o sino
export default NotificacoesBell