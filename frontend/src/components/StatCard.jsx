export function StatCard({ icon: Icon, value, label, trend, color = '#6366f1', bg = 'rgba(99,102,241,0.15)' }) {
  return (
    <div className="stat-card card card-hover">
      <div className="stat-icon" style={{ background: bg, color }}>
        <Icon size={22} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {trend && <div className="stat-trend" style={{ color: trend.startsWith('-') ? 'var(--danger)' : 'var(--success)' }}>{trend}</div>}
    </div>
  )
}