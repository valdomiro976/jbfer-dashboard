export function Loader() {
  return <div className="loading">Carregando dados...</div>
}

export function Empty({ message = 'Nenhum dado encontrado' }) {
  return (
    <div className="loading" style={{ fontSize: 14, padding: 40 }}>
      {message}
    </div>
  )
}

export function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v || 0)
}

export function formatDate(v) {
  if (!v) return '—'
  try {
    const d = new Date(v)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return v
  }
}

export function statusBadge(status) {
  const map = {
    pendente: <span className="badge badge-warning">Pendente</span>,
    aceita: <span className="badge badge-primary">Aceita</span>,
    em_transito: <span className="badge badge-warning">Em trânsito</span>,
    entregue: <span className="badge badge-success">Entregue</span>,
    cancelada: <span className="badge badge-danger">Cancelada</span>,
  }
  return map[status] || <span className="badge badge-primary">{status}</span>
}