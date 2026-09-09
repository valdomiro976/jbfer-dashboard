import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader } from '../components/utils'
import { Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react'

const formVazio = {
  departamento: '',
  num_whatsapp: '',
  nome_contato: '',
  expediente_h_inicio: '',
  expediente_h_final: '',
  expediente_dia_semana: '',
}

export function Departamentos() {
  const [dptos, setDptos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(formVazio)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/dptos')
      setDptos(data.dados)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtrados = dptos.filter((d) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return (
      (d.departamento || '').toLowerCase().includes(termo) ||
      (d.nome_contato || '').toLowerCase().includes(termo) ||
      (d.num_whatsapp || '').includes(termo) ||
      (d.expediente_dia_semana || '').toLowerCase().includes(termo)
    )
  })

  const salvar = async () => {
    try {
      const payload = { ...form, departamento: form.departamento.trim() }
      if (editing) {
        await api.put(`/dptos/${editing.id}`, payload)
      } else {
        await api.post('/dptos', payload)
      }
      setModal(false)
      setEditing(null)
      setForm(formVazio)
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar departamento')
    }
  }

  const excluir = async (id) => {
    if (!confirm('Excluir este departamento?')) return
    try {
      await api.delete(`/dptos/${id}`)
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

  const abrirEdicao = (d) => {
    setEditing(d)
    setForm({
      departamento: d.departamento,
      num_whatsapp: d.num_whatsapp || '',
      nome_contato: d.nome_contato || '',
      expediente_h_inicio: d.expediente_h_inicio || '',
      expediente_h_final: d.expediente_h_final || '',
      expediente_dia_semana: d.expediente_dia_semana || '',
    })
    setModal(true)
  }

  if (loading) return <Loader />

  return (
    <>
      <Topbar title="Departamentos" subtitle="Setores e expediente de atendimento" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Editar departamento' : 'Novo departamento'}</h3>

            <label>Nome do departamento</label>
            <input className="input" value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} style={{ marginBottom: 14 }} />

            <label>WhatsApp do setor</label>
            <input className="input" value={form.num_whatsapp} onChange={(e) => setForm({ ...form, num_whatsapp: e.target.value })} placeholder="5511999999999" style={{ marginBottom: 14 }} />

            <label>Nome do contato</label>
            <input className="input" value={form.nome_contato} onChange={(e) => setForm({ ...form, nome_contato: e.target.value })} style={{ marginBottom: 14 }} />

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Expediente - início</label>
                <input className="input" type="time" value={form.expediente_h_inicio} onChange={(e) => setForm({ ...form, expediente_h_inicio: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Expediente - final</label>
                <input className="input" type="time" value={form.expediente_h_final} onChange={(e) => setForm({ ...form, expediente_h_final: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
            </div>

            <label>Dias de expediente</label>
            <input className="input" value={form.expediente_dia_semana} onChange={(e) => setForm({ ...form, expediente_dia_semana: e.target.value })} placeholder="SEGUNDA A SEXTA" style={{ marginBottom: 20 }} />

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar}>
              <Building2 size={16} />
              {editing ? 'Salvar alterações' : 'Cadastrar departamento'}
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in">
        <div className="row space-between wrap" style={{ marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              placeholder="Buscar por departamento, contato ou WhatsApp..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Plus size={16} />
            Novo departamento
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Departamento</th>
                  <th>WhatsApp</th>
                  <th>Contato</th>
                  <th>Expediente</th>
                  <th>Dias</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.id}>
                    <td>#{d.id}</td>
                    <td className="fw-700">{d.departamento}</td>
                    <td>{d.num_whatsapp || '—'}</td>
                    <td>{d.nome_contato || '—'}</td>
                    <td>
                      {d.expediente_h_inicio || d.expediente_h_final
                        ? `${d.expediente_h_inicio || '—'} às ${d.expediente_h_final || '—'}`
                        : '—'}
                    </td>
                    <td>{d.expediente_dia_semana || '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => abrirEdicao(d)} title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: 8 }} onClick={() => excluir(d.id)} title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>Nenhum departamento encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="text-muted text-sm">Mostrando {filtrados.length} de {dptos.length} departamentos</span>
        </div>
      </div>
    </>
  )
}