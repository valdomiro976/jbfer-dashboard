import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, CircleMarker, Polyline, useMap } from 'react-leaflet'
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

// Marker da loja
const lojaIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">🏢</div>`,
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

// Marker numerado da rota otimizada
const numeroIcon = (n) =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#1d4ed8;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })

// Marker para os destinos das rotas (entregas) — diferente das vendas
const destinoIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#0d9488;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">📦</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -15],
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

function OpenPopupOnSelect({ selecionadoId, dados }) {
  const map = useMap()
  const lastId = useRef(null)
  useEffect(() => {
    if (!selecionadoId) return
    const d = dados.find((dd) => dd && dd.entregador && dd.entregador.id === selecionadoId && dd.localizacao)
    if (!d || !d.localizacao) return
    const pos = [parseFloat(d.localizacao.lat), parseFloat(d.localizacao.lng)]
    const nome = d.entregador.nome || 'Entregador'
    const tel = d.entregador.telefone || '—'
    const loc = d.localizacao
    const status = loc ? (statusOnline(d) ? 'Online' : 'Offline') : ''
    const ultima = loc ? formatDate(loc.criado_em) : ''
    const vel = loc && loc.velocidade != null ? `${Number(loc.velocidade).toFixed(1)} km/h` : '—'
    const html = `<div style="min-width:180px"><strong>${nome}</strong>${status ? `<div style="font-size:12px;margin:2px 0">${status}</div>` : ''}<div style="font-size:12px">Telefone: ${tel}</div>${ultima ? `<div style="font-size:12px">Ultima posicao: ${ultima}</div>` : ''}<div style="font-size:12px">Velocidade: ${vel}</div></div>`
    const popup = L.popup({ autoClose: true, closeOnClick: true })
    popup.setContent(html)
    lastId.current = selecionadoId
    setTimeout(() => {
      try { map.openPopup(popup, pos) } catch (e) { console.error(e) }
    }, 300)
  }, [selecionadoId, dados, map])
  return null
}

// Centraliza o mapa na posição do entregador selecionado (só quando muda)
function FlyTo({ pos, selecionadoId }) {
  const map = useMap()
  const lastSelectedRef = useRef(null)
  useEffect(() => {
    if (!pos || !selecionadoId) return
    // Só voa quando o entregador selecionado MUDA (não quando a posição muda)
    if (lastSelectedRef.current === selecionadoId) return
    lastSelectedRef.current = selecionadoId
    map.flyTo(pos, 15, { duration: 1 })
  }, [selecionadoId, pos, map])
  return null
}

function PopupOpener({ position, entregador }) {
  const map = useMap()
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    const nome = entregador?.entregador?.nome || 'Entregador'
    const tel = entregador?.entregador?.telefone || '—'
    const loc = entregador?.localizacao
    const status = loc ? (statusOnline(entregador) ? '● Online' : '● Offline') : ''
    const ultima = loc ? formatDate(loc.criado_em) : ''
    const vel = loc && loc.velocidade != null ? `${Number(loc.velocidade).toFixed(1)} km/h` : '—'
    const html = `<div style="min-width:180px"><strong>${nome}</strong>${status ? `<div style="font-size:12px;margin:2px 0;color:${status.includes('Online') ? '#34d399' : '#f87171'}">${status}</div>` : ''}<div style="font-size:12px">Telefone: ${tel}</div>${ultima ? `<div style="font-size:12px">Última posição: ${ultima}</div>` : ''}<div style="font-size:12px">Velocidade: ${vel}</div></div>`
    const popup = L.popup({ autoClose: true, closeOnClick: true })
    popup.setContent(html)
    map.openPopup(popup, position)
  }, [map, position])
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
  const [loja, setLoja] = useState(null)
  const [popupEntregador, setPopupEntregador] = useState(null)
  const [rotas, setRotas] = useState([])
  const [rotasVersao, setRotasVersao] = useState(0)
  const [otimizada, setOtimizada] = useState(null)
  const [otimizando, setOtimizando] = useState(false)
  const [otimId, setOtimId] = useState('')
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
    if (v) { setSelecionadoId(Number(v)); setPopupEntregador(Number(v)) }
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

  // Otimiza a ordem de visita das entregas ativas do entregador
  const otimizarRota = async () => {
    if (!otimId) return
    const rota = rotas.find((r) => r.entregador.id === Number(otimId))
    const ids = (rota?.destinos || [])
      .filter((d) => d.entrega_id != null && !['entregue', 'cancelada'].includes(d.status))
      .map((d) => d.entrega_id)
    if (!ids.length) {
      setOtimizada({ erro: 'Sem entregas ativas para este entregador.' })
      return
    }
    setOtimizando(true)
    try {
      const { data } = await api.post(
        '/entregas/rota-otimizada',
        { entregador_id: Number(otimId), entrega_ids: ids },
        { timeout: 120000 },
      )
      setOtimizada(data.dados)
    } catch (e) {
      console.error('Erro ao otimizar rota:', e)
      setOtimizada({ erro: 'Falha ao otimizar a rota.' })
    } finally {
      setOtimizando(false)
    }
  }

  useEffect(() => {
    load()
    loadVendas()
    loadRotas()
    api.get('/vendas/loja').then(({ data }) => {
      if (data.dados && data.dados.lat != null && data.dados.lng != null) setLoja(data.dados)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 15000)
      return () => clearInterval(intervalRef.current)
    }
  }, [autoRefresh])

  // Abre popup do entregador selecionado no menu (uma vez por selecao)
  const lastPopupId = useRef(null)
  useEffect(() => {
    if (!selecionadoId) { lastPopupId.current = null; return }
    if (lastPopupId.current === selecionadoId) return
    lastPopupId.current = selecionadoId
    const d = dados.find((dd) => dd && dd.entregador && dd.entregador.id === selecionadoId && dd.localizacao)
    if (!d || !d.localizacao) return
    const pos = [parseFloat(d.localizacao.lat), parseFloat(d.localizacao.lng)]
    const nome = d.entregador.nome || 'Entregador'
    const tel = d.entregador.telefone || '—'
    const loc = d.localizacao
    const status = loc ? (statusOnline(d) ? '● Online' : '● Offline') : ''
    const ultima = loc ? formatDate(loc.criado_em) : ''
    const vel = loc && loc.velocidade != null ? `${Number(loc.velocidade).toFixed(1)} km/h` : '—'
    const html = `<div style="min-width:180px"><strong>${nome}</strong>${status ? `<div style="font-size:12px;margin:2px 0;color:${status.includes('Online') ? '#34d399' : '#f87171'}">${status}</div>` : ''}<div style="font-size:12px">Telefone: ${tel}</div>${ultima ? `<div style="font-size:12px">Ultima posicao: ${ultima}</div>` : ''}<div style="font-size:12px">Velocidade: ${vel}</div></div>`
    const timer = setTimeout(() => {
      try {
        if (mapRef.current) {
          const popup = L.popup({ autoClose: true, closeOnClick: true })
          popup.setContent(html)
          mapRef.current.openPopup(popup, pos)
        }
      } catch (e) { console.error(e) }
    }, 500)
    return () => clearTimeout(timer)
  }, [selecionadoId, dados])

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

            <select
              value={otimId}
              onChange={(e) => setOtimId(e.target.value)}
              title="Entregador para otimizar a rota"
              style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border, #ccc)', background: 'var(--card, #fff)' }}
            >
              <option value="">Entregador p/ rota…</option>
              {comLocalizacao.map((d) => (
                <option key={d.entregador.id} value={d.entregador.id}>{d.entregador.nome}</option>
              ))}
            </select>
            <button
              onClick={otimizarRota}
              disabled={!otimId || otimizando}
              title="Calcula a ordem mais curta de visita"
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: (!otimId || otimizando) ? '#999' : '#1d4ed8', color: '#fff', fontWeight: 700, cursor: (!otimId || otimizando) ? 'default' : 'pointer' }}
            >
              {otimizando ? 'Otimizando…' : 'Otimizar rota'}
            </button>

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

        {otimizada && !otimizada.erro && (
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div className="row space-between wrap" style={{ gap: 10, alignItems: 'center' }}>
              <strong>Rota otimizada — {otimizada.distancia_km} km{otimizada.km_roteada === false ? ' (linha reta)' : ''}</strong>
              <button
                onClick={() => setOtimizada(null)}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border, #ccc)', background: 'transparent', cursor: 'pointer' }}
              >
                Limpar
              </button>
            </div>
            <ol style={{ margin: '8px 0 0', paddingLeft: 22 }}>
              {(otimizada.ordem || []).map((p) => (
                <li key={p.entrega_id} style={{ marginBottom: 4, fontSize: 13 }}>
                  <strong>{p.cliente}</strong>{p.endereco ? ` — ${p.endereco}` : ''} <span className="text-muted">(+{p.km_etapa} km da anterior)</span>
                </li>
              ))}
            </ol>
            {(otimizada.nao_geolocalizadas || []).length > 0 && (
              <div className="text-sm" style={{ color: 'var(--warning)', marginTop: 6 }}>
                Sem localização (fora da rota): entregas {otimizada.nao_geolocalizadas.join(', ')}
              </div>
            )}
          </div>
        )}
        {otimizada && otimizada.erro && (
          <div className="card" style={{ marginBottom: 16, padding: 12, color: 'var(--danger)' }}>
            {otimizada.erro} <button onClick={() => setOtimizada(null)} style={{ marginLeft: 8, cursor: 'pointer' }}>OK</button>
          </div>
        )}

        <div className="card map-card">
          <MapContainer
            key={`map-r-${rotasVersao}`}
            center={centro}
            zoom={14}
            scrollWheelZoom
            style={{ height: 'calc(100vh - 220px)', minHeight: 520, width: '100%' }}
          >
            <OpenPopupOnSelect selecionadoId={selecionadoId} dados={dados} />
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {null}

            {/* Popup do entregador selecionado no menu */}
            {null}

            {/* Centraliza no entregador selecionado no menu (apenas quando muda) */}
            <FlyTo pos={alvo} selecionadoId={selecionadoId} />

            {/* Marker da loja */}
            {loja && loja.lat != null && loja.lng != null && (
              <Marker position={[parseFloat(loja.lat), parseFloat(loja.lng)]} icon={lojaIcon()}>
                <Tooltip permanent direction="top" offset={[0, -18]}>
                  Loja
                </Tooltip>
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <strong>Loja</strong>
                    {loja.endereco ? <div>{loja.endereco}</div> : null}
                    {loja.cidade ? <div>{loja.cidade}{loja.uf ? `/${loja.uf}` : ''}</div> : null}
                  </div>
                </Popup>
              </Marker>
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
                  <Tooltip permanent direction="top" offset={[0, -16]}>
                    {v.cliente}
                  </Tooltip>
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
                    <Tooltip permanent direction="top" offset={[0, -18]}>
                      {d.entregador.nome}
                    </Tooltip>
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <strong>{d.entregador.nome}</strong>
                        <div className="text-sm" style={{ color: online ? 'var(--success)' : 'var(--danger)' }}>
                          {online ? '● Online' : '● Offline'}
                        </div>
                        <div className="text-sm">Telefone: {d.entregador.telefone || '—'}</div>
                        <div className="text-sm">Última posição: {formatDate(loc.criado_em)}</div>
                        <div className="text-sm">Velocidade: {loc.velocidade != null ? `${Number(loc.velocidade).toFixed(1)} km/h` : '—'}</div>
                      </div>
                    </Popup>
                  </AutoOpenMarker>
                </div>
              )
            })}

            {/* Rotas: liga cada entregador às suas entregas geolocalizadas.
                Escondidas enquanto a otimizada está ativa (evita duplicar). */}
            {mostrarRotas && (!otimizada || otimizada.erro) &&
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
                    const dlat = parseFloat(dest.lat)
                    const dlng = parseFloat(dest.lng)
                    return (
                      <div key={`rota-${ent.id}-${dest.entrega_id ?? dest.pedido_id}-v${rotasVersao}`}>
                        <Polyline
                          positions={positions}
                          pathOptions={{ color: rotaCor, weight: 3, opacity: 0.8, dashArray: dashedRota ? '6 8' : undefined }}
                        />
                        <Marker position={[dlat, dlng]} icon={destinoIcon()}>
                          <Tooltip permanent direction="top" offset={[0, -15]}>
                            {dest.cliente || 'Entrega'}
                          </Tooltip>
                          <Popup>
                            <div style={{ fontSize: 12 }}>
                              <strong>{dest.cliente || 'Entrega'}</strong>
                              {dest.endereco ? <div>{dest.endereco}{dest.cidade ? ` — ${dest.cidade}` : ''}{dest.uf ? `/${dest.uf}` : ''}</div> : null}
                              <div className="text-muted">→ {ent.nome} · {dest.status || 'pendente'}</div>
                            </div>
                          </Popup>
                        </Marker>
                      </div>
                    )
                  })
              })}

            {/* Rota otimizada: trajeto único na ordem calculada */}
            {otimizada && !otimizada.erro && (otimizada.geometria || []).length > 1 && (
              <Polyline
                key={`otim-${(otimizada.ordem || []).map((p) => p.entrega_id).join('-')}`}
                positions={otimizada.geometria.map((p) => [parseFloat(p[0]), parseFloat(p[1])])}
                pathOptions={{ color: '#1d4ed8', weight: 6, opacity: 0.95 }}
              />
            )}
            {(otimizada && !otimizada.erro ? otimizada.ordem || [] : []).map((p) => (
              p.lat != null && p.lng != null ? (
                <Marker key={`otim-${p.entrega_id}`} position={[parseFloat(p.lat), parseFloat(p.lng)]} icon={numeroIcon(p.n)}>
                  <Popup>
                    <div style={{ fontSize: 12 }}>
                      <strong>{p.n}) {p.cliente}</strong>
                      {p.endereco ? <div>{p.endereco}</div> : null}
                      <div className="text-muted">{p.km_etapa} km da parada anterior</div>
                    </div>
                  </Popup>
                </Marker>
              ) : null
            ))}
          </MapContainer>
        </div>
      </div>
    </>
  )
}