import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { NotificacoesBell } from './NotificacoesBell'

export function Topbar({ title, subtitle }) {
  const [date, setDate] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setDate(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const dataStr = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <header className="topbar">
      <button
        className="hamburger"
        onClick={() => window.dispatchEvent(new Event('sidebar:toggle'))}
        title="Menu"
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>
      <div className="page-title">
        <h1>{title}</h1>
        <p>{subtitle || dataStr}</p>
      </div>
      <div className="row">
        <NotificacoesBell />
      </div>
    </header>
  )
}