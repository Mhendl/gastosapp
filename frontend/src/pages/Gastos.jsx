import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

function formatMonto(n, moneda = 'ARS') {
  return moneda === 'USD'
    ? `USD ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

const MONEDAS = ['ARS', 'USD', 'EUR'];

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', categoria: '', moneda: '', buscar: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const cargar = useCallback(() => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([,v]) => v)));
    setLoading(true);
    Promise.all([
      api.get('/gastos?' + params),
      api.get('/gastos/categorias')
    ]).then(([g, c]) => {
      setGastos(g.data);
      setCategorias(c.data);
    }).finally(() => setLoading(false));
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setForm({ descripcion: '', monto: '', moneda: 'ARS', categoria_id: '', fecha: new Date().toISOString().split('T')[0], notas: '' });
    setEditId(null);
    setModal('gasto');
  }

  function abrirEditar(g) {
    setForm({ descripcion: g.descripcion, monto: g.monto, moneda: g.moneda, categoria_id: g.categoria_id || '', fecha: g.fecha, notas: g.notas || '' });
    setEditId(g.id);
    setModal('gasto');
  }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/gastos/${editId}`, form);
      } else {
        await api.post('/gastos', form);
      }
      setModal(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await api.delete(`/gastos/${id}`);
    cargar();
  }

  const origenBadge = { ia: { bg: '#312e81', color: '#a5b4fc', label: 'IA' }, archivo: { bg: '#1c1917', color: '#d6d3d1', label: 'Archivo' }, manual: { bg: '#1e3a5f', color: '#93c5fd', label: 'Manual' } };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>📋 Mis Gastos</h1>
        <button onClick={abrirNuevo} className="btn btn-primary">+ Nuevo gasto</button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Buscar..." value={filtros.buscar} onChange={e => setFiltros(f => ({ ...f, buscar: e.target.value }))} style={{ width: 180 }} />
        <input type="date" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} style={{ width: 140 }} />
        <input type="date" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} style={{ width: 140 }} />
        <select value={filtros.categoria} onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))} style={{ width: 160 }}>
          <option value="">Todas las cat.</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </select>
        <select value={filtros.moneda} onChange={e => setFiltros(f => ({ ...f, moneda: e.target.value }))} style={{ width: 100 }}>
          <option value="">Moneda</option>
          {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={() => setFiltros({ desde: '', hasta: '', categoria: '', moneda: '', buscar: '' })} className="btn btn-ghost">Limpiar</button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spin" /></div>
        ) : gastos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            No hay gastos. <button onClick={abrirNuevo} style={{ background: 'none', color: 'var(--accent)', fontWeight: 600 }}>Agregar uno</button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Origen</th><th></th>
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => {
                const ob = origenBadge[g.origen] || origenBadge.manual;
                return (
                  <tr key={g.id}>
                    <td style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{g.descripcion}</div>
                      {g.notas && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{g.notas}</div>}
                    </td>
                    <td>
                      {g.categoria_icono && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 99, background: g.categoria_color + '22', color: g.categoria_color, fontSize: 12, fontWeight: 600 }}>
                          {g.categoria_icono} {g.categoria_nombre}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>{formatMonto(g.monto, g.moneda)}</td>
                    <td><span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: ob.bg, color: ob.color }}>{ob.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEditar(g)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>Editar</button>
                        <button onClick={() => eliminar(g.id)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}>Borrar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal gasto */}
      {modal === 'gasto' && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 480 }}>
            <h2 style={{ marginBottom: 20, fontSize: 16, fontWeight: 700 }}>{editId ? 'Editar' : 'Nuevo'} gasto</h2>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>DESCRIPCIÓN</label>
                <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} required placeholder="Ej: Almuerzo" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>MONTO</label>
                  <input type="number" step="0.01" min="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} required placeholder="0.00" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>MONEDA</label>
                  <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}>
                    {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>CATEGORÍA</label>
                  <select value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                    <option value="">Sin categoría</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>FECHA</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>NOTAS (opcional)</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Nota adicional..." />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spin" style={{ width: 14, height: 14 }} /> : (editId ? 'Guardar cambios' : 'Agregar gasto')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
