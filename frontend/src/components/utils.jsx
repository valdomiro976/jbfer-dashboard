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
    let s = v
    if (typeof s === 'string' && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
      // Trata como UTC se não houver informação de fuso
      s = s.replace(' ', 'T') + 'Z'
    }
    const d = new Date(s)
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