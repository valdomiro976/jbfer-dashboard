import { createContext, useState, useContext, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dashboard_user') || 'null')
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)

  const login = async (cnpj, password) => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { cnpj, password })
      localStorage.setItem('dashboard_token', data.access_token)
      localStorage.setItem('dashboard_user', JSON.stringify({ cnpj: data.cnpj, name: data.name, role: data.role }))
      setUser({ cnpj: data.cnpj, name: data.name, role: data.role })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.response?.data?.detail || 'Falha no login' }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('dashboard_token')
    localStorage.removeItem('dashboard_user')
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)