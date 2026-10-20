import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatBRL } from '../components/utils'
import { Plus, Pencil, Trash2, Package, Search } from 'lucide-react'

export function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nome: '', preco: '', estoque: '', categoria_id: '', ativo: true, texto_busca: '' })

  const vazio = () => ({ nome: '', preco: '', estoque: '', categoria_id: '', ativo: true, texto_busca: '' })

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/produtos')
      setProdutos(data.dados)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtrados = produtos.filter((p) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return (p.nome || '').toLowerCase().includes(termo)
  })

  const salvar = async () => {
    try {
      const payload = {
        nome: form.nome.trim(),
        preco: parseFloat(form.preco) || 0,
        estoque: parseInt(form.estoque, 10) || 0,
        categoria_id: form.categoria_id !== '' ? parseInt(form.categoria_id, 10) : null,
        ativo: form.ativo,
        texto_busca: (form.texto_busca || '').trim(),
      }
      if (editing) {
        await api.put(`/produtos/${editing.id}`, payload)
      } else {
        await api.post('/produtos', payload)
      }
      setModal(false)
      setEditing(null)
      setForm(vazio())
      load()
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar produto')
    }
  }

  const excluir = async (id) => {
    if (!confirm('Excluir este produto?')) return
    try {
      await api.delete(`/produtos/${id}`)
      load()
    } catch (e) {
      console.error(e)
    }
  }

  const abrirNovo = () => {
    setEditing(null)
    setForm(vazio())
    setModal(true)
  }

  const abrirEdicao = (p) => {
    setEditing(p)
    setForm({ nome: p.nome, preco: p.preco, estoque: p.estoque, categoria_id: p.categoria_id ?? '', ativo: !!p.ativo, texto_busca: p.texto_busca || '' })
    setModal(true)
  }

  if (loading) return <Loader />

  return (
    <>
      <Topbar title="Produtos" subtitle="Catálogo de produtos" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Editar produto' : 'Novo produto'}</h3>
            <button className="modal-close" onClick={() => setModal(false)} title="Fechar">✕</button>

            <label>Nome</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} style={{ marginBottom: 14 }} />

            <label>Palavras para este produto ser localizado</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Ex.: gas, gas de cozinha, botijão grande, botijão pequeno"
              value={form.texto_busca}
              onChange={(e) => setForm({ ...form, texto_busca: e.target.value })}
              style={{ marginBottom: 14 }}
            />

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Preço (R$)</label>
                <input className="input" type="number" step="0.01" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Estoque</label>
                <input className="input" type="number" step="1" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: e.target.value })} style={{ marginBottom: 14 }} />
              </div>
            </div>

            <label>Código da categoria</label>
            <input className="input" type="number" step="1" placeholder="Opcional" value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} style={{ marginBottom: 14 }} />

            <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Produto ativo</span>
            </label>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar}>
              <Package size={16} />
              {editing ? 'Salvar alterações' : 'Cadastrar produto'}
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
              placeholder="Buscar por nome ou categoria..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Plus size={16} />
            Novo produto
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>{p.nome}</td>
                    <td>{p.categoria_id ?? '—'}</td>
                    <td className="fw-700">{formatBRL(p.preco)}</td>
                    <td>{p.estoque}</td>
                    <td>
                      <span className={p.ativo ? 'badge badge-success' : 'badge badge-danger'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => abrirEdicao(p)} title="Editar">
                          <Pencil size={15} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: 8 }} onClick={() => excluir(p.id)} title="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>Nenhum produto encontrado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="text-muted text-sm">Mostrando {filtrados.length} de {produtos.length} produtos</span>
        </div>
      </div>
    </>
  )
}