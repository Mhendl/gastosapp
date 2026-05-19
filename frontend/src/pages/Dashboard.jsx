import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../services/api';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatMonto(n, moneda = 'ARS') {
  return moneda === 'USD'
    ? `USD ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    setLoading(true);
    api.get(`/gastos/resumen?mes=${mes}&anio=${anio}`)
      .then(r => setResumen(r.data))
      .finally(() => setLoading(false));
  }, [mes, anio]);

  const totalARS = resumen?.totales?.find(t => t.moneda === 'ARS')?.total || 0;
  const totalUSD = resumen?.totales?.find(t => t.moneda === 'USD')?.total || 0;
  const cantidadTotal = resumen?.totales?.reduce((a, b) => a + b.cantidad, 0) || 0;

  const chartData = (resumen?.porMes || [])
    .filter(r => r.moneda === 'ARS')
    .slice(0, 6)
    .reverse()
    .map(r => ({
      mes: r.mes.split('-')[1] ? MESES[parseInt(r.mes.split('-')[1]) - 1] : r.mes,
      total: r.total
    }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hola, {user.nombre} 👋</h1>
          <p style={{ color: 'var(--text2)', marginTop: 2 }}>Resumen de gastos</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={mes} onChange={e => setMes(e.target.value)} style={{ width: 120 }}>
            {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={anio} onChange={e => setAnio(e.target.value)} style={{ width: 90 }}>
            {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spin" /></div>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="card">
              <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>TOTAL ARS</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)' }}>{formatMonto(totalARS)}</div>
            </div>
            {totalUSD > 0 && (
              <div className="card">
                <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>TOTAL USD</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)' }}>{formatMonto(totalUSD, 'USD')}</div>
              </div>
            )}
            <div className="card">
              <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>CANTIDAD</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{cantidadTotal} gastos</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Por categoría */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Por categoría (ARS)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(resumen?.porCategoria || []).filter(c => c.moneda === 'ARS').slice(0, 8).map((cat, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{cat.icono} {cat.nombre}</span>
                      <span style={{ fontWeight: 600 }}>{formatMonto(cat.total)}</span>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 4 }}>
                      <div style={{
                        width: `${Math.min(100, (cat.total / totalARS) * 100)}%`,
                        background: cat.color || 'var(--accent)',
                        height: '100%', borderRadius: 4, transition: 'width 0.5s'
                      }} />
                    </div>
                  </div>
                ))}
                {resumen?.porCategoria?.filter(c => c.moneda === 'ARS').length === 0 && (
                  <p style={{ color: 'var(--text2)', textAlign: 'center', padding: '20px 0' }}>Sin gastos este mes</p>
                )}
              </div>
            </div>

            {/* Gráfico últimos 6 meses */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Últimos 6 meses (ARS)</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                    <Tooltip
                      formatter={v => formatMonto(v)}
                      contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#f1f5f9' }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => <Cell key={i} fill="#6366f1" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text2)' }}>
                  Sin datos históricos
                </div>
              )}
            </div>
          </div>

          {/* Accesos rápidos */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/chat" className="btn btn-primary">🤖 Cargar gasto con IA</Link>
            <Link to="/gastos" className="btn btn-ghost">📋 Ver todos los gastos</Link>
          </div>
        </>
      )}
    </div>
  );
}
