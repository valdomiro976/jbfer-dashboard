import { useEffect, useState } from 'react'
import api from '../api/client'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { formatBRL, formatDate } from './utils'
import { X, MapPin, Save, Truck, Clock, Map as MapIcon } from 'lucide-react'

const entregadorIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">🚚</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })

const STATUS_ASSOC = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
}

const STATUS_ORDER = ['pendente', 'aceita', 'em_transito', 'entregue']

export function EntregaModal({ entrega, onClose, onSalvo }) {
  const [status, setStatus] = useState(entrega?.status || 'pendente')
  const [geo, setGeo] = useState(null)
  const [carregandoMapa, setCarregandoMapa] = useState(false)
  const [mostrarMapa, setMostrarMapa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState(null)

  // Atualiza o status local quando a entrega muda
  useEffect(() => {
    setStatus(entrega?.status || 'pendente')
  }, [entrega])

  const lat = geo && geo.lat != null ? parseFloat(geo.lat) : null
  const lng = geo && geo.lng != null ? parseFloat(geo.lng) : null
  const centro = lat && lng ? [lat, lng] : [-23.5505, -46.6333]

  const verNoMapa = async () => {
    // Se já estiver visível, esconde
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

  const statusAtual = (s) => {
    const cores = {
      pendente: ['var(--warning)', 'rgba(251,191,36,0.15)'],
      aceita: ['#a5b4fc', 'rgba(99,102,241,0.15)'],
      em_transito: ['var(--warning)', 'rgba(251,191,36,0.15)'],
      entregue: ['var(--success)', 'rgba(52,211,153,0.15)'],
      cancelada: ['var(--danger)', 'rgba(248,113,113,0.15)'],
    }
    const [c, bg] = cores[s] || cores.pendente
    return <span className="badge" style={{ color: c, background: bg }}>{(STATUS_ASSOC[s] || s).replace('_', ' ')}</span>
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>

        <div className="row space-between" style={{ marginBottom: 20 }}>
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <Truck size={18} />
              Entrega #{entrega.id}
            </div>
            {statusAtual(status)}
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: 6, minWidth: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        {aviso && (
          <div
            style={{
              padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 14,
              background: aviso.tipo === 'sucesso' ? 'rgba(52,211,153,.15)' : 'rgba(248,113,113,.15)',
              color: aviso.tipo === 'sucesso' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {aviso.msg}
          </div>
        )}

        <div className="modal-inner">

          {/* Coluna esquerda: detalhes */}
          <div>
            <div className="venda-field"><span className="venda-label">Pedido</span><span>{entrega.pedido_descricao || '—'}</span></div>
            <div className="venda-field"><span className="venda-label">Cliente</span><span>{entrega.cliente_nome || '—'}</span></div>
            <div className="venda-field"><span className="venda-label">Endereço</span><span>{entrega.cliente_endereco || '—'}</span></div>
            {(entrega.cliente_cidade || entrega.cliente_uf) && (
              <div className="venda-field"><span className="venda-label">Cidade</span><span>{entrega.cliente_cidade} {entrega.cliente_uf ? `- ${entrega.cliente_uf}` : ''}</span></div>
            )}
            {entrega.cliente_cep && <div className="venda-field"><span className="venda-label">CEP</span><span>{entrega.cliente_cep}</span></div>}
            <div className="venda-field"><span className="venda-label">Entregador</span><span>{entrega.entregador_nome || '—'}</span></div>
            <div className="venda-field"><span className="venda-label">Valor</span><span className="fw-700">{formatBRL(entrega.valor_total)}</span></div>
            {entrega.criado_em && <div className="venda-field"><span className="venda-label">Criado em</span><span>{formatDate(entrega.criado_em)}</span></div>}

            {/* Mapa do destino */}
            {mostrarMapa && (
              <div style={{ marginTop: 16 }}>
                <div className="modal-map" style={{ height: 300 }}>
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
                  <div className="text-muted text-sm" style={{ marginTop: 8 }}>
                    <MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Endereço não geolocalizado automaticamente.
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Coluna direita: status + mapa */}
          <div>
            <div className="card" style={{ background: 'transparent', marginBottom: 14 }}>
              <div className="card-title">
                <Clock size={16} />
                Status da entrega
              </div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                O status é alterado somente por aqui. Selecione o novo estado e clique em salvar.
              </p>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ marginBottom: 14 }}
                disabled={['entregue', 'cancelada'].includes(status)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_ASSOC[s]}</option>
                ))}
              </select>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvarStatus} disabled={salvando || status === entrega?.status}>
                {salvando ? 'Guardando...' : <Save size={16} />}
                Salvar status
              </button>
            </div>

            <div className="card" style={{ background: 'transparent' }}>
              <div className="card-title">
                <MapIcon size={16} />
                Mapa
              </div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                Visualizar a localização do ponto de entrega no mapa (OpenStreetMap).
              </p>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={verNoMapa} disabled={carregandoMapa}>
                <MapPin size={16} />
                {mostrarMapa ? 'Ocultar mapa' : 'Ver no mapa'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}