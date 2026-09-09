import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

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
      <div className="page-title">
        <h1>{title}</h1>
        <p>{subtitle || dataStr}</p>
      </div>
      <div className="row">
        <button className="btn btn-ghost">
          <Bell size={16} />
          Notificações
        </button>
      </div>
    </header>
  )
}