import { useEffect, useState } from 'react'
import api from '../api/client'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { formatBRL, formatDate } from './utils'
import { X, MapPin, Edit3, UserCheck, Truck, Save } from 'lucide-react'

const vendaIcon = () =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">🏪</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })

export function VendaModal({ pedido, onClose, onSalvo }) {
  const [detalhe, setDetalhe] = useState(null)
  const [entregadores, setEntregadores] = useState([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState(null)
  const [entregadorId, setEntregadorId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvandoStatus, setSalvandoStatus] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [vinculo, setVinculo] = useState(null)

  // Carrega o vínculo de entrega da venda (atualiza o estado)
  const carregarVinculo = async () => {
    try {
      const vinRes = await api.get(`/entregas/pedido/${pedido.id}/vinculo`)
      const vin = vinRes.data.dados
      setVinculo(vin || null)
      // Se a venda já estiver atribuída a um entregador, pré-seleciona
      if (vin && vin.entregador_id != null) {
        setEntregadorId(String(vin.entregador_id))
      }
      return vin || null
    } catch (e) {
      console.error(e)
      return null
    }
  }

  // Carrega detalhes + geolocalização, lista de entregadores e vínculo existente
  useEffect(() => {
    async function load() {
      try {
        const [geoRes, entRes] = await Promise.all([
          api.get(`/vendas/pedidos/${pedido.id}/geo`),
          api.get('/entregas/entregadores'),
        ])
        setDetalhe(geoRes.data.dados)
        setForm(geoRes.data.dados)
        setEntregadores(entRes.data.dados || [])
        await carregarVinculo()
      } catch (e) {
        console.error(e)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id])

  const mudarCampo = (chave, valor) => setForm((f) => ({ ...f, [chave]: valor }))

  const statusAtual = vinculo?.entrega?.status || form?.status || 'pendente'

  const salvarEdicao = async () => {
    setSalvando(true)
    setAviso(null)
    try {
      const payload = {
        nome: form.nome,
        produto: form.produto,
        whatsapp: form.whatsapp,
        endereco: form.endereco,
        cep: form.cep,
        cidade: form.cidade,
        uf: form.uf,
        pagamento: form.pagamento,
        valor: form.valor != null ? parseFloat(form.valor) : undefined,
        status: form.status,
      }
      await api.put(`/vendas/pedidos/${pedido.id}`, payload)
      setEditando(false)
      setAviso({ tipo: 'sucesso', msg: 'Pedido atualizado com sucesso.' })
      window.dispatchEvent(new Event('vendas:atualizado'))
      if (onSalvo) onSalvo()
    } catch (e) {
      setAviso({ tipo: 'erro', msg: 'Erro ao salvar: ' + (e.response?.data?.detail || e.message) })
    } finally {
      setSalvando(false)
    }
  }

  const atribuirEntregador = async () => {
    if (!entregadorId) return
    setSalvando(true)
    setAviso(null)
    const v = form.valor != null ? parseFloat(form.valor) : 0
    try {
      await api.post('/entregas', {
        entregador_id: parseInt(entregadorId),
        pedido_id: pedido.id,
        pedido_descricao: form.produto || '',
        cliente_nome: form.nome || '',
        cliente_endereco: form.endereco || '',
        cliente_cidade: form.cidade || '',
        cliente_uf: form.uf || '',
        cliente_cep: form.cep || '',
        valor_total: Number.isFinite(v) ? v : 0,
      })
      setAviso({ tipo: 'sucesso', msg: 'Venda atribuída ao entregador e criada como entrega.' })
      setEntregadorId('')
      // Recarrega o vínculo para liberar os status de entrega no combobox
      await carregarVinculo()
      window.dispatchEvent(new Event('vendas:atualizado'))
      if (onSalvo) onSalvo()
    } catch (e) {
      const detail = e.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d?.msg || JSON.stringify(d)).join('; ')
        : (detail || e.message)
      setAviso({ tipo: 'erro', msg: 'Erro ao atribuir: ' + msg })
    } finally {
      setSalvando(false)
    }
  }

  if (!detalhe || !form) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg">
          <button className="modal-close" onClick={onClose} title="Fechar">✕</button>
          <div className="loading">Carregando venda...</div>
        </div>
      </div>
    )
  }

  const lat = detalhe.lat != null ? parseFloat(detalhe.lat) : null
  const lng = detalhe.lng != null ? parseFloat(detalhe.lng) : null
  const centro = lat && lng ? [lat, lng] : [-23.5505, -46.6333]

  // Atualiza o status rápido. Decide pela situação local (combobox + vínculo já carregado),
// sem reconsultar o backend para não atrasar o salvamento.
  const salvarStatus = async (novoStatus) => {
    setSalvandoStatus(true)
    setAviso(null)
    try {
      if (vinculo?.entrega?.id != null) {
        // Já existe entrega vinculada → atualiza o status da entrega
        await api.post(`/entregas/${vinculo.entrega.id}/status`, {}, { params: { status_entrega: novoStatus } })
      } else if (entregadorId) {
        // Entregador selecionado no combobox mas entrega ainda não criada → cria e aplica o status
        const v = form.valor != null ? parseFloat(form.valor) : 0
        const r = await api.post('/entregas', {
          entregador_id: parseInt(entregadorId),
          pedido_id: pedido.id,
          pedido_descricao: form.produto || '',
          cliente_nome: form.nome || '',
          cliente_endereco: form.endereco || '',
          cliente_cidade: form.cidade || '',
          cliente_uf: form.uf || '',
          cliente_cep: form.cep || '',
          valor_total: Number.isFinite(v) ? v : 0,
        })
        const entregaId = r.data.dados?.id
        if (entregaId) {
          await api.post(`/entregas/${entregaId}/status`, {}, { params: { status_entrega: novoStatus } })
          setVinculo({ entrega: { id: entregaId, status: novoStatus }, entregador_id: parseInt(entregadorId) })
        }
      } else {
        // Sem entregador → venda sem entrega; o backend valida se o status exige entrega
        await api.put(`/vendas/pedidos/${pedido.id}`, { status: novoStatus })
      }
      setForm((f) => ({ ...f, status: novoStatus }))
      // Mantém o vínculo sincronizado (statusAtual prioriza vinculo.entrega.status)
      setVinculo((v) => (v?.entrega ? { ...v, entrega: { ...v.entrega, status: novoStatus } } : v))
      setAviso({ tipo: 'sucesso', msg: 'Status atualizado para "' + novoStatus + '".' })
      window.dispatchEvent(new Event('vendas:atualizado'))
      if (onSalvo) onSalvo()
    } catch (e) {
      const detail = e.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d?.msg || JSON.stringify(d)).join('; ')
        : (detail || e.message)
      setAviso({ tipo: 'erro', msg: 'Erro ao salvar status: ' + msg })
    } finally {
      setSalvandoStatus(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>

        <div className="row space-between" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>
            Venda #{pedido.id} — {form.nome || 'Cliente'}
          </h3>
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

          {/* Coluna esquerda: mapa + detalhes */}
          <div>
            <div className="modal-map">
              <MapContainer center={centro} zoom={lat && lng ? 15 : 11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                {lat && lng && (
                  <Marker position={[lat, lng]} icon={vendaIcon()}>
                    <Popup>
                      <strong>{form.nome}</strong>
                      <div className="text-sm">{form.endereco}</div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            {!lat || !lng ? (
              <div className="text-muted text-sm" style={{ marginTop: 10 }}>
                <MapPin size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Endereço não geolocalizado automaticamente.
              </div>
            ) : null}

            {/* Detalhes (modo leitura) */}
            {!editando ? (
              <div style={{ marginTop: 16 }}>
                <div className="venda-field"><span className="venda-label">Produto</span><span>{form.produto}</span></div>
                <div className="venda-field"><span className="venda-label">WhatsApp</span><span>{form.whatsapp}</span></div>
                <div className="venda-field"><span className="venda-label">Endereço</span><span>{form.endereco}</span></div>
                {form.cidade && <div className="venda-field"><span className="venda-label">Cidade</span><span>{form.cidade} {form.uf ? `- ${form.uf}` : ''}</span></div>}
                {form.cep && <div className="venda-field"><span className="venda-label">CEP</span><span>{form.cep}</span></div>}
                <div className="venda-field"><span className="venda-label">Pagamento</span><span>{form.pagamento}</span></div>
                <div className="venda-field"><span className="venda-label">Valor</span><span className="fw-700">{formatBRL(form.valor)}</span></div>
                <div className="venda-field"><span className="venda-label">Status</span><span>{form.status || 'pendente'}</span></div>
                <div className="venda-field"><span className="venda-label">Data</span><span>{formatDate(form.criado_em)}</span></div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <label>Produto</label>
                <input className="input" value={form.produto || ''} onChange={(e) => mudarCampo('produto', e.target.value)} style={{ marginBottom: 10 }} />
                <label>Cliente</label>
                <input className="input" value={form.nome || ''} onChange={(e) => mudarCampo('nome', e.target.value)} style={{ marginBottom: 10 }} />
                <label>WhatsApp</label>
                <input className="input" value={form.whatsapp || ''} onChange={(e) => mudarCampo('whatsapp', e.target.value)} style={{ marginBottom: 10 }} />
                <label>Endereço</label>
                <input className="input" value={form.endereco || ''} onChange={(e) => mudarCampo('endereco', e.target.value)} style={{ marginBottom: 10 }} />
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label>Cidade</label>
                    <input className="input" value={form.cidade || ''} onChange={(e) => mudarCampo('cidade', e.target.value)} style={{ marginBottom: 10 }} />
                  </div>
                  <div style={{ width: 70 }}>
                    <label>UF</label>
                    <input className="input" value={form.uf || ''} onChange={(e) => mudarCampo('uf', e.target.value)} style={{ marginBottom: 10 }} />
                  </div>
                </div>
                <label>CEP</label>
                <input className="input" value={form.cep || ''} onChange={(e) => mudarCampo('cep', e.target.value)} style={{ marginBottom: 10 }} />
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label>Pagamento</label>
                    <input className="input" value={form.pagamento || ''} onChange={(e) => mudarCampo('pagamento', e.target.value)} style={{ marginBottom: 10 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Valor (R$)</label>
                    <input className="input" type="number" step="0.01" value={form.valor ?? ''} onChange={(e) => mudarCampo('valor', e.target.value)} style={{ marginBottom: 10 }} />
                  </div>
                </div>
                <label>Status</label>
                <select className="input" value={form.status || 'pendente'} onChange={(e) => mudarCampo('status', e.target.value)} style={{ marginBottom: 12 }}>
                  <option value="pendente">Pendente</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="em_transito">Em trânsito</option>
                  <option value="aceita">Aceita</option>
                  <option value="entregue">Entregue</option>
                  <option value="cancelada">Cancelada (entrega)</option>
                  <option value="cancelado">Cancelado</option>
                  <option value="pago">Pago</option>
                </select>

                <div className="row" style={{ gap: 10 }}>
                  <button className="btn btn-primary" onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? 'Guardando...' : <Save size={16} />}
                    Salvar alterações
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setEditando(false); setForm(detalhe) }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita: ações */}
          <div>
            <div className="card" style={{ background: 'transparent', marginBottom: 14 }}>
              <div className="card-title">
                <Edit3 size={16} />
                Editar venda
              </div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                Alterar os dados do pedido (produto, cliente, endereço, valor, status).
              </p>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setEditando((v) => !v)}>
                <Edit3 size={16} />
                {editando ? 'Fechar edição' : 'Editar venda'}
              </button>
            </div>

            <div className="card" style={{ background: 'transparent' }}>
              <div className="card-title">
                <UserCheck size={16} />
                Entregador
              </div>
              <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                Atribuir esta venda a um entregador. Isso cria uma entrega para o motorista.
              </p>
              <select className="input" value={entregadorId} onChange={(e) => setEntregadorId(e.target.value)} style={{ marginBottom: 12 }}>
                <option value="">Selecione o entregador...</option>
                {entregadores.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              {entregadorId ? (
                <div className="text-sm" style={{ marginBottom: 12, color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Atribuída a {entregadores.find((e) => String(e.id) === String(entregadorId))?.nome || 'este entregador'}
                </div>
              ) : (
                <div className="text-sm" style={{ marginBottom: 12, color: 'var(--text-muted)' }}>
                  Esta venda ainda não tem entregador atribuído.
                </div>
              )}
              <button className="btn btn-success" style={{ width: '100%' }} onClick={atribuirEntregador} disabled={!entregadorId || salvando}>
                <Truck size={16} />
                Atribuir entregador
              </button>

              {/* Status rápido (salva direto no onChange) */}
              <div style={{ marginTop: 16 }}>
                <div className="card-title" style={{ marginBottom: 8 }}>
                  <span>Status da venda</span>
                </div>
                {salvandoStatus ? (
                  <div className="text-sm text-muted" style={{ padding: '8px 2px' }}>Salvando status...</div>
                ) : (
                  <select
                    className="input"
                    value={statusAtual}
                    disabled={salvando}
                    onChange={(e) => salvarStatus(e.target.value)}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="em_transito">Em trânsito</option>
                    <option value="aceita">Aceita</option>
                    <option value="entregue">Entregue</option>
                    <option value="cancelada">Cancelada (entrega)</option>
                    <option value="cancelado">Cancelado</option>
                    <option value="pago">Pago</option>
                  </select>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}