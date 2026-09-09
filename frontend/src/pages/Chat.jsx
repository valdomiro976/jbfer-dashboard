import { useEffect, useState, useRef } from 'react'
import api from '../api/client'
import { Topbar } from '../components/Topbar'
import { Loader, formatDate } from '../components/utils'
import { MessageCircle, Search, Trash2 } from 'lucide-react'

export function Chat() {
  const [conversas, setConversas] = useState([])
  const [mensagens, setMensagens] = useState([])
  const [ativo, setAtivo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const msgsRef = useRef(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get('/chat/conversas')
        setConversas(data.dados)
        if (data.dados.length > 0) {
          setAtivo(data.dados[0].numero)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!ativo) return
    async function loadMsgs() {
      try {
        const { data } = await api.get(`/chat/conversas/${ativo}`)
        setMensagens(data.dados)
      } catch (e) {
        console.error(e)
      }
    }
    loadMsgs()
  }, [ativo])

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight
    }
  }, [mensagens, ativo])

  const conversasFiltradas = conversas.filter((c) => {
    const t = busca.toLowerCase()
    return !t || c.nome.toLowerCase().includes(t) || c.numero.includes(t)
  })

  if (loading) return <Loader />

  const convAtiva = conversas.find((c) => c.numero === ativo)

  const excluirConversa = async () => {
    if (!ativo) return
    const qtd = convAtiva?.total_mensagens || mensagens.length || 0
    if (!confirm(`Excluir TODAS as mensagens deste número (${qtd} msg)?\n\nEssa ação não pode ser desfeita.`)) return
    try {
      await api.delete(`/chat/conversas/${encodeURIComponent(ativo)}`)
      setMensagens([])
      setConversas((cs) => cs.filter((c) => c.numero !== ativo))
      setAtivo(null)
      alert('Mensagens excluídas')
    } catch (e) {
      console.error(e)
      alert('Erro ao excluir mensagens')
    }
  }

  return (
    <>
      <Topbar title="Conversas WhatsApp" subtitle="Histórico completo de atendimentos" />

      <div className="content animate-in" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="chat-layout">
          <div className="card chat-sidebar" style={{ padding: 16 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Buscar conversa..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>

            <div className="chat-list">
              {conversasFiltradas.map((c) => (
                <div
                  key={c.numero}
                  className={ativo === c.numero ? 'chat-item active' : 'chat-item'}
                  onClick={() => setAtivo(c.numero)}
                >
                  <div className="chat-avatar">{c.nome.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                    <div className="text-muted text-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.numero}</span>
                      <span>{c.total_mensagens} msgs</span>
                    </div>
                  </div>
                </div>
              ))}
              {conversasFiltradas.length === 0 && (
                <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 24 }}>
                  Nenhuma conversa encontrada
                </div>
              )}
            </div>
          </div>

          <div className="card chat-body" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="chat-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {convAtiva ? convAtiva.nome.charAt(0).toUpperCase() : '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{convAtiva ? convAtiva.nome : 'Selecione uma conversa'}</div>
                <div className="text-muted text-sm">{convAtiva?.numero}</div>
              </div>
              {convAtiva && (
                <button
                  className="btn btn-danger"
                  style={{ padding: '8px 12px' }}
                  onClick={excluirConversa}
                  title="Excluir todas as mensagens deste número"
                >
                  <Trash2 size={15} />
                  Excluir msgs
                </button>
              )}
            </div>

            <div className="chat-messages" ref={msgsRef}>
              {mensagens.length === 0 && (
                <div className="text-muted text-sm" style={{ textAlign: 'center', padding: 40 }}>
                  <MessageCircle size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <br />
                  Nenhuma mensagem nesta conversa
                </div>
              )}
              {mensagens.map((m, i) => {
                const role = m.role || 'user'
                const texto = m.mensagem || m.texto || ''
                return (
                  <div key={i} className={'msg ' + (role === 'user' ? 'user' : 'assistant')}>
                    <div>{texto}</div>
                    <div className="msg-time">{formatDate(m.created_at || m.timestamp)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}