// Página de Agendamentos de Entrega (CRUD em tb_agendamentos_entregas_<cnpj>)
// CRIADO EM: 29/09/2026 - gerencia os agendamentos criados pelo chatbot WhatsApp

import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader } from '../components/utils'
import { Plus, Pencil, Trash2, Search, CalendarClock } from 'lucide-react'

const STATUS_COLORS = {
  aguardando_entrega: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.15)' },
  aguardando_data: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.15)' },
  agendado: { color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)' },
  imediata: { color: 'var(--success)', bg: 'rgba(52,211,153,0.15)' },
  saiu_para_entrega: { color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' },
  cancelado: { color: 'var(--danger)', bg: 'rgba(248,113,113,0.15)' },
  entregue: { color: '#34d399', bg: 'rgba(16,185,129,0.18)' },
}

const STATUS_LABELS = {
  aguardando_entrega: 'Aguardando resposta',
  aguardando_data: 'Aguardando data',
  agendado: 'Agendado',
  imediata: 'Imediata',
  saiu_para_entrega: 'Saiu para Entrega',
  cancelado: 'Cancelado',
  entregue: 'Entregue',
}

const formVazio = {
  whatsapp: '',
  nome: '',
  pedido_id: '',
  produto: '',
  endereco: '',
  cidade: '',
  uf: '',
  cep: '',
  data_entrega: '',
  hora_entrega: '',
  observacoes: '',
  status: 'aguardando_data',
}

export function Agendamentos() {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFiltro, setStatusFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(formVazio)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/agendamentos')
      setItens(data.dados)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const formatarEntrega = (a) => {
    const dia = a.data_entrega ? a.data_entrega.split('-').reverse().join('/') : ''
    const hora = a.hora_entrega || ''
    if (!dia && !hora) return '—'
    if (dia && hora) return `${dia} às ${hora}`
    return dia || hora
  }

  const filtrados = itens.filter((a) => {
    const t = busca.toLowerCase()
    const okBusca =
      !t ||
      (a.nome || '').toLowerCase().includes(t) ||
      (a.whatsapp || '').includes(t) ||
      (a.produto || '').toLowerCase().includes(t) ||
      (a.endereco || '').toLowerCase().includes(t)
    const okStatus = !statusFiltro || a.status === statusFiltro
    return okBusca && okStatus
  })

  const salvar = async () => {
    try {
      const payload = { ...form, whatsapp: form.whatsapp.trim() }
      if (editing) {
        await api.put(`/agendamentos/${editing.id}`, payload)
      } else {
        await api.post('/agendamentos', payload)
      }
      setModal(false)
      setEditing(null)
      setForm(formVazio)
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar agendamento')
    }
  }

  const mudarStatus = async (a, novoStatus) => {
    if (a.status === novoStatus) return
    try {
      await api.post(`/agendamentos/${a.id}/status?status_ag=${novoStatus}`)
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao atualizar status')
    }
  }

  const excluir = async (id) => {
    if (!confirm('Excluir este agendamento?')) return
    try {
      await api.delete(`/agendamentos/${id}`)
      load()
    } catch (e) {
      console.error(e)
    }
  }

  const abrirNovo = () => {
    setEditing(null)
    setForm(formVazio)
    setModal(true)
  }

  const abrirEdicao = (a) => {
    setEditing(a)
    setForm({
      whatsapp: a.whatsapp || '',
      nome: a.nome || '',
      pedido_id: a.pedido_id ?? '',
      produto: a.produto || '',
      endereco: a.endereco || '',
      cidade: a.cidade || '',
      uf: a.uf || '',
      cep: a.cep || '',
      data_entrega: a.data_entrega || '',
      hora_entrega: a.hora_entrega || '',
      observacoes: a.observacoes || '',
      status: a.status || 'aguardando_data',
    })
    setModal(true)
  }

  if (loading) return <Loader />

  const badge = (s) => {
    const c = STATUS_COLORS[s] || STATUS_COLORS.aguardando_data
    const label = STATUS_LABELS[s] || s.replace('_', ' ')
    return <span className="badge" style={{ color: c.color, background: c.bg }}>{label}</span>
  }

  return (
    <>
      <Topbar title="Agendamentos de Entrega" subtitle="Entregas agendadas pelo WhatsApp" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Editar agendamento' : 'Novo agendamento'}</h3>
            <button className="modal-close" onClick={() => setModal(false)} title="Fechar">✕</button>

            <label>WhatsApp</label>
            <input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5511999999999" style={{ marginBottom: 14 }} />

            <label>Nome do cliente</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 14 }} />

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Pedido (ID)</label>
                <input className="input" type="number" value={form.pedido_id} onChange={(e) => setForm({ ...form, pedido_id: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ marginBottom: 14 }}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <label>Produto</label>
            <input className="input" value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })} style={{ marginBottom: 14 }} />

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Data da entrega</label>
                <input className="input" type="date" value={form.data_entrega} onChange={(e) => setForm({ ...form, data_entrega: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Hora da entrega</label>
                <input className="input" type="time" value={form.hora_entrega} onChange={(e) => setForm({ ...form, hora_entrega: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
            </div>

            <label>Endereço</label>
            <input className="input" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} style={{ marginBottom: 14 }} />

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label>Cidade</label>
                <input className="input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
              <div>
                <label>UF</label>
                <input className="input" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} maxLength={2} style={{ marginBottom: 14, width: 70 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>CEP</label>
                <input className="input" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
            </div>

            <label>Observações</label>
            <textarea className="input" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} style={{ marginBottom: 20 }} />

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar}>
              <CalendarClock size={16} />
              {editing ? 'Salvar alterações' : 'Cadastrar agendamento'}
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in">
        <div className="row space-between wrap" style={{ marginBottom: 20 }}>
          <div className="row" style={{ flex: 1, maxWidth: 560 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Buscar por cliente, WhatsApp, produto ou endereço..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
            </div>
            <select className="input" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} style={{ width: 200 }}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Plus size={16} />
            Novo agendamento
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Pedido / Produto</th>
                  <th>Entrega</th>
                  <th>Endereço</th>
                  <th>Status</th>
                  <th>Criado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id}>
                    <td>#{a.id}</td>
                    <td className="fw-700">
                      {a.nome || '—'}
                      <div className="text-muted text-sm">{a.whatsapp || ''}</div>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      {a.pedido_id != null && <span className="text-muted text-sm">#{a.pedido_id} </span>}
                      {a.produto || '—'}
                    </td>
                    <td>{formatarEntrega(a)}</td>
                    <td className="text-muted text-sm" style={{ maxWidth: 200 }}>
                      {a.endereco} {a.cidade && `${a.cidade}/${a.uf}`}
                    </td>
                    <td>
                      <select
                        className="input"
                        value={a.status}
                        onChange={(e) => mudarStatus(a, e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 12 }}
                        title="Alterar status"
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-muted text-sm">{a.criado_em ? new Date(a.criado_em).toLocaleString('pt-BR') : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => abrirEdicao(a)} title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: 8 }} onClick={() => excluir(a.id)} title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>Nenhum agendamento encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="text-muted text-sm">Mostrando {filtrados.length} de {itens.length} agendamentos</span>
        </div>
      </div>
    </>
  )
}