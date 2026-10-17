import { useEffect, useState } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatBRL, formatDate } from '../components/utils'
import { Plus, Pencil, Trash2, Search, RefreshCw } from 'lucide-react'

// CRIADO EM: 30/09/2026 - pagina propria de Redirecionamentos (antes ficava
// como tabela interna dentro de Cadastros). Mesmo CRUD da tabela 'redir'.

const statusCor = {
  PENDENTE: 'badge badge-danger',
  ATENDIDO: 'badge badge-success',
  CANCELADO_PELO_CLIENTE: 'badge badge-warning',
}

const selectsPorTabela = {
  redir: {
    status: ['PENDENTE', 'ATENDIDO', 'CANCELADO_PELO_CLIENTE'],
  },
}

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

export function Redirecionamentos() {
  const [linhas, setLinhas] = useState([])
  const [colunas, setColunas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [metaRotulo, setMetaRotulo] = useState('Redirecionamentos')
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [modelo, setModelo] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(() => new Set())

  const loadMeta = async () => {
    setLoadingMeta(true)
    try {
      const { data } = await api.get('/cruds/tabelas')
      const t = (data.dados || []).find((x) => x.rota === 'redir')
      if (t) setMetaRotulo(t.rotulo || 'Redirecionamentos')
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMeta(false)
    }
  }

  const loadLinhas = async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/cruds/redir', { timeout: 60000 })
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
    loadLinhas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const camposEditaveis = colunas.filter((c) => !c.protegido && !c.timestamp)

  const formuVazio = () => {
    const f = {}
    camposEditaveis.forEach((c) => {
      if (c.type === 'bool') f[c.field] = c.default !== 0
      else {
        const opcoes = selectsPorTabela.redir?.[c.field]
        f[c.field] = opcoes ? opcoes[0] : ''
      }
    })
    return f
  }

  const abrirNovo = () => {
    setEditing(null)
    setForm(formuVazio())
    setModelo(true)
  }

  const abrirEdicao = (registro) => {
    setEditing(registro)
    const f = {}
    camposEditaveis.forEach((c) => {
      let v = registro[c.field] ?? ''
      if (c.type === 'bool') v = v === true || v === 1
      f[c.field] = v
    })
    setForm(f)
    setModelo(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const payload = {}
      camposEditaveis.forEach((c) => {
        let v = form[c.field]
        if (v === undefined) v = ''
        if (c.type === 'bool') v = !!v
        payload[c.field] = v
      })
      if (editing) await api.put(`/cruds/redir/${editing.id}`, { dados: payload })
      else await api.post('/cruds/redir', { dados: payload })
      setModelo(false)
      setEditing(null)
      loadLinhas()
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar registro')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (registro) => {
    const nome = Object.values(registro).find((v) => typeof v === 'string' && v.trim()) || `#${registro.id}`
    if (!confirm(`Excluir ${nome}?`)) return
    try {
      await api.delete(`/cruds/redir/${registro.id}`)
      loadLinhas()
    } catch (e) {
      console.error(e)
      alert('Erro ao excluir registro')
    }
  }

  // CRIADO EM: 17/10/2026 - alterar o STATUS direto na grade (combo), sem
  // abrir a tela de edicao. Atualizacao otimista + PUT parcial ({status}).
  const atualizarStatus = async (registro, novo) => {
    const anterior = registro.status
    if (novo === anterior) return
    setLinhas((prev) => prev.map((l) => (l.id === registro.id ? { ...l, status: novo } : l)))
    setSalvandoStatus((prev) => new Set(prev).add(registro.id))
    try {
      await api.put(`/cruds/redir/${registro.id}`, { dados: { status: novo } })
    } catch (e) {
      console.error(e)
      setLinhas((prev) => prev.map((l) => (l.id === registro.id ? { ...l, status: anterior } : l)))
      alert('Erro ao alterar o status')
    } finally {
      setSalvandoStatus((prev) => {
        const s = new Set(prev)
        s.delete(registro.id)
        return s
      })
    }
  }

  const opcoesStatus = (valor) => {
    const base = selectsPorTabela.redir.status
    const v = String(valor ?? '')
    return base.includes(v) ? base : [v, ...base]
  }

  const filtradas = linhas.filter((l) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return Object.values(l).some((v) => String(v ?? '').toLowerCase().includes(termo))
  })

  // Resumo das colunas exibidas na grade: id + status (se existe) + até mais 5,
  // priorizando identificacao do cliente (inclusive numero_real_cliente).
  function colunasVisiveis() {
    return colunas.filter((c) => !c.textarea && !c.timestamp)
  }
  const colunasResumidas = (() => {
    const all = colunasVisiveis()
    const pri = ['whatsapp_cliente', 'nome_cliente', 'numero_real_cliente', 'departamento']
    const ord = (arr) => [
      ...arr.filter((c) => c.field === 'id'),
      ...arr.filter((c) => c.field === 'status'),
      ...arr.filter((c) => c.field !== 'id' && c.field !== 'status' && pri.includes(c.field)),
      ...arr.filter((c) => c.field !== 'id' && c.field !== 'status' && !pri.includes(c.field)),
    ]
    const temStatus = all.some((c) => c.field === 'status')
    return ord(all).slice(0, temStatus ? 7 : 6)
  })()

  const renderCampo = (c) => {
    const campo = c.field
    const rotulo = rotuloCampo(campo)
    const val = form[campo] ?? ''
    const opcoes = selectsPorTabela.redir?.[campo]

    if (opcoes) {
      return (
        <div key={campo} style={{ marginBottom: 12 }}>
          <label>{rotulo}</label>
          <select
            className="input"
            value={val}
            onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
          >
            {opcoes.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      )
    }

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

  if (loadingMeta) return <Loader />

  return (
    <>
      <Topbar title={metaRotulo} subtitle="Redirecionamentos de mensagens" />

      {modelo && (
        <div className="modal-overlay" onClick={() => setModelo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? `Editar registro #${editing.id}` : 'Novo registro'}</h3>
            <button className="modal-close" onClick={() => setModelo(false)} title="Fechar">✕</button>
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
        <div className="row space-between wrap" style={{ marginBottom: 16, gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-icon" onClick={loadLinhas} title="Recarregar">
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
              <thead>
                {colunasResumidas.length > 0 && (
                  <tr>
                    {colunasResumidas.map((c) => (
                      <th key={c.field}>{rotuloCampo(c.field)}</th>
                    ))}
                    <th>Ações</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {carregando && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>Carregando...</td>
                  </tr>
                )}

                {!carregando && filtradas.map((l) => (
                  <tr key={l.id}>
                    {colunasResumidas.map((c) => (
                      <td key={c.field}>
                        {c.field === 'status'
                          ? (
                            <select
                              className={`input status-select ${statusCor[String(l[c.field]).toUpperCase()] || ''}`}
                              value={String(l[c.field] ?? '')}
                              disabled={salvandoStatus.has(l.id)}
                              title="Alterar status"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => atualizarStatus(l, e.target.value)}
                            >
                              {opcoesStatus(l[c.field]).map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          )
                          : c.type === 'datetime' || c.type === 'date'
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
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: 40 }}>Nenhum registro encontrado</td></tr>
                )}
                {!carregando && colunas.length > 0 && filtradas.length === 0 && (
                  <tr><td colSpan={colunasResumidas.length + 1} style={{ textAlign: 'center', padding: 40 }}>Nenhum registro encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="text-muted text-sm">
            {metaRotulo}: {filtradas.length} de {linhas.length} registros
          </span>
        </div>
      </div>
    </>
  )
}