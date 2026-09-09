import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { Boxes } from 'lucide-react'

export function Login() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [cnpj, setCnpj] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [registering, setRegistering] = useState(false)
  const [regName, setRegName] = useState('')
  const [regCnpj, setRegCnpj] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMsg('')
    const result = await login(cnpj, password)
    if (result.ok) {
      navigate('/')
    } else {
      setError(result.error)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.post('/auth/register', {
        cnpj: regCnpj,
        password: regPassword,
        name: regName,
      })
      setMsg('Usuário criado com sucesso! Faça o login.')
      setRegistering(false)
      setCnpj(regCnpj)
      setPassword('')
      setRegPassword('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao criar usuário')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-area">
          <div className="logo-icon" style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Boxes size={26} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard JBFER</h2>
            <p className="text-muted text-sm">Gerencie vendas, WhatsApp e entregas</p>
          </div>
        </div>

        {!registering ? (
          <form onSubmit={handleSubmit}>
            <label>CNPJ</label>
            <input
              className="input"
              placeholder="Digite seu CNPJ"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              style={{ marginBottom: 16 }}
              autoFocus
            />

            <label>Senha</label>
            <input
              className="input"
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: 20 }}
            />

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14, background: 'rgba(248,113,113,0.1)', padding: '10px 14px', borderRadius: 10 }}>
                {error}
              </div>
            )}
            {msg && (
              <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 14, background: 'rgba(52,211,153,0.1)', padding: '10px 14px', borderRadius: 10 }}>
                {msg}
              </div>
            )}

            <button className="btn btn-primary" type="submit" style={{ width: '100%', padding: 13, fontSize: 15 }} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar no Dashboard'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setRegistering(true); setError(''); setMsg('') }}
              >
                Primeiro acesso? Cadastrar CNPJ
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <h3 style={{ marginBottom: 16 }}>Criar conta</h3>

            <label>Nome da empresa / dono</label>
            <input className="input" placeholder="Ex.: JBFER Distribuidora" value={regName} onChange={(e) => setRegName(e.target.value)} style={{ marginBottom: 16 }} />

            <label>CNPJ</label>
            <input className="input" placeholder="Ex.: 02408190000136-1" value={regCnpj} onChange={(e) => setRegCnpj(e.target.value)} style={{ marginBottom: 16 }} />

            <label>Senha</label>
            <input className="input" type="password" placeholder="Crie uma senha" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} style={{ marginBottom: 20 }} />

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14, background: 'rgba(248,113,113,0.1)', padding: '10px 14px', borderRadius: 10 }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit" style={{ width: '100%', padding: 13, fontSize: 15 }}>
              Criar conta
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRegistering(false)}>
                Voltar para login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}