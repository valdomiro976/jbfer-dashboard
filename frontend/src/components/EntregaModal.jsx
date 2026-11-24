import { useEffect, useState } from 'react'
import api from '../api/client'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { formatBRL, formatDate } from './utils'
import { X, MapPin, Save, Truck, Clock, Map as MapIcon, Package, User, CreditCard, Calendar, Navigation } from 'lucide-react'

const entregadorIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);border:3px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">🚚</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })

const STATUS_ASSOC = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
}

const STATUS_ORDER = ['pendente', 'aceita', 'em_transito', 'entregue']

const STATUS_STYLE = {
  pendente: { color: '#fbbf24', bg: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.35)' },
  aceita: { color: '#a5b4fc', bg: 'rgba(99,102,241,0.16)', border: 'rgba(99,102,241,0.35)' },
  em_transito: { color: '#22d3ee', bg: 'rgba(34,211,238,0.16)', border: 'rgba(34,211,238,0.35)' },
  entregue: { color: '#34d399', bg: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.35)' },
  cancelada: { color: '#f87171', bg: 'rgba(248,113,113,0.16)', border: 'rgba(248,113,113,0.35)' },
}

const card = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 18,
}

const row = {
  display: 'flex',
  gap: 10,
  marginBottom: 10,
  fontSize: 14,
  alignItems: 'flex-start',
}

const label = {
  color: 'var(--text-muted)',
  minWidth: 100,
  flexShrink: 0,
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const value = {
  color: 'var(--text-primary)',
  flex: 1,
  wordBreak: 'break-word',
}

export function EntregaModal({ entrega, onClose, onSalvo }) {
  const [status, setStatus] = useState(entrega?.status || 'pendente')
  const [geo, setGeo] = useState(null)
  const [carregandoMapa, setCarregandoMapa] = useState(false)
  const [mostrarMapa, setMostrarMapa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    setStatus(entrega?.status || 'pendente')
  }, [entrega])

  const lat = geo && geo.lat != null ? parseFloat(geo.lat) : null
  const lng = geo && geo.lng != null ? parseFloat(geo.lng) : null
  const centro = lat && lng ? [lat, lng] : [-23.5505, -46.6333]

  const verNoMapa = async () => {
    if (mostrarMapa) {
      setMostrarMapa(false)
      return
    }
    setMostrarMapa(true)
    setCarregandoMapa(true)
    try {
      const { data } = await api.get(`/entregas/${entrega.id}/geo`, { timeout: 60000 })
      setGeo(data.dados)
    } catch (e) {
      setAviso({ tipo: 'erro', msg: 'Erro ao carregar o mapa: ' + (e.response?.data?.detail || e.message) })
    } finally {
      setCarregandoMapa(false)
    }
  }

  const salvarStatus = async () => {
    setSalvando(true)
    setAviso(null)
    try {
      await api.post(`/entregas/${entrega.id}/status?status_entrega=${status}`)
      setAviso({ tipo: 'sucesso', msg: 'Status da entrega atualizado com sucesso.' })
      if (onSalvo) onSalvo()
    } catch (e) {
      setAviso({ tipo: 'erro', msg: 'Erro ao atualizar status: ' + (e.response?.data?.detail || e.message) })
    } finally {
      setSalvando(false)
    }
  }

  const st = STATUS_STYLE[status] || STATUS_STYLE.pendente

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #141a2a 0%, #0f1424 100%)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '22px 26px',
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(90deg, rgba(99,102,241,0.12), rgba(34,211,238,0.06))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(99,102,241,0.4)',
              }}
            >
              <Truck size={22} color="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Entrega #{entrega.id}</h3>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    color: st.color,
                    background: st.bg,
                    border: `1px solid ${st.border}`,
                  }}
                >
                  {(STATUS_ASSOC[status] || status).replace('_', ' ')}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                {entrega.cliente_nome || 'Cliente'} · {entrega.entregador_nome || 'Sem entregador'}
              </div>
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            style={{ position: 'static', width: 36, height: 36 }}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {aviso && (
          <div
            style={{
              margin: '16px 26px 0',
              padding: 12,
              borderRadius: 12,
              fontSize: 14,
              background: aviso.tipo === 'sucesso' ? 'rgba(52,211,153,.16)' : 'rgba(248,113,113,.16)',
              color: aviso.tipo === 'sucesso' ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${aviso.tipo === 'sucesso' ? 'rgba(52,211,153,.35)' : 'rgba(248,113,113,.35)'}`,
            }}
          >
            {aviso.msg}
          </div>
        )}

        <div className="modal-scroll" style={{ padding: '20px 26px 26px', maxHeight: '78vh' }}>
          <div className="modal-inner" style={{ gap: 18 }}>
            {/* Coluna esquerda: detalhes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary-light)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <Package size={15} /> Pedido
                </div>
                <div style={row}><span style={label}>Descrição</span><span style={value}>{entrega.pedido_descricao || '—'}</span></div>
                <div style={row}><span style={label}>Entregador</span><span style={value}>{entrega.entregador_nome || '—'}</span></div>
                <div style={row}><span style={label}>Valor</span><span style={{ ...value, fontWeight: 800, color: 'var(--success)', fontSize: 16 }}>{formatBRL(entrega.valor_total)}</span></div>
                {entrega.criado_em && <div style={row}><span style={label}>Criado em</span><span style={value}>{formatDate(entrega.criado_em)}</span></div>}
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--accent)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <User size={15} /> Cliente
                </div>
                <div style={row}><span style={label}>Nome</span><span style={value}>{entrega.cliente_nome || '—'}</span></div>
                <div style={row}><span style={label}>Endereço</span><span style={value}>{entrega.cliente_endereco || '—'}</span></div>
                {(entrega.cliente_cidade || entrega.cliente_uf) && (
                  <div style={row}><span style={label}>Cidade</span><span style={value}>{entrega.cliente_cidade} {entrega.cliente_uf ? `- ${entrega.cliente_uf}` : ''}</span></div>
                )}
                {entrega.cliente_cep && <div style={row}><span style={label}>CEP</span><span style={value}>{entrega.cliente_cep}</span></div>}
              </div>

              {/* Mapa do destino */}
              {mostrarMapa && (
                <div style={{ ...card, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>
                      <MapPin size={15} color="var(--primary-light)" /> Localização do destino
                    </div>
                  </div>
                  <div className="modal-map" style={{ height: 280, borderRadius: 12 }}>
                    {carregandoMapa ? (
                      <div className="loading" style={{ height: '100%' }}>Localizando endereço...</div>
                    ) : (
                      <MapContainer center={centro} zoom={lat && lng ? 15 : 11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        {lat && lng && (
                          <Marker position={[lat, lng]} icon={entregadorIcon()}>
                            <Popup>
                              <strong>Entrega #{entrega.id}</strong>
                              <div className="text-sm">{entrega.cliente_nome}</div>
                              <div className="text-sm">{entrega.cliente_endereco}</div>
                            </Popup>
                          </Marker>
                        )}
                      </MapContainer>
                    )}
                  </div>
                  {!lat || !lng ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Navigation size={13} /> Endereço não geolocalizado automaticamente.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Coluna direita: status + mapa */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--warning)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <Clock size={15} /> Status da entrega
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                  Selecione o novo estado e clique em salvar para atualizar o ciclo da entrega.
                </p>
                <select
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ marginBottom: 14, background: 'var(--surface-variant, #1e293b)' }}
                  disabled={['entregue', 'cancelada'].includes(status)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_ASSOC[s]}</option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 700, borderRadius: 12 }}
                  onClick={salvarStatus}
                  disabled={salvando || status === entrega?.status}
                >
                  <Save size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  {salvando ? 'Salvando...' : 'Salvar status'}
                </button>
                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {STATUS_ORDER.map((s) => {
                    const ss = STATUS_STYLE[s]
                    const ativo = status === s
                    return (
                      <span
                        key={s}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: ativo ? ss.color : 'var(--text-tertiary)',
                          background: ativo ? ss.bg : 'transparent',
                          border: `1px solid ${ativo ? ss.border : 'var(--border)'}`,
                          opacity: ativo ? 1 : 0.5,
                        }}
                      >
                        {STATUS_ASSOC[s]}
                      </span>
                    )
                  })}
                </div>
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--primary-light)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <MapIcon size={15} /> Mapa
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
                  Visualize a localização do ponto de entrega no mapa (OpenStreetMap).
                </p>
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%', padding: 12, fontSize: 14, fontWeight: 600, borderRadius: 12, border: '1px solid var(--border)' }}
                  onClick={verNoMapa}
                  disabled={carregandoMapa}
                >
                  <MapPin size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  {mostrarMapa ? 'Ocultar mapa' : 'Ver no mapa'}
                </button>
              </div>

              <div style={{ ...card, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-light)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  <CreditCard size={14} /> Dica
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
                  O status é alterado somente por aqui. Status de entrega (aceita, em trânsito, entregue) exigem que a venda esteja atribuída a um entregador.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}