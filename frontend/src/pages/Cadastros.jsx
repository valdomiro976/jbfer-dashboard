import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatDate } from '../components/utils'
import { Plus, Pencil, Trash2, Search, Database, RefreshCw } from 'lucide-react'

function rotuloCampo(field) {
  return (field || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function valorExibicao(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toLocaleString('pt-BR')
  if (typeof v === 'string' && v.length > 60) return v.slice(0, 60) + '…'
  return String(v)
}

export function Cadastros() {
  const [meta, setMeta] = useState([])
  const [rota, setRota] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [colunas, setColunas] = useState([])
  const [loading, setLoading] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [salvando, setSalvando] = useState(false)

  const loadMeta = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/cruds/tabelas')
      const tabelas = data.dados
      setMeta(tabelas)
      const existentes = tabelas.filter((t) => t.existe)
      if (!rota && existentes.length > 0) {
        setRota(existentes[0].rota)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadLinhas = async (r) => {
    if (!r) return
    setCarregando(true)
    try {
      const { data } = await api.get(`/cruds/${r}`, { timeout: 60000 })
      setLinhas(data.dados || [])
      setColunas(data.colunas || [])
    } catch (e) {
      console.error(e)
      setLinhas([])
      setColunas([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    loadMeta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadLinhas(rota)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota])

  const selecionar = (r) => {
    setRota(r)
    setBusca('')
  }

  const metaAtual = meta.find((t) => t.rota === rota)

  // Campos editáveis (sem id e timestamps)
  const camposEditaveis = colunas.filter((c) => !c.protegido && !c.timestamp)

  const formuVazio = () => {
    const f = {}
    camposEditaveis.forEach((c) => {
      if (c.type === 'bool') f[c.field] = c.default !== 0
      else f[c.field] = ''
    })
    return f
  }

  const abrirNovo = () => {
    setEditing(null)
    setForm(formuVazio())
    setModal(true)
  }

  const abrirEdicao = (linha) => {
    setEditing(linha)
    const f = {}
    camposEditaveis.forEach((c) => {
      let v = linha[c.field] ?? ''
      if (c.type === 'bool') v = v === true || v === 1
      f[c.field] = v
    })
    setForm(f)
    setModal(true)
  }

  const salvar = async () => {
    if (!rota) return
    setSalvando(true)
    try {
      const payload = {}
      camposEditaveis.forEach((c) => {
        let v = form[c.field]
        if (v === undefined) v = ''
        if (c.type === 'bool') v = !!v
        payload[c.field] = v
      })
      if (editing) {
        await api.put(`/cruds/${rota}/${editing.id}`, { dados: payload })
      } else {
        await api.post(`/cruds/${rota}`, { dados: payload })
      }
      setModal(false)
      setEditing(null)
      loadLinhas(rota)
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar registro')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (linha) => {
    const nome = Object.values(linha).find((v) => typeof v === 'string' && v.trim()) || `#${linha.id}`
    if (!confirm(`Excluir ${nome}?`)) return
    try {
      await api.delete(`/cruds/${rota}/${linha.id}`)
      loadLinhas(rota)
    } catch (e) {
      console.error(e)
      alert('Erro ao excluir registro')
    }
  }

  const filtradas = linhas.filter((l) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return Object.values(l).some((v) => String(v ?? '').toLowerCase().includes(termo))
  })

  if (loading) return <Loader />

  const renderCampo = (c) => {
    const campo = c.field
    const rotulo = rotuloCampo(campo)
    const val = form[campo] ?? ''

    if (c.type === 'bool') {
      return (
        <label key={campo} className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => setForm({ ...form, [campo]: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{rotulo}</span>
        </label>
      )
    }
    if (c.type === 'textarea') {
      return (
        <div key={campo} style={{ marginBottom: 12 }}>
          <label>{rotulo}</label>
          <textarea
            className="input"
            rows={5}
            value={val}
            onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
          />
        </div>
      )
    }
    if (c.type === 'time') {
      return (
        <div key={campo} style={{ marginBottom: 12 }}>
          <label>{rotulo}</label>
          <input className="input" type="time" value={val} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
        </div>
      )
    }
    return (
      <div key={campo} style={{ marginBottom: 12 }}>
        <label>{rotulo}</label>
        <input
          className="input"
          type={c.type === 'number' ? 'number' : 'text'}
          step={c.type === 'number' ? '0.01' : undefined}
          value={val}
          onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
        />
      </div>
    )
  }

  const colunasVisiveis = colunas.filter((c) => !c.textarea)

  return (
    <>
      <Topbar title="Cadastros" subtitle="Gerencie tabelas e configurações do sistema" />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? `Editar registro #${editing.id}` : `Novo registro em ${metaAtual?.rotulo || rota}`}</h3>
            <button className="modal-close" onClick={() => setModal(false)} title="Fechar">✕</button>
            <div className="modal-scroll">
              {camposEditaveis.length === 0 && <p className="text-muted text-sm">Nenhum campo editável</p>}
              {camposEditaveis.map(renderCampo)}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in" style={{ paddingTop: 0 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          {/* Menu de tabelas */}
          <div className="card" style={{ padding: 12, width: 230, flexShrink: 0 }}>
            <div className="text-muted text-sm fw-700" style={{ padding: '4px 8px 10px' }}>
              <Database size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Tabelas
            </div>
            <div className="crud-menu">
              {meta.map((t) => (
                <button
                  key={t.rota}
                  className={rota === t.rota ? 'crud-menu-btn active' : 'crud-menu-btn'}
                  onClick={() => selecionar(t.rota)}
                  disabled={!t.existe}
                  title={t.existe ? t.rotulo : `${t.rotulo} (não existe)`}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>{t.rotulo}</span>
                  {!t.existe && <span className="text-muted" style={{ fontSize: 11 }}>×</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo da tabela */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row space-between wrap" style={{ marginBottom: 16, gap: 10 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="input"
                  placeholder="Buscar em qualquer campo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{ paddingLeft: 36 }}
                />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-icon" onClick={() => loadLinhas(rota)} title="Recarregar">
                  <RefreshCw size={15} />
                </button>
                <button className="btn btn-primary" onClick={abrirNovo} disabled={camposEditaveis.length === 0}>
                  <Plus size={16} />
                  Novo registro
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
                <table className="data-table">
                  {colunasVisiveis.length > 0 && (
                    <thead>
                      <tr>
                        {colunasVisiveis.map((c) => (
                          <th key={c.field}>{rotuloCampo(c.field)}</th>
                        ))}
                        <th>Ações</th>
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {carregando && (
                      <tr>
                        <td colSpan={colunasVisiveis.length + 1} style={{ textAlign: 'center', padding: 40 }}>
                          Carregando...
                        </td>
                      </tr>
                    )}
                    {!carregando && filtradas.map((l) => (
                      <tr key={l.id}>
                        {colunasVisiveis.map((c) => (
                          <td key={c.field}>
                            {c.type === 'datetime' || c.type === 'date'
                              ? formatDate(l[c.field])
                              : valorExibicao(l[c.field])}
                          </td>
                        ))}
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-ghost btn-icon" style={{ padding: 0 }} onClick={() => abrirEdicao(l)} title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button className="btn btn-danger btn-icon" style={{ padding: 0 }} onClick={() => excluir(l)} title="Excluir">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!carregando && colunas.length === 0 && (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', padding: 40 }}>
                          Selecione uma tabela na lateral
                        </td>
                      </tr>
                    )}
                    {!carregando && colunas.length > 0 && filtradas.length === 0 && (
                      <tr>
                        <td colSpan={colunasVisiveis.length + 1} style={{ textAlign: 'center', padding: 40 }}>
                          Nenhum registro encontrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <span className="text-muted text-sm">
                {metaAtual?.rotulo}: {filtradas.length} de {linhas.length} registros
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}