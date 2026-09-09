import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatBRL, formatDate } from '../components/utils'
import { VendaModal } from '../components/VendaModal'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Search, Download, Eye, Map as MapIcon, ChevronDown, Truck, Store, MapPin, Pencil, Route as RouteIcon } from 'lucide-react'

const vendaIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;">🏪</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })

const entregadorIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">🚚</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  })

function FlyTo({ pos }) {
  const map = useMap()
  const lastRef = useRef(null)
  useEffect(() => {
    if (!pos) return
    const key = pos[0].toFixed(6) + ',' + pos[1].toFixed(6)
    if (lastRef.current === key) return
    lastRef.current = key
    map.flyTo(pos, 15, { duration: 0.8 })
  }, [pos, map])
  return null
}

// Enquadra múltiplos pontos (marcadores) no mapa, mostrando todos com margem
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
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, duration: 0.8 })
    } catch { /* ignora bounds inválidos */ }
  }, [pontos, map])
  return null
}

// Marker que abre o popup automaticamente ao montar
function MarkerAutoPopup({ position, icon, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const tries = setInterval(() => {
      if (ref.current) {
        clearInterval(tries)
        ref.current.openPopup()
      }
    }, 120)
    const stop = setTimeout(() => clearInterval(tries), 8000)
    return () => { clearInterval(tries); clearTimeout(stop) }
  }, [])
  return (
    <Marker ref={ref} position={position} icon={icon}>
      {children}
    </Marker>
  )
}

export function Vendas() {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [vendaSeleccionada, setVendaSeleccionada] = useState(null)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [vendasGeo, setVendasGeo] = useState([])
  const [rotasEntreg, setRotasEntreg] = useState([])
  const [rotasVersao, setRotasVersao] = useState(0)
  const [selVenda, setSelVenda] = useState(null)
  const [abertos, setAbertos] = useState({})
  const [searchParams] = useSearchParams()
  const [urlVendaId, setUrlVendaId] = useState(null)
  const [geoLoaded, setGeoLoaded] = useState(false)

  // Abre o mapa e guarda o id da venda vinda de ?venda=<id> (submenu do sidebar)
  useEffect(() => {
    const id = searchParams.get('venda')
    if (id) {
      setUrlVendaId(id)
      setMapaAberto(true)
    }
  }, [searchParams])

  // Após vendasGeo carregar, seleciona no mapa ou abre edição se não estiver atribuída
  useEffect(() => {
    if (!urlVendaId) return
    if (!geoLoaded) return

    // Pedidos já atribuídos a um entregador (vêm das rotas)
    const atendidos = new Set()
    rotasEntreg.forEach((r) => {
      ;(r.destinos || []).forEach((d) => {
        if (d.pedido_id != null) atendidos.add(String(d.pedido_id))
      })
    })

    const idStr = String(urlVendaId)
    const atribuida = atendidos.has(idStr)
    const noMapa = vendasGeo.some((v) => String(v.id) === idStr)

    if (atribuida && noMapa) {
      const alvo = vendasGeo.find((v) => String(v.id) === idStr)
      if (alvo) setSelVenda(alvo)
    } else {
      // Não atribuída (ou sem geo) → modo de edição
      const pedido = pedidos.find((p) => String(p.id) === idStr)
      if (pedido) setVendaSeleccionada(pedido)
    }
    setUrlVendaId(null)
  }, [urlVendaId, geoLoaded, vendasGeo, pedidos, rotasEntreg])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get('/vendas/pedidos', { params: { limite: 500 } })
        setPedidos(data.dados)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Dados geográficos: vendas geolocalizadas + rotas dos entregadores
  const loadGeo = async () => {
    try {
      const [geo, rot] = await Promise.all([
        api.get('/vendas/pedidos/geo', { timeout: 90000 }),
        api.get('/entregas/rotas', { timeout: 120000 }),
      ])
      const novasVendas = (geo.data.dados || []).filter((v) => v.lat != null && v.lng != null)
      setVendasGeo(novasVendas)
      setRotasEntreg(rot.data.dados || [])
      setRotasVersao((v) => v + 1)
      setGeoLoaded(true)
      return { vendas: novasVendas }
    } catch (e) {
      console.error('Erro ao carregar dados do mapa:', e)
      setGeoLoaded(true)
      return { vendas: vendasGeo }
    }
  }

  useEffect(() => {
    if (mapaAberto) {
      loadGeo()
    } else {
      setGeoLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaAberto])

  const recargar = async () => {
    try {
      const { data } = await api.get('/vendas/pedidos', { params: { limite: 500 } })
      setPedidos(data.dados)
    } catch (e) {
      console.error(e)
    }
    if (mapaAberto) {
      const { vendas: novasVendas } = await loadGeo()
      // Atualiza a venda selecionada com os dados mais recentes
      setSelVenda((atual) => {
        if (!atual) return atual
        return novasVendas.find((v) => v.id === atual.id) || atual
      })
    }
  }

  const filtrados = pedidos.filter((p) => {
    const termo = busca.toLowerCase()
    const okBusca = !termo || (p.produto || '').toLowerCase().includes(termo) || (p.nome || '').toLowerCase().includes(termo) || String(p.whatsapp || '').includes(termo)
    const okStatus = !status || (p.status || 'pendente') === status
    return okBusca && okStatus
  })

  // ---- Mapa / sanfona ----
  // Índice: pedido_id -> { entregador, destino } a partir das rotas
  const mapaPedidoEntregador = {}
  rotasEntreg.forEach((r) => {
    ;(r.destinos || []).forEach((d) => {
      if (d.pedido_id != null) mapaPedidoEntregador[d.pedido_id] = r
    })
  })

  // Vendas geolocalizadas agrupadas por entregador (para a sanfona)
  const grupos = []
  rotasEntreg.forEach((r) => {
    const vendasDoGrupo = vendasGeo.filter((v) => mapaPedidoEntregador[v.id]?.entregador?.id === r.entregador.id)
    if (vendasDoGrupo.length === 0) return
    grupos.push({ entregador: r.entregador, localizacao: r.localizacao, vendas: vendasDoGrupo })
  })
  const semEntregador = vendasGeo.filter((v) => !mapaPedidoEntregador[v.id])
  if (semEntregador.length > 0) grupos.push({ entregador: null, localizacao: null, vendas: semEntregador })

  // Entrega selecionada: venda + rota do seu entregador
  const selInfo = selVenda ? mapaPedidoEntregador[selVenda.id] : null
  const rotaSelecionada = selInfo
    ? (selInfo.destinos.find((d) => d.pedido_id === selVenda.id)?.rota || null)
    : null
  const rotaPos = rotaSelecionada && rotaSelecionada.length > 1
    ? rotaSelecionada.map((p) => [parseFloat(p[0]), parseFloat(p[1])])
    : null
  const centroMapa = (() => {
    if (selVenda) return [parseFloat(selVenda.lat), parseFloat(selVenda.lng)]
    if (grupos[0]?.localizacao) return [parseFloat(grupos[0].localizacao.lat), parseFloat(grupos[0].localizacao.lng)]
    if (vendasGeo[0]) return [parseFloat(vendasGeo[0].lat), parseFloat(vendasGeo[0].lng)]
    return [-23.5505, -46.6333]
  })()

  const exportarCSV = () => {
    const headers = ['ID', 'Produto', 'Cliente', 'WhatsApp', 'Valor', 'Pagamento', 'Status', 'Data']
    const linhas = filtrados.map((p) => [
      p.id,
      `"${p.produto || ''}"`,
      `"${p.nome || ''}"`,
      p.whatsapp,
      p.valor,
      p.pagamento,
      p.status || 'pendente',
      p.criado_em,
    ].join(';'))
    const csv = '\uFEFF' + [headers.join(';'), ...linhas].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pedidos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Loader />

  const statusBadge = (s) => {
    const map = {
      pendente: <span className="badge badge-warning">Pendente</span>,
      em_andamento: <span className="badge badge-primary">Em andamento</span>,
      entregue: <span className="badge badge-success">Entregue</span>,
      cancelado: <span className="badge badge-danger">Cancelado</span>,
      pago: <span className="badge badge-success">Pago</span>,
    }
    return map[s] || <span className="badge badge-primary">{s}</span>
  }

  return (
    <>
      <Topbar title="Vendas e Pedidos" subtitle="Histórico completo de pedidos" />

      <div className="content animate-in">
        <div className="row space-between wrap" style={{ marginBottom: 20 }}>
          <div className="row" style={{ flex: 1, maxWidth: 480 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Buscar por produto, cliente ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
            </div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 180 }}>
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="entregue">Entregue</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => setMapaAberto(!mapaAberto)}>
            <MapIcon size={16} />
            {mapaAberto ? 'Esconder mapa' : 'Mapa de vendas'}
          </button>
          <button className="btn btn-success" onClick={exportarCSV}>
            <Download size={16} />
            Exportar CSV
          </button>
        </div>

        {mapaAberto && (
          <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
            <div className="row space-between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', gap: 10 }}>
              <div className="row" style={{ gap: 16 }}>
                <div className="row">
                  <Store size={16} color="var(--accent)" />
                  <span className="fw-700 text-sm">{vendasGeo.length} vendas no mapa</span>
                </div>
                <div className="row">
                  <RouteIcon size={16} color="var(--primary)" />
                  <span className="fw-700 text-sm">{grupos.length} entregadores com rotas</span>
                </div>
              </div>
              <span className="text-muted text-sm">
                {selVenda ? `Venda #${selVenda.id} selecionada` : 'Selecione uma venda na lista ao lado'}
              </span>
            </div>

            <div className="row" style={{ alignItems: 'stretch' }}>
              {/* Sanfona: entregadores -> vendas */}
              <div className="vendas-sanfona">
                {grupos.map((g, gi) => {
                  const aberto = !!abertos[gi]
                  const nome = g.entregador?.nome || 'Sem entregador'
                  const count = g.vendas.length
                  return (
                    <div key={gi} className="acc-group">
                      <button className="acc-head" onClick={() => setAbertos({ ...abertos, [gi]: !aberto })}>
                        {g.entregador ? <Truck size={15} color="var(--primary)" /> : <Store size={15} color="var(--text-muted)" />}
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                        <span className="badge badge-primary">{count}</span>
                        <ChevronDown size={15} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                      </button>
                      {aberto && (
                        <div className="acc-body">
                          {g.vendas.map((v) => (
                            <button
                              key={`v-${v.id}`}
                              className={`acc-item ${selVenda?.id === v.id ? 'active' : ''}`}
                              onClick={() => setSelVenda(selVenda?.id === v.id ? null : v)}
                            >
                              <span className="fw-700">#{v.id}</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente}</span>
                              <span className="text-muted text-sm">{formatBRL(v.valor)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {grupos.length === 0 && <div className="text-muted" style={{ padding: 24, textAlign: 'center' }}>Carregando vendas no mapa...</div>}
              </div>

              {/* Mapa */}
              <div style={{ flex: 1 }}>
                <MapContainer key={`map-v-${rotasVersao}`} center={centroMapa} zoom={14} scrollWheelZoom style={{ height: '60vh', minHeight: 420, width: '100%' }}>
                  <TileLayer
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  {selVenda && (
                    <FitBounds
                      pontos={[
                        [parseFloat(selVenda.lat), parseFloat(selVenda.lng)],
                        ...(selInfo?.localizacao
                          ? [[parseFloat(selInfo.localizacao.lat), parseFloat(selInfo.localizacao.lng)]]
                          : []),
                      ]}
                    />
                  )}

                  {/* Marcador da venda selecionada + rota do entregador */}
                  {selVenda && (
                    <MarkerAutoPopup key={`sel-${selVenda.id}`} position={[parseFloat(selVenda.lat), parseFloat(selVenda.lng)]} icon={vendaIcon()}>
                      <Popup>
                        <div style={{ minWidth: 200, maxWidth: 280, fontSize: 12, lineHeight: 1.5 }}>
                          <div className="row space-between" style={{ gap: 10, alignItems: 'baseline' }}>
                            <strong style={{ fontSize: 13 }}>#{selVenda.id} — {selVenda.cliente}</strong>
                            <div className="row" style={{ gap: 8 }}>
                              {selVenda.valor != null && <span className="fw-700" style={{ color: 'var(--success)' }}>{formatBRL(selVenda.valor)}</span>}
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '2px 6px', minWidth: 'auto', borderRadius: 6 }}
                                title="Editar venda"
                                onClick={() => setVendaSeleccionada({ id: selVenda.id })}
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                          </div>
                          {selVenda.endereco && (
                            <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <MapPin size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                              {selVenda.endereco}
                            </div>
                          )}
                          {selInfo && (
                            <div style={{ marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🚚 {selInfo.entregador.nome}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </MarkerAutoPopup>
                  )}

                  {/* Marcador do entregador da venda selecionada */}
                  {selInfo?.localizacao && (
                    <Marker
                      position={[parseFloat(selInfo.localizacao.lat), parseFloat(selInfo.localizacao.lng)]}
                      icon={entregadorIcon()}
                    >
                      <Popup>
                        <strong>{selInfo.entregador.nome}</strong>
                        <div className="text-sm text-muted">Entregador</div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Rota (por estradas) do entregador até a venda */}
                  {selInfo?.localizacao && rotaPos && (
                    <Polyline
                      key={`rota-v-${selVenda.id}-v${rotasVersao}`}
                      positions={rotaPos}
                      pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.85 }}
                    />
                  )}
                </MapContainer>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>WhatsApp</th>
                  <th>Valor</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id} onClick={() => setVendaSeleccionada(p)} style={{ cursor: 'pointer' }}>
                    <td>#{p.id}</td>
                    <td style={{ maxWidth: 240 }}>{p.produto}</td>
                    <td>{p.nome || '—'}</td>
                    <td className="text-muted">{p.whatsapp}</td>
                    <td className="fw-700">{formatBRL(p.valor)}</td>
                    <td>
                      <span className="badge badge-primary">{p.pagamento || '—'}</span>
                    </td>
                    <td>{statusBadge(p.status)}</td>
                    <td className="text-muted">{formatDate(p.criado_em)}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: 4, minWidth: 'auto' }} onClick={(e) => { e.stopPropagation(); setVendaSeleccionada(p) }}>
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Nenhum pedido encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="text-muted text-sm">Mostrando {filtrados.length} de {pedidos.length} pedidos</span>
        </div>
      </div>

      {vendaSeleccionada && (
        <VendaModal
          pedido={vendaSeleccionada}
          onClose={() => setVendaSeleccionada(null)}
          onSalvo={recargar}
        />
      )}
    </>
  )
}