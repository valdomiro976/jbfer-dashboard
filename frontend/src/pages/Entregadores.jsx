import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader } from '../components/utils'
import { Plus, Pencil, Trash2, UserPlus } from 'lucide-react'

export function Entregadores() {
  const [entregadores, setEntregadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', senha: '' })

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/entregas/entregadores')
      setEntregadores(data.dados)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const salvar = async () => {
    try {
      if (editing) {
        await api.put(`/entregas/entregadores/${editing.id}`, form)
      } else {
        await api.post('/entregas/entregadores', form)
      }
      setModal(false)
      setEditing(null)
      setForm({ nome: '', telefone: '', email: '', senha: '' })
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar entregador')
    }
  }

  const excluir = async (id) => {
    if (!confirm('Excluir este entregador?')) return
    try {
      await api.delete(`/entregas/entregadores/${id}`)
      load()
    } catch (e) {
      console.error(e)
    }
  }

  const abrirNovo = () => {
    setEditing(null)
    setForm({ nome: '', telefone: '', email: '', senha: '' })
    setModal(true)
  }

  const abrirEdicao = (e) => {
    setEditing(e)
    setForm({ nome: e.nome, telefone: e.telefone, email: e.email, senha: '' })
    setModal(true)
  }

  if (loading) return <Loader />

  return (
    <>
      <Topbar title="Entregadores" subtitle="Cadastro dos profissionais de entrega" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Editar entregador' : 'Novo entregador'}</h3>
            <button className="modal-close" onClick={() => setModal(false)} title="Fechar">✕</button>

            <label>Nome completo</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Telefone / WhatsApp</label>
            <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} style={{ marginBottom: 14 }} />

            <label>E-mail</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Senha (para login no app Android)</label>
            <input className="input" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} style={{ marginBottom: 20 }} />

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar}>
              <UserPlus size={16} />
              {editing ? 'Salvar alterações' : 'Cadastrar entregador'}
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in">
        <div className="row space-between" style={{ marginBottom: 20 }}>
          <span className="text-muted">{entregadores.length} entregadores cadastrados</span>
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Plus size={16} />
            Novo entregador
          </button>
        </div>

        <div className="grid-2-equal">
          {entregadores.map((e) => (
            <div className="card card-hover" key={e.id}>
              <div className="row space-between">
                <div className="row">
                  <div className="chat-avatar" style={{ width: 46, height: 46 }}>{e.nome.charAt(0).toUpperCase()}</div>
                  <div>
                    <div className="fw-700">{e.nome}</div>
                    <div className="text-muted text-sm">{e.telefone || 'Sem telefone'}</div>
                    {e.email && <div className="text-muted text-sm">{e.email}</div>}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => abrirEdicao(e)} title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button className="btn btn-danger" style={{ padding: 8 }} onClick={() => excluir(e.id)} title="Excluir">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="text-sm" style={{ marginTop: 12 }}>
                <span className={e.ativo ? 'badge badge-success' : 'badge badge-danger'}>
                  {e.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
          {entregadores.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
              <div className="text-muted" style={{ marginBottom: 14 }}>Nenhum entregador cadastrado ainda</div>
              <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar primeiro entregador</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}