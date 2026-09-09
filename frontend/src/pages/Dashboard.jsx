import { useEffect, useState } from 'react'
import api from '../api/client'
import { StatCard } from '../components/StatCard'
import { Topbar } from '../components/Topbar'
import { Loader, formatBRL, formatDate } from '../components/utils'
import { ShoppingBag, DollarSign, TrendingUp, Package } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171']

export function Dashboard() {
  const [kpis, setKpis] = useState(null)
  const [vendasDia, setVendasDia] = useState([])
  const [metodos, setMetodos] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [topProdutos, setTopProdutos] = useState([])
  const [periodo, setPeriodo] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [k, v, m, p] = await Promise.all([
          api.get('/vendas/kpisdash', { params: { dias: periodo } }),
          api.get('/vendas/vendas-dia', { params: { dias: periodo } }),
          api.get('/vendas/metodos-pagamento'),
          api.get('/vendas/pedidos', { params: { limite: 8 } }),
        ])
        setKpis(k.data.dados)
        setVendasDia(v.data.dados)
        setMetodos(m.data.dados)
        setPedidos(p.data.dados)
        setTopProdutos(k.data.dados.top_produtos || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [periodo])

  if (loading || !kpis) return <Loader />

  return (
    <>
      <Topbar title="Visão Geral" subtitle="Métricas principais do seu negócio" />

      <div className="content animate-in">
        <div className="row space-between wrap" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Bem-vindo ao seu painel</h2>
          <div className="row">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={periodo === d ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setPeriodo(d)}
                style={{ padding: '8px 14px' }}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        <div className="stats-grid">
          <StatCard icon={Package} value={kpis.total_pedidos} label="Pedidos totais" color="#6366f1" bg="rgba(99,102,241,0.15)" />
          <StatCard icon={DollarSign} value={formatBRL(kpis.receita_total)} label="Receita total" color="#34d399" bg="rgba(52,211,153,0.15)" />
          <StatCard icon={TrendingUp} value={formatBRL(kpis.ticket_medio)} label="Ticket médio" color="#fbbf24" bg="rgba(251,191,36,0.15)" />
          <StatCard icon={ShoppingBag} value={kpis.pedidos_periodo} label={`Pedidos (${periodo}d)`} color="#22d3ee" bg="rgba(34,211,238,0.15)" />
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">Vendas por dia</div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={vendasDia}>
                <defs>
                  <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="data" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(8, 10) + '/' + v.slice(5, 7)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#151b2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#e5e9f0' }}
                  labelFormatter={(v) => 'Dia ' + v}
                />
                <Area type="monotone" dataKey="receita" name="Receita" stroke="#6366f1" strokeWidth={2.5} fill="url(#gradReceita)" />
                <Area type="monotone" dataKey="pedidos" name="Pedidos" stroke="#22d3ee" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title">Métodos de pagamento</div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={metodos} dataKey="quantidade" nameKey="metodo" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={4}>
                  {metodos.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#151b2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#e5e9f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid-2-equal" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">Top produtos vendidos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topProdutos.slice(0, 6).map((p, i) => (
                <div key={i} className="row space-between" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                  <div className="flex gap-2">
                    <span style={{ width: 24, height: 24, borderRadius: 8, background: COLORS[i % COLORS.length] + '33', color: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.nome}</span>
                  </div>
                  <div className="text-sm text-muted">{p.quantidade} un · {formatBRL(p.receita)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Receita por produto</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProdutos.slice(0, 5)} layout="vertical">
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={100} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => (v.length > 18 ? v.slice(0, 18) + '…' : v)} />
                <Tooltip
                  contentStyle={{ background: '#151b2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#e5e9f0' }}
                  formatter={(v) => formatBRL(v)}
                />
                <Bar dataKey="receita" name="Receita" radius={[0, 8, 8, 0]}>
                  {topProdutos.slice(0, 5).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Últimos pedidos</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Pagamento</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>{p.produto}</td>
                    <td>{p.nome || '—'}</td>
                    <td className="fw-700">{formatBRL(p.valor)}</td>
                    <td>{p.pagamento}</td>
                    <td className="text-muted">{formatDate(p.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}