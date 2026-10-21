import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatDate, formatBRL } from '../components/utils'
import { Plus, Pencil, Trash2, Search, Database, RefreshCw, Package, Building2, KeyRound, Users, Settings, CreditCard, ShoppingCart, CornerDownRight, HelpCircle, MessageCircle, AlertTriangle } from 'lucide-react'

const iconeTabela = {
  chaves_pix: KeyRound,
  clientes: Users,
  config: Settings,
  formas_pgtos: CreditCard,
  pedidos: ShoppingCart,
  redir: CornerDownRight,
}

const statusCor = {
  PENDENTE: 'badge badge-danger',
  ATENDIDO: 'badge badge-success',
}

// ComboBoxes por tabela/campo (rota -> campo -> opções)
const selectsPorTabela = {
  redir: {
    status: ['PENDENTE', 'ATENDIDO'],
  },
}

const ROTULOS_AMIGAVEIS = {
  reaviso_redir_min: 'Repetir aviso de redir a cada (min)',
  aviso_agend_min: 'Avisar quando faltar (min)',
  reaviso_agend_min: 'Repetir aviso de atraso de entregas a cada (min)',
  horario_loja: 'Horário da loja (ex 08:00-18:00)',
  nome_cliente: 'Nome cliente',
  fluxo_ia: 'Fluxo I.A. humanizado (0=atual, 1=novo)',
  // CRIADO EM: 21/10/2026 - beneficiario do Pix (aparece no QR Code do PDV)
  beneficiario: 'Beneficiário do Pix (nome)',
  cidade: 'Cidade do beneficiário',
}

// Colunas exibidas na grade por tabela (padrão: resumo automático).
// Config tem muita coluna e escondia os botões: só id + client_id.
const COLUNAS_GRADE = {
  config: ['id', 'nome_cliente', 'client_id'],
}

// Campos somente leitura no CRUD (somem do formulário; legenda avisa).
// Config: identidade da empresa, alterada só via Delphi/API.
const SOMENTE_LEITURA = {
  config: ['id', 'client_id', 'nome_cliente'],
}
const LEGENDA_LEITURA = {
  config: 'ID, Cliente ID e Nome cliente são somente leitura (alteração via ADMIN).',
}

function rotuloCampo(field) {
  if (ROTULOS_AMIGAVEIS[field]) return ROTULOS_AMIGAVEIS[field]
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

const formProdutoVazio = { nome: '', preco: '', estoque: '', categoria_id: '', ativo: true, texto_busca: '' }

const formDptVazio = {
  departamento: '',
  num_whatsapp: '',
  nome_contato: '',
  expediente_h_inicio: '',
  expediente_h_final: '',
  expediente_dia_semana: '',
}

export function Cadastros({ padrao }) {
  const navigate = useNavigate()

  // view: 'tabela:<rota>' | 'produtos' | 'departamentos' | 'ajuda' | 'historico'
  // ALTERADO EM: 25/09/2026 - ?ajuda=1 abre direto na Ajuda (botao do lateral)
  const [view, setView] = useState(() => {
    try {
      if (new URLSearchParams(window.location.search).get('ajuda') === '1') return 'ajuda'
    } catch { /* noop */ }
    return padrao
  })
  const [meta, setMeta] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  // Tabela CRUD genérica
  const [linhas, setLinhas] = useState([])
  const [colunas, setColunas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [modelo, setModelo] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')

  // Produtos
  const [produtos, setProdutos] = useState([])
  const [formProduto, setFormProduto] = useState(formProdutoVazio)

  // Departamentos
  const [dptos, setDptos] = useState([])
  const [formDpt, setFormDpt] = useState(formDptVazio)

  const [limpando, setLimpando] = useState(false)

  const loadMeta = async () => {
    setLoadingMeta(true)
    try {
      const { data } = await api.get('/cruds/tabelas')
      const tabelas = data.dados
      // ALTERADO EM: 30/09/2026 - 'redir' ganhou pagina propria
      // (/redirecionamentos): retirado do menu interno de Cadastros.
      setMeta((tabelas || []).filter((t) => t.rota !== 'redir'))
      const existentes = (tabelas || []).filter((t) => t.existe && t.rota !== 'redir')
      if (!view && existentes.length > 0) {
        setView(`tabela:${existentes[0].rota}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMeta(false)
    }
  }

  const rotaTabela = view && view.startsWith('tabela:') ? view.slice('tabela:'.length) : null
  const viewProdutos = view === 'produtos'
  const viewDptos = view === 'departamentos'
  // ALTERADO EM: 25/09/2026 - visao Ajuda (manual do painel WhatsApp)
  const viewAjuda = view === 'ajuda'
  const viewHistorico = view === 'historico'

  const selecionar = (v) => {
    setView(v)
    setBusca('')
  }

  const loadLinhas = async () => {
    if (!rotaTabela) return
    setCarregando(true)
    try {
      const { data } = await api.get(`/cruds/${rotaTabela}`, { timeout: 60000 })
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

  const loadProdutos = async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/produtos')
      setProdutos(data.dados || [])
    } catch (e) {
      console.error(e)
      setProdutos([])
    } finally {
      setCarregando(false)
    }
  }

  const loadDptos = async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/dptos')
      setDptos(data.dados || [])
    } catch (e) {
      console.error(e)
      setDptos([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    loadMeta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (rotaTabela) loadLinhas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaTabela])

  useEffect(() => {
    if (viewProdutos) loadProdutos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewProdutos])

  useEffect(() => {
    if (viewDptos) loadDptos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDptos])

  const metaAtual = meta.find((t) => t.rota === rotaTabela)
  const travados = SOMENTE_LEITURA[rotaTabela] || []
  const camposEditaveis = colunas.filter((c) => !c.protegido && !c.timestamp && !travados.includes(c.field))

  const formuVazio = () => {
    const f = {}
    camposEditaveis.forEach((c) => {
      if (c.type === 'bool') f[c.field] = c.default !== 0
      else {
        const opcoes = selectsPorTabela[rotaTabela]?.[c.field]
        f[c.field] = opcoes ? opcoes[0] : ''
      }
    })
    return f
  }

  const abrirNovo = () => {
    setEditing(null)
    setModelo(true)
    if (viewProdutos) setFormProduto(formProdutoVazio)
    else if (viewDptos) setFormDpt(formDptVazio)
    else setForm(formuVazio())
  }

  const abrirEdicao = (registro) => {
    setEditing(registro)
    setModelo(true)
    if (viewProdutos) {
      setFormProduto({
        nome: registro.nome,
        preco: registro.preco,
        estoque: registro.estoque,
        categoria_id: registro.categoria_id ?? '',
        ativo: !!registro.ativo,
        texto_busca: registro.texto_busca || '',
      })
    } else if (viewDptos) {
      setFormDpt({
        departamento: registro.departamento,
        num_whatsapp: registro.num_whatsapp || '',
        nome_contato: registro.nome_contato || '',
        expediente_h_inicio: registro.expediente_h_inicio || '',
        expediente_h_final: registro.expediente_h_final || '',
        expediente_dia_semana: registro.expediente_dia_semana || '',
      })
    } else {
      const f = {}
      camposEditaveis.forEach((c) => {
        let v = registro[c.field] ?? ''
        if (c.type === 'bool') v = v === true || v === 1
        f[c.field] = v
      })
      setForm(f)
    }
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      if (viewProdutos) {
        const payload = {
          nome: formProduto.nome.trim(),
          preco: parseFloat(formProduto.preco) || 0,
          estoque: parseInt(formProduto.estoque, 10) || 0,
          categoria_id: formProduto.categoria_id !== '' ? parseInt(formProduto.categoria_id, 10) : null,
          ativo: formProduto.ativo,
          texto_busca: (formProduto.texto_busca || '').trim(),
        }
        if (editing) await api.put(`/produtos/${editing.id}`, payload)
        else await api.post('/produtos', payload)
      } else if (viewDptos) {
        const payload = { ...formDpt, departamento: formDpt.departamento.trim() }
        if (editing) await api.put(`/dptos/${editing.id}`, payload)
        else await api.post('/dptos', payload)
      } else {
        const payload = {}
        camposEditaveis.forEach((c) => {
          let v = form[c.field]
          if (v === undefined) v = ''
          if (c.type === 'bool') v = !!v
          payload[c.field] = v
        })
        if (editing) await api.put(`/cruds/${rotaTabela}/${editing.id}`, { dados: payload })
        else await api.post(`/cruds/${rotaTabela}`, { dados: payload })
      }
      setModelo(false)
      setEditing(null)
      if (viewProdutos) loadProdutos()
      else if (viewDptos) loadDptos()
      else loadLinhas()
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
      if (viewProdutos) await api.delete(`/produtos/${registro.id}`)
      else if (viewDptos) await api.delete(`/dptos/${registro.id}`)
      else await api.delete(`/cruds/${rotaTabela}/${registro.id}`)
      if (viewProdutos) loadProdutos()
      else if (viewDptos) loadDptos()
      else loadLinhas()
    } catch (e) {
      console.error(e)
      alert('Erro ao excluir registro')
    }
  }

  const excluirTodoHistorico = async () => {
    const ok = window.confirm(
      'Excluir TODO o histórico de mensagens de WhatsApp deste cliente?\n\n' +
      'Isso apaga as conversas exibidas no painel E a memória de trabalho do bot. ' +
      'Esta ação NÃO pode ser desfeita.'
    )
    if (!ok) return
    const digitado = window.prompt('Para confirmar, digite EXCLUIR:')
    if ((digitado || '').trim().toUpperCase() !== 'EXCLUIR') return
    setLimpando(true)
    try {
      const { data } = await api.delete('/chat/historico')
      alert(`Histórico excluído. Mensagens removidas: ${data.total_removido ?? 0}.`)
    } catch (e) {
      console.error(e)
      alert('Erro ao excluir o histórico de mensagens')
    } finally {
      setLimpando(false)
    }
  }

  const filtradasTabela = linhas.filter((l) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return Object.values(l).some((v) => String(v ?? '').toLowerCase().includes(termo))
  })

  const filtradosProdutos = produtos.filter((p) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return (p.nome || '').toLowerCase().includes(termo)
  })

  const filtradosDptos = dptos.filter((d) => {
    const termo = busca.toLowerCase()
    if (!termo) return true
    return (
      (d.departamento || '').toLowerCase().includes(termo) ||
      (d.nome_contato || '').toLowerCase().includes(termo) ||
      (d.num_whatsapp || '').includes(termo)
    )
  })

  // Resumo das colunas exibidas na grade: id + status (se existe) + até mais 5
  function colunasVisiveis() {
    return colunas.filter((c) => !c.textarea && !c.timestamp)
  }
  const colunasResumidas = (() => {
    const fixas = COLUNAS_GRADE[rotaTabela]
    if (fixas) {
      return fixas
        .map((f) => colunasVisiveis().find((c) => c.field === f))
        .filter(Boolean)
    }
    const all = colunasVisiveis()
    const temStatus = all.some((c) => c.field === 'status')
    if (temStatus) {
      const id = all.filter((c) => c.field === 'id')
      const st = all.filter((c) => c.field === 'status')
      const resto = all.filter((c) => c.field !== 'id' && c.field !== 'status')
      return [...id, ...st, ...resto].slice(0, 7)
    }
    return all.slice(0, 6)
  })()

  const renderCampo = (c) => {
    const campo = c.field
    const rotulo = rotuloCampo(campo)
    const val = form[campo] ?? ''
    const opcoes = selectsPorTabela[rotaTabela]?.[campo]

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

  const titulo = viewProdutos ? 'Produtos' : viewDptos ? 'Departamentos' : viewAjuda ? 'Ajuda' : viewHistorico ? 'Histórico de mensagens' : (metaAtual?.rotulo || 'Cadastros')
  const subtitulo = viewProdutos ? 'Catálogo de produtos' : viewDptos ? 'Setores e expediente' : viewAjuda ? 'Como usar o Dashboard' : viewHistorico ? 'Apagar todo o histórico de conversas' : 'Gerencie tabelas e configurações do sistema'

  if (loadingMeta) return <Loader />

  return (
    <>
      <Topbar title={titulo} subtitle={subtitulo} />

      {modelo && (
        <div className="modal-overlay" onClick={() => setModelo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {editing
                ? `Editar ${viewProdutos ? 'produto' : viewDptos ? 'departamento' : `registro #${editing.id}`}`
                : `Novo ${viewProdutos ? 'produto' : viewDptos ? 'departamento' : `registro em ${metaAtual?.rotulo || rotaTabela}`}`}
            </h3>
            <button className="modal-close" onClick={() => setModelo(false)} title="Fechar">✕</button>
            <div className="modal-scroll">
              {viewProdutos && (
                <>
                  <label>Nome</label>
                  <input className="input" value={formProduto.nome} onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })} style={{ marginBottom: 14 }} />
                  <label>Palavras para este produto ser localizado</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Ex.: gas, gas de cozinha, botijão grande, botijão pequeno"
                    value={formProduto.texto_busca}
                    onChange={(e) => setFormProduto({ ...formProduto, texto_busca: e.target.value })}
                    style={{ marginBottom: 14 }}
                  />
                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label>Preço (R$)</label>
                      <input className="input" type="number" step="0.01" value={formProduto.preco} onChange={(e) => setFormProduto({ ...formProduto, preco: e.target.value })} style={{ marginBottom: 14 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Estoque</label>
                      <input className="input" type="number" step="1" value={formProduto.estoque} onChange={(e) => setFormProduto({ ...formProduto, estoque: e.target.value })} style={{ marginBottom: 14 }} />
                    </div>
                  </div>
                  <label>Código da categoria</label>
                  <input className="input" type="number" step="1" placeholder="Opcional" value={formProduto.categoria_id} onChange={(e) => setFormProduto({ ...formProduto, categoria_id: e.target.value })} style={{ marginBottom: 14 }} />
                  <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 20 }}>
                    <input
                      type="checkbox"
                      checked={formProduto.ativo}
                      onChange={(e) => setFormProduto({ ...formProduto, ativo: e.target.checked })}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span>Produto ativo</span>
                  </label>
                </>
              )}

              {viewDptos && (
                <>
                  <label>Nome do departamento</label>
                  <input className="input" value={formDpt.departamento} onChange={(e) => setFormDpt({ ...formDpt, departamento: e.target.value })} style={{ marginBottom: 14 }} />
                  <label>WhatsApp do setor</label>
                  <input className="input" value={formDpt.num_whatsapp} onChange={(e) => setFormDpt({ ...formDpt, num_whatsapp: e.target.value })} placeholder="5511999999999" style={{ marginBottom: 14 }} />
                  <label>Nome do contato</label>
                  <input className="input" value={formDpt.nome_contato} onChange={(e) => setFormDpt({ ...formDpt, nome_contato: e.target.value })} style={{ marginBottom: 14 }} />
                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label>Expediente - início</label>
                      <input className="input" type="time" value={formDpt.expediente_h_inicio} onChange={(e) => setFormDpt({ ...formDpt, expediente_h_inicio: e.target.value })} style={{ marginBottom: 14 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Expediente - final</label>
                      <input className="input" type="time" value={formDpt.expediente_h_final} onChange={(e) => setFormDpt({ ...formDpt, expediente_h_final: e.target.value })} style={{ marginBottom: 14 }} />
                    </div>
                  </div>
                  <label>Dias de expediente</label>
                  <input className="input" value={formDpt.expediente_dia_semana} onChange={(e) => setFormDpt({ ...formDpt, expediente_dia_semana: e.target.value })} placeholder="SEGUNDA A SEXTA" style={{ marginBottom: 20 }} />
                </>
              )}

              {!viewProdutos && !viewDptos && (
                <>
                  {LEGENDA_LEITURA[rotaTabela] && (
                    <p className="text-muted text-sm" style={{ marginBottom: 12 }}>{LEGENDA_LEITURA[rotaTabela]}</p>
                  )}
                  {travados.filter((f) => colunas.some((c) => c.field === f)).map((f) => (
                    <div key={f} style={{ marginBottom: 12 }}>
                      <label>{rotuloCampo(f)}</label>
                      <input className="input" value={editing?.[f] ?? ''} disabled title="Somente leitura" />
                    </div>
                  ))}
                  {camposEditaveis.length === 0 && travados.length === 0 && <p className="text-muted text-sm">Nenhum campo editável</p>}
                  {camposEditaveis.map(renderCampo)}
                </>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </div>
      )}

      <div className="content animate-in" style={{ paddingTop: 0 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          {/* Menu lateral de cadastro */}
          <div className="card" style={{ padding: 12, width: 230, flexShrink: 0 }}>
            <div className="text-muted text-sm fw-700" style={{ padding: '4px 8px 10px' }}>
              <Database size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Cadastro
            </div>
            <div className="crud-menu">
              {meta.map((t) => {
                const Icone = iconeTabela[t.rota] || Database
                return (
                  <button
                    key={t.rota}
                    className={rotaTabela === t.rota && !viewProdutos && !viewDptos ? 'crud-menu-btn active' : 'crud-menu-btn'}
                    onClick={() => selecionar(`tabela:${t.rota}`)}
                    disabled={!t.existe}
                    title={t.existe ? t.rotulo : `${t.rotulo} (não existe)`}
                  >
                    <Icone size={15} />
                    <span style={{ flex: 1, textAlign: 'left' }}>{t.rotulo}</span>
                    {!t.existe && <span className="text-muted" style={{ fontSize: 11 }}>×</span>}
                  </button>
                )
              })}
              <div className="crud-menu-sep" />
              <button className={viewProdutos ? 'crud-menu-btn active' : 'crud-menu-btn'} onClick={() => selecionar('produtos')}>
                <Package size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>Produtos</span>
              </button>
              <button className={viewDptos ? 'crud-menu-btn active' : 'crud-menu-btn'} onClick={() => selecionar('departamentos')}>
                <Building2 size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>Departamentos</span>
              </button>
              <div className="crud-menu-sep" />
              <button className={viewHistorico ? 'crud-menu-btn active' : 'crud-menu-btn'} onClick={() => selecionar('historico')}>
                <MessageCircle size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>Histórico de mensagens</span>
              </button>
              <div className="crud-menu-sep" />
              <button className={viewAjuda ? 'crud-menu-btn active' : 'crud-menu-btn'} onClick={() => selecionar('ajuda')}>
                <HelpCircle size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>Ajuda</span>
              </button>
            </div>
          </div>

          {/* Conteúdo ao lado */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {viewHistorico ? (
              <div className="card" style={{ padding: 20, maxWidth: 760 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageCircle size={18} /> Histórico de mensagens
                </h3>
                <p className="text-muted text-sm">
                  Apaga <b>todas</b> as conversas de WhatsApp deste cliente. A exclusão remove o
                  arquivo permanente (exibido no painel) e a memória de trabalho do bot. Esta ação
                  <b> não pode ser desfeita</b>.
                </p>
                <div style={{ marginTop: 18 }}>
                  <button className="btn btn-danger" onClick={excluirTodoHistorico} disabled={limpando}>
                    <Trash2 size={15} />
                    {limpando ? 'Excluindo...' : 'Excluir todo o histórico de mensagens'}
                  </button>
                </div>
                <p className="text-muted text-sm" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={14} />
                  Para apagar apenas uma conversa específica, use a tela <b>Chat</b>.
                </p>
              </div>
            ) : viewAjuda ? (
              <div className="card" style={{ padding: 20, maxWidth: 900 }}>
                <h3>Ajuda — como operar o sistema</h3>
                <p className="text-muted text-sm">Guia completo das telas. Use o menu lateral para navegar; o botão de seta no rodapé recolhe/expande o menu.</p>

                <h3>Entrando no sistema</h3>
                <ul>
                  <li>Acesse com seu usuário e senha. Sem conta? Use <b>Criar conta</b> na tela de login.</li>
                  <li>Seu <b>nome e CNPJ</b> aparecem no rodapé do menu lateral. <b>Sair</b> encerra a sessão.</li>
                </ul>

                <h3>Visão Geral (Dashboard)</h3>
                <p>Tela inicial com as <b>métricas do negócio</b> (pedidos, valores, ticket). Use o filtro de <b>período</b> para ver hoje, semana ou mês.</p>

                <h3>Vendas e Pedidos</h3>
                <ul>
                  <li><b>Histórico completo</b> dos pedidos, do mais recente ao mais antigo.</li>
                  <li>No menu lateral, cada venda tem uma <b>bolinha de cor</b>: <b>vermelha</b> = aguardando aceite/atribuição, <b>amarela</b> = em rota ou aceita, <b>verde</b> = entregue.</li>
                  <li>Clique na venda para <b>ver detalhes, editar dados, atribuir entregador e acompanhar o status e o pagamento</b>.</li>
                  <li><b>Ver todas as vendas</b> abre a lista completa.</li>
                </ul>

                <h3>WhatsApp (Conversas)</h3>
                <ul>
                  <li><b>Histórico dos atendimentos</b> do robô com cada cliente, por número.</li>
                  <li>Use <b>Buscar conversa...</b> para achar um atendimento.</li>
                  <li><b>Excluir todas as mensagens deste número</b> apaga o histórico daquela conversa.</li>
                </ul>

                <h3>Histórico de mensagens (em Cadastros)</h3>
                <ul>
                  <li>O item <b>Histórico de mensagens</b> no menu de Cadastros apaga <b>todo</b> o histórico de WhatsApp do cliente de uma vez.</li>
                  <li>A exclusão remove o arquivo permanente (painel) e a memória de trabalho do bot, e <b>não pode ser desfeita</b>.</li>
                </ul>

                <h3>Entregas</h3>
                <ul>
                  <li><b>Gestão das entregas e status</b>. O ciclo é: <b>pendente → aceita → em trânsito → entregue</b> (ou <b>cancelada</b>).</li>
                  <li><b>Nova entrega</b> lança uma entrega manual (rota, entregador, pedido).</li>
                </ul>

                <h3>Rastreamento</h3>
                <ul>
                  <li><b>Mapa em tempo real</b> com entregadores e vendas.</li>
                  <li>No menu lateral cada entregador mostra <b>On</b> (posição dos últimos 5 min) ou <b>Off</b>; <b>clique para localizar no mapa</b>.</li>
                </ul>

                <h3>Entregadores</h3>
                <p><b>Cadastro dos profissionais de entrega</b>: <b>Novo</b> para incluir, <b>lápis</b> para editar, <b>lixeira</b> para excluir. O submenu lateral mostra quem está online e o link <b>Cadastro</b>.</p>

                <h3>Departamentos</h3>
                <p>Setores de atendimento: nome, <b>WhatsApp do setor</b>, contato e <b>expediente</b> (horário de início/fim e dias, ex.: SEGUNDA A SEXTA).</p>

                <h3>Cadastros (esta tela)</h3>
                <ul>
                  <li><b>Produtos</b>: catálogo — <b>nome, preço, estoque</b> e chave <b>Ativo/Inativo</b> (inativo não é oferecido na venda).</li>
                  <li><b>Tabelas</b> (menu ao lado: clientes, pedidos, formas de pagamento, chaves PIX, redirecionamentos): use a <b>busca</b>, <b>Novo registro</b> para incluir e <b>lápis/lixeira</b> para editar/excluir.</li>
                </ul>

                <h3>Dicas rápidas</h3>
                <ul>
                  <li>Quase toda lista tem <b>busca</b> no topo — use para achar registros.</li>
                  <li>Olhe as <b>cores</b> (bolinhas e selos): elas resumem a situação sem abrir nada.</li>
                  <li>Terminou? Clique em <b>Sair</b> no rodapé do menu.</li>
                </ul>
              </div>
            ) : (
            <>
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
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => (viewProdutos ? loadProdutos() : viewDptos ? loadDptos() : loadLinhas())}
                  title="Recarregar"
                >
                  <RefreshCw size={15} />
                </button>
                {/* Config sem "Novo": CNPJ novo so via Delphi/API. */}
                {rotaTabela !== 'config' && (
                <button
                  className="btn btn-primary"
                  onClick={abrirNovo}
                  disabled={!viewProdutos && !viewDptos && camposEditaveis.length === 0}
                >
                  <Plus size={16} />
                  Novo registro
                </button>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: '0 0 16px 16px' }}>
                <table className="data-table">
                  <thead>
                    {viewProdutos && (
                      <tr>
                        <th>ID</th><th>Produto</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th>
                      </tr>
                    )}
                    {viewDptos && (
                      <tr>
                        <th>ID</th><th>Departamento</th><th>WhatsApp</th><th>Contato</th><th>Expediente</th><th>Ações</th>
                      </tr>
                    )}
                    {!viewProdutos && !viewDptos && colunasResumidas.length > 0 && (
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

                    {viewProdutos && !carregando && filtradosProdutos.map((p) => (
                      <tr key={p.id}>
                        <td>#{p.id}</td>
                        <td className="fw-700">{p.nome}</td>
                        <td className="fw-700">{formatBRL(p.preco)}</td>
                        <td>{p.estoque}</td>
                        <td>
                          <span className={p.ativo ? 'badge badge-success' : 'badge badge-danger'}>
                            {p.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-ghost btn-icon" style={{ padding: 0 }} onClick={() => abrirEdicao(p)} title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button className="btn btn-danger btn-icon" style={{ padding: 0 }} onClick={() => excluir(p)} title="Excluir">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {viewDptos && !carregando && filtradosDptos.map((d) => (
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
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <button className="btn btn-ghost btn-icon" style={{ padding: 0 }} onClick={() => abrirEdicao(d)} title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button className="btn btn-danger btn-icon" style={{ padding: 0 }} onClick={() => excluir(d)} title="Excluir">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!viewProdutos && !viewDptos && !carregando && filtradasTabela.map((l) => (
                      <tr key={l.id}>
                        {colunasResumidas.map((c) => (
                          <td key={c.field}>
                            {c.field === 'status'
                              ? (statusCor[String(l[c.field]).toUpperCase()] || null)
                                ? <span className={statusCor[String(l[c.field]).toUpperCase()]}>{valorExibicao(l[c.field])}</span>
                                : valorExibicao(l[c.field])
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

                    {!carregando && viewProdutos && filtradosProdutos.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>Nenhum produto encontrado</td></tr>
                    )}
                    {!carregando && viewDptos && filtradosDptos.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>Nenhum departamento encontrado</td></tr>
                    )}
                    {!carregando && !viewProdutos && !viewDptos && colunas.length === 0 && (
                      <tr><td colSpan={2} style={{ textAlign: 'center', padding: 40 }}>Selecione um item no menu lateral</td></tr>
                    )}
                    {!carregando && !viewProdutos && !viewDptos && colunas.length > 0 && filtradasTabela.length === 0 && (
                      <tr><td colSpan={colunasResumidas.length + 1} style={{ textAlign: 'center', padding: 40 }}>Nenhum registro encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <span className="text-muted text-sm">
                {viewProdutos
                  ? `Produtos: ${filtradosProdutos.length} de ${produtos.length}`
                  : viewDptos
                    ? `Departamentos: ${filtradosDptos.length} de ${dptos.length}`
                    : `${metaAtual?.rotulo}: ${filtradasTabela.length} de ${linhas.length} registros`}
                </span>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}