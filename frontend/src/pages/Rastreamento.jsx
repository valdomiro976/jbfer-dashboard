import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Topbar } from '../components/Topbar'
import { Loader, formatDate, formatBRL } from '../components/utils'
import { Truck, Radio, Store, MapPin, Route } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

const customIcon = (color = '#6366f1') =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">🚚</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })

// Marker para as vendas (clientes) — diferente do entregador
const vendaIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">🏪</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })

// Marker que abre o popup automaticamente quando "aberto" é true
function AutoOpenMarker({ position, icon, aberto, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const tries = setInterval(() => {
      if (ref.current) {
        clearInterval(tries)
        ref.current.openPopup()
      }
    }, 120)
    const stop = setTimeout(() => clearInterval(tries), 8000)
    return () => { clearInterval(tries); clearTimeout(stop) }
  }, [aberto])
  return (
    <Marker ref={ref} position={position} icon={icon}>
      {children}
    </Marker>
  )
}

// Centraliza o mapa na posição do entregador selecionado (só quando muda)
function FlyTo({ pos }) {
  const map = useMap()
  const lastKeyRef = useRef(null)
  useEffect(() => {
    if (!pos) return
    const key = pos[0].toFixed(6) + ',' + pos[1].toFixed(6)
    if (lastKeyRef.current === key) return
    lastKeyRef.current = key
    map.flyTo(pos, 15, { duration: 1 })
  }, [pos, map])
  return null
}

// Enquadra múltiplos pontos (entregador + vendas) no mapa
function FitBounds({ pontos }) {
  const map = useMap()
  const lastRef = useRef(null)
  useEffect(() => {
    if (!pontos || pontos.length === 0) return
    const key = pontos.map((p) => p.map((v) => Number(v).toFixed(6)).join(',')).join('|')
    if (lastRef.current === key) return
    lastRef.current = key
    try {
      const bounds = L.latLngBounds(pontos.map((p) => [Number(p[0]), Number(p[1])]))
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 17, duration: 1 })
    } catch { /* ignora bounds inválidos */ }
  }, [pontos, map])
  return null
}

export function Rastreamento() {
  const [dados, setDados] = useState([])
  const [vendas, setVendas] = useState([])
  const [rotas, setRotas] = useState([])
  const [rotasVersao, setRotasVersao] = useState(0)
  const [mostrarRotas, setMostrarRotas] = useState(true)
  const [corRota, setCorRota] = useState('#6366f1')
  const [dashedRota, setDashedRota] = useState(false)
  const [corPorEntregador, setCorPorEntregador] = useState(true)
  const [selecionadoId, setSelecionadoId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [atualizado, setAtualizado] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const v = searchParams.get('entregador')
    if (v) setSelecionadoId(Number(v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const load = async () => {
    try {
      const { data } = await api.get('/entregas/localizacoes')
      setDados(data.dados)
      setAtualizado(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Carrega as vendas geolocalizadas apenas uma vez (não no loop de 15s
  // para não sobrecarregar o serviço de geocodificação)
  const loadVendas = async () => {
    try {
      const { data } = await api.get('/vendas/pedidos/geo', { timeout: 90000 })
      const comCoord = (data.dados || []).filter((v) => v.lat != null && v.lng != null)
      setVendas(comCoord)
    } catch (e) {
      console.error('Erro ao carregar vendas no mapa:', e)
    }
  }

  // Carrega as rotas (entregador -> suas entregas atribuídas)
  const loadRotas = async () => {
    try {
      const { data } = await api.get('/entregas/rotas', { timeout: 120000 })
      setRotas(data.dados || [])
      setRotasVersao((v) => (v || 0) + 1)
    } catch (e) {
      console.error('Erro ao carregar rotas:', e)
    }
  }

  useEffect(() => {
    load()
    loadVendas()
    loadRotas()
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 15000)
      return () => clearInterval(intervalRef.current)
    }
  }, [autoRefresh])

  const comLocalizacao = dados.filter((d) => d.localizacao)

  // Centro do mapa: prioriza entregadores, senão vendas, senão padrão
  const centro = (() => {
    if (comLocalizacao.length > 0) {
      const loc = comLocalizacao[0].localizacao
      return [parseFloat(loc.lat), parseFloat(loc.lng)]
    }
    if (vendas.length > 0) {
      return [parseFloat(vendas[0].lat), parseFloat(vendas[0].lng)]
    }
    return [-23.5505, -46.6333] // São Paulo (padrão)
  })()

  const statusOnline = (d) => {
    if (!d.localizacao) return false
    try {
      const criado = new Date(d.localizacao.criado_em)
      return (Date.now() - criado.getTime()) < 5 * 60 * 1000
    } catch {
      return false
    }
  }

  const vendasComLocalizacao = vendas.filter((v) => v.lat != null && v.lng != null)

  // Posição do entregador selecionado (para centralizar o mapa)
  const selecionado = dados.find((d) => d.entregador.id === selecionadoId && d.localizacao)
  const alvo = selecionado
    ? [parseFloat(selecionado.localizacao.lat), parseFloat(selecionado.localizacao.lng)]
    : null

  // Mapa: pedido_id -> nome do entregador atribuído (para o popup das vendas)
  const entregadorPorPedido = {}
  rotas.forEach((r) => {
    ;(r.destinos || []).forEach((d) => {
      if (d.pedido_id != null) entregadorPorPedido[d.pedido_id] = r.entregador.nome
    })
  })

  if (loading) return <Loader />

  return (
    <>
      <Topbar title="Rastreamento em Tempo Real" subtitle="Entregadores e localização das vendas via OpenStreetMap" />

      <div className="content animate-in" style={{ paddingTop: 16 }}>
        <div className="row space-between wrap" style={{ marginBottom: 16 }}>
          <div className="row wrap" style={{ gap: 16 }}>
            <div className="row">
              <Radio size={18} color="var(--success)" />
              <span className="fw-700">{comLocalizacao.length} entregadores localizados</span>
            </div>
            <div className="row">
              <Store size={18} color="var(--accent)" />
              <span className="fw-700">{vendasComLocalizacao.length} vendas no mapa</span>
            </div>
            <div className="row">
              <Route size={18} color="var(--primary)" />
              <span className="fw-700">
                {rotas.reduce((n, r) => n + (r.localizacao ? r.destinos.filter((d) => d.lat != null && d.lng != null).length : 0), 0)} rotas
              </span>
            </div>
            <span className="text-muted text-sm">
              {atualizado ? <>Atualizado às {atualizado.toLocaleTimeString('pt-BR')}</> : ''}
            </span>
          </div>
          <div className="row wrap" style={{ gap: 16, alignItems: 'center' }}>
            <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mostrarRotas}
                onChange={(e) => setMostrarRotas(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm" style={{ fontWeight: 600 }}>Mostrar rotas</span>
            </label>

            {mostrarRotas && (
              <>
                <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={corPorEntregador}
                    onChange={(e) => setCorPorEntregador(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-sm">Cor por entregador</span>
                </label>

                {!corPorEntregador && (
                  <label className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span className="text-sm">Cor:</span>
                    <div className="row" style={{ gap: 5 }}>
                      {['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#ec4899'].map((c) => (
                        <button
                          key={c}
                          onClick={() => setCorRota(c)}
                          title={c}
                          style={{
                            width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (corRota === c ? '#fff' : 'transparent'),
                            background: c, cursor: 'pointer', padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </label>
                )}

                <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dashedRota}
                    onChange={(e) => setDashedRota(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-sm">Tracejada</span>
                </label>
              </>
            )}

            <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm">Auto (15s)</span>
            </label>
          </div>
        </div>

        <div className="card map-card">
          <MapContainer
            key={`map-r-${rotasVersao}`}
            center={centro}
            zoom={14}
            scrollWheelZoom
            style={{ height: 'calc(100vh - 220px)', minHeight: 520, width: '100%' }}
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {alvo && selecionadoId != null ? (
              <FitBounds
                pontos={[
                  alvo,
                  ...(rotas
                    .find((r) => r.entregador.id === selecionadoId)
                    ?.destinos?.filter((d) => d.lat != null && d.lng != null)
                    .map((d) => [parseFloat(d.lat), parseFloat(d.lng)]) || []),
                ]}
              />
            ) : (
              <FlyTo pos={alvo} />
            )}

            {/* Marcadores das vendas (clientes) */}
            {vendasComLocalizacao.map((v) => {
              const lat = parseFloat(v.lat)
              const lng = parseFloat(v.lng)
              return (
                <Marker
                  key={`venda-${v.id}`}
                  position={[lat, lng]}
                  icon={vendaIcon()}
                  eventHandlers={{ click: () => setSelecionadoId(null) }}
                >
                  <Popup>
                    <div style={{ minWidth: 220, maxWidth: 280, fontSize: 12, lineHeight: 1.5 }}>
                      <div className="row space-between" style={{ gap: 10, alignItems: 'baseline' }}>
                        <strong style={{ fontSize: 13 }}>{v.cliente}</strong>
                        <span className="text-muted">#{v.id}</span>
                      </div>
                      {(v.endereco || v.cidade) && (
                        <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <MapPin size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                          {v.endereco}{v.endereco && (v.cidade || v.uf) ? ' — ' : ''}{v.cidade}{v.uf ? `/${v.uf}` : ''}
                        </div>
                      )}
                      <div style={{ marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Truck size={11} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        → {entregadorPorPedido[v.id] || 'Sem entregador'}
                      </div>
                      <div className="row space-between" style={{ marginTop: 3 }}>
                        {v.valor != null ? (
                          <span className="fw-700" style={{ color: 'var(--success)' }}>{formatBRL(v.valor)}</span>
                        ) : <span />}
                        <span className="text-muted" style={{ fontSize: 11 }}>⬤ {lat.toFixed(4)}, {lng.toFixed(4)}</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}

            {comLocalizacao.map((d, i) => {
              const loc = d.localizacao
              const lat = parseFloat(loc.lat)
              const lng = parseFloat(loc.lng)
              const online = statusOnline(d)
              const cores = ['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171']
              const cor = cores[i % cores.length]

              return (
                <div key={d.entregador.id}>
                  <CircleMarker
                    center={[lat, lng]}
                    radius={18}
                    pathOptions={{ color: cor, fillColor: cor, fillOpacity: 0.15, weight: 2 }}
                  />
                  <AutoOpenMarker
                    position={[lat, lng]}
                    icon={customIcon(cor)}
                    aberto={selecionadoId === d.entregador.id}
                  >
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <strong>{d.entregador.nome}</strong>
                        <div className="text-sm" style={{ color: online ? 'var(--success)' : 'var(--danger)' }}>
                          {online ? '● Online' : '● Offline'}
                        </div>
                        <div className="text-sm">Telefone: {d.entregador.telefone || '—'}</div>
                        <div className="text-sm">Última posição: {formatDate(loc.criado_em)}</div>
                        <div className="text-sm">Lat: {lat.toFixed(6)} / Lng: {lng.toFixed(6)}</div>
                      </div>
                    </Popup>
                  </AutoOpenMarker>
                </div>
              )
            })}

            {/* Rotas: liga cada entregador às suas entregas geolocalizadas */}
            {mostrarRotas &&
              rotas.map((rota) => {
                const ent = rota.entregador
                const loc = rota.localizacao
                if (!loc || loc.lat == null || loc.lng == null) return null
                const origem = [parseFloat(loc.lat), parseFloat(loc.lng)]
                const cores = ['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171']
                const indice = dados.findIndex((d) => d.entregador.id === ent.id)
                const corEnt = cores[(indice >= 0 ? indice : 0) % cores.length]
                // Cor da rota: por entregador (cada um com a cor do marker) ou a cor global escolhida
                const rotaCor = corPorEntregador ? corEnt : corRota
                return rota.destinos
                  .filter((dest) => dest.lat != null && dest.lng != null)
                  .map((dest) => {
                    // Usa a rota real por estradas (OSRM) se houver, senão linha reta
                    const positions = dest.rota && dest.rota.length > 1
                      ? dest.rota.map((p) => [parseFloat(p[0]), parseFloat(p[1])])
                      : [origem, [parseFloat(dest.lat), parseFloat(dest.lng)]]
                    return (
                      <Polyline
                        key={`rota-${ent.id}-${dest.entrega_id ?? dest.pedido_id}-v${rotasVersao}`}
                        positions={positions}
                        pathOptions={{ color: rotaCor, weight: 3, opacity: 0.8, dashArray: dashedRota ? '6 8' : undefined }}
                      />
                    )
                  })
              })}
          </MapContainer>
        </div>
      </div>
    </>
  )
}