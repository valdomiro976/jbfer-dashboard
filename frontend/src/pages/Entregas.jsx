import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatBRL, formatDate } from '../components/utils'
import { EntregaModal } from '../components/EntregaModal'
import { Plus, Search, Eye } from 'lucide-react'

const STATUS_COLORS = {
  pendente: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.15)' },
  aceita: { color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' },
  em_transito: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.15)' },
  entregue: { color: 'var(--success)', bg: 'rgba(52,211,153,0.15)' },
  cancelada: { color: 'var(--danger)', bg: 'rgba(248,113,113,0.15)' },
}

export function Entregas() {
  const [entregas, setEntregas] = useState([])
  const [entregadores, setEntregadores] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [modalEntrega, setModalEntrega] = useState(null)

  const [form, setForm] = useState({
    entregador_id: '',
    pedido_id: '',
    pedido_descricao: '',
    cliente_nome: '',
    cliente_endereco: '',
    valor_total: 0,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [e1, e2, e3] = await Promise.all([
        api.get('/entregas'),
        api.get('/entregas/entregadores'),
        api.get('/vendas/pedidos', { params: { limite: 200 } }),
      ])
      setEntregas(e1.data.dados)
      setEntregadores(e2.data.dados)
      setPedidos(e3.data.dados)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtradas = entregas.filter((en) => {
    const t = busca.toLowerCase()
    const okBusca = !t || (en.cliente_nome || '').toLowerCase().includes(t) || (en.cliente_endereco || '').toLowerCase().includes(t) || (en.pedido_descricao || '').toLowerCase().includes(t)
    const okStatus = !statusFiltro || en.status === statusFiltro
    return okBusca && okStatus
  })

  const criarEntrega = async () => {
    try {
      const entregador = entregadores.find((x) => String(x.id) === String(form.entregador_id))
      const payload = {
        ...form,
        valor_total: Number(form.valor_total || 0),
        entregador_nome: entregador?.nome || '',
      }
      await api.post('/entregas', payload)
      setModal(false)
      setForm({ entregador_id: '', pedido_id: '', pedido_descricao: '', cliente_nome: '', cliente_endereco: '', valor_total: 0 })
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao criar entrega')
    }
  }

  const quandoSelecionaPedido = (pid) => {
    const p = pedidos.find((x) => String(x.id) === String(pid))
    if (p) {
      setForm((f) => ({
        ...f,
        pedido_id: pid,
        pedido_descricao: p.produto || '',
        cliente_nome: p.nome || '',
        cliente_endereco: p.endereco || '',
        valor_total: p.valor || 0,
      }))
    }
  }

  if (loading) return <Loader />

  const badge = (s) => {
    const c = STATUS_COLORS[s] || STATUS_COLORS.pendente
    return <span className="badge" style={{ color: c.color, background: c.bg }}>{s.replace('_', ' ')}</span>
  }

  return (
    <>
      <Topbar title="Entregas" subtitle="Gestão de entregas e status" />

      {modalEntrega && (
        <EntregaModal
          entrega={modalEntrega}
          onClose={() => setModalEntrega(null)}
          onSalvo={load}
        />
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nova entrega</h3>

            <label>Entregador</label>
            <select className="input" value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} style={{ marginBottom: 14 }}>
              <option value="">Selecione...</option>
              {entregadores.map((x) => (
                <option key={x.id} value={x.id}>{x.nome}</option>
              ))}
            </select>

            <label>Pedido (opcional - preenche automaticamente)</label>
            <select className="input" value={form.pedido_id} onChange={(e) => quandoSelecionaPedido(e.target.value)} style={{ marginBottom: 14 }}>
              <option value="">Selecione um pedido...</option>
              {pedidos.map((p) => (
                <option key={p.id} value={p.id}>#{p.id} - {p.produto} - {formatBRL(p.valor)}</option>
              ))}
            </select>

            <label>Descrição do pedido</label>
            <input className="input" value={form.pedido_descricao} onChange={(e) => setForm({ ...form, pedido_descricao: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Cliente</label>
            <input className="input" value={form.cliente_nome} onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Endereço de entrega</label>
            <input className="input" value={form.cliente_endereco} onChange={(e) => setForm({ ...form, cliente_endereco: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Valor total</label>
            <input className="input" type="number" step="0.01" value={form.valor_total} onChange={(e) => setForm({ ...form, valor_total: e.target.value })} style={{ marginBottom: 20 }} />

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={criarEntrega}>
              Criar entrega
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in">
        <div className="row space-between wrap" style={{ marginBottom: 20 }}>
          <div className="row" style={{ flex: 1, maxWidth: 520 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Buscar por cliente, endereço ou produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
            </div>
            <select className="input" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} style={{ width: 160 }}>
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="aceita">Aceita</option>
              <option value="em_transito">Em trânsito</option>
              <option value="entregue">Entregue</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus size={16} />
            Nova entrega
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Endereço</th>
                  <th>Entregador</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Criado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((en) => (
                  <tr key={en.id} onClick={() => setModalEntrega(en)} style={{ cursor: 'pointer' }}>
                    <td>#{en.id}</td>
                    <td style={{ maxWidth: 160 }}>{en.pedido_descricao}</td>
                    <td>{en.cliente_nome}</td>
                    <td className="text-muted text-sm" style={{ maxWidth: 200 }}>{en.cliente_endereco} {en.cliente_cidade}/{en.cliente_uf}</td>
                    <td>{en.entregador_nome || '—'}</td>
                    <td className="fw-700">{formatBRL(en.valor_total)}</td>
                    <td>{badge(en.status)}</td>
                    <td className="text-muted text-sm">{formatDate(en.criado_em)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => setModalEntrega(en)}
                        >
                          <Eye size={14} />
                          Ver / Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Nenhuma entrega encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}