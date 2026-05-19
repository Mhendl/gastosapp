import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const MESES_NOMBRES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function fmt(n, moneda = 'ARS') {
  if (!n && n !== 0) return '-';
  return moneda === 'USD'
    ? `USD ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
}

function mesLabel(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return `${MESES_NOMBRES[parseInt(m) - 1]} ${y}`;
}

const mesActual = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();

const categorias = [
  { id: 1, nombre: 'Comida', icono: '🍔' }, { id: 2, nombre: 'Transporte', icono: '🚗' },
  { id: 3, nombre: 'Servicios', icono: '💡' }, { id: 4, nombre: 'Salud', icono: '❤️' },
  { id: 5, nombre: 'Entretenimiento', icono: '🎬' }, { id: 6, nombre: 'Supermercado', icono: '🛒' },
  { id: 7, nombre: 'Ropa', icono: '👕' }, { id: 8, nombre: 'Educación', icono: '📚' },
  { id: 9, nombre: 'Hogar', icono: '🏠' }, { id: 10, nombre: 'Tarjeta de Crédito', icono: '💳' },
  { id: 11, nombre: 'Otros', icono: '📦' },
];

const FORM_GASTO_VACIO = { descripcion: '', monto: '', moneda: 'ARS', categoria_id: '', tipo: 'fijo', cuota_actual: '', cuota_total: '', mes_referencia: mesActual };
const FORM_INGRESO_VACIO = { descripcion: '', monto: '', moneda: 'ARS' };

export default function Proyeccion() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [meses, setMeses] = useState(6);
  const [tab, setTab] = useState('proyeccion'); // 'proyeccion' | 'config'
  const [formGasto, setFormGasto] = useState(FORM_GASTO_VACIO);
  const [formIngreso, setFormIngreso] = useState(FORM_INGRESO_VACIO);
  const [editingGasto, setEditingGasto] = useState(null);
  const [editingIngreso, setEditingIngreso] = useState(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    api.get(`/proyeccion?meses=${meses}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [meses]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarGasto(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formGasto,
        monto: parseFloat(formGasto.monto),
        categoria_id: formGasto.categoria_id || null,
        cuota_actual: formGasto.tipo === 'cuota' ? parseInt(formGasto.cuota_actual) : null,
        cuota_total: formGasto.tipo === 'cuota' ? parseInt(formGasto.cuota_total) : null,
        mes_referencia: formGasto.tipo === 'cuota' ? formGasto.mes_referencia : null,
      };
      if (editingGasto) {
        await api.put(`/recurrentes/gastos/${editingGasto}`, payload);
      } else {
        await api.post('/recurrentes/gastos', payload);
      }
      setFormGasto(FORM_GASTO_VACIO);
      setEditingGasto(null);
      cargar();
    } finally {
      setSaving(false);
    }
  }

  async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    await api.delete(`/recurrentes/gastos/${id}`);
    cargar();
  }

  function editarGasto(g) {
    setFormGasto({
      descripcion: g.descripcion, monto: String(g.monto), moneda: g.moneda,
      categoria_id: g.categoria_id || '', tipo: g.tipo,
      cuota_actual: g.cuota_actual || '', cuota_total: g.cuota_total || '',
      mes_referencia: g.mes_referencia || mesActual,
    });
    setEditingGasto(g.id);
    setTab('config');
  }

  async function guardarIngreso(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formIngreso, monto: parseFloat(formIngreso.monto) };
      if (editingIngreso) {
        await api.put(`/recurrentes/ingresos/${editingIngreso}`, payload);
      } else {
        await api.post('/recurrentes/ingresos', payload);
      }
      setFormIngreso(FORM_INGRESO_VACIO);
      setEditingIngreso(null);
      cargar();
    } finally {
      setSaving(false);
    }
  }

  async function eliminarIngreso(id) {
    if (!confirm('¿Eliminar este ingreso?')) return;
    await api.delete(`/recurrentes/ingresos/${id}`);
    cargar();
  }

  function editarIngreso(i) {
    setFormIngreso({ descripcion: i.descripcion, monto: String(i.monto), moneda: i.moneda });
    setEditingIngreso(i.id);
    setTab('config');
  }

  const gastosFijos = data?.gastos?.filter(g => g.tipo === 'fijo') || [];
  const gastosCuotas = data?.gastos?.filter(g => g.tipo === 'cuota') || [];
  const ingresos = data?.ingresos || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Proyección mensual 📅</h1>
          <p style={{ color: 'var(--text2)', marginTop: 2 }}>Planificá los próximos meses con gastos fijos y cuotas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={meses} onChange={e => setMeses(Number(e.target.value))} style={{ width: 130 }}>
            {[3,6,9,12,18,24].map(n => <option key={n} value={n}>{n} meses</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'proyeccion', label: '📊 Proyección' },
          { key: 'config', label: '⚙️ Configurar gastos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--accent)' : 'var(--text2)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, fontSize: 14
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spin" /></div>
      ) : tab === 'proyeccion' ? (
        <VistaProyeccion data={data} onEditarGasto={editarGasto} onEditarIngreso={editarIngreso} />
      ) : (
        <VistaConfig
          gastosFijos={gastosFijos} gastosCuotas={gastosCuotas} ingresos={ingresos}
          formGasto={formGasto} setFormGasto={setFormGasto}
          formIngreso={formIngreso} setFormIngreso={setFormIngreso}
          editingGasto={editingGasto} editingIngreso={editingIngreso}
          saving={saving}
          onGuardarGasto={guardarGasto} onEliminarGasto={eliminarGasto}
          onCancelarGasto={() => { setFormGasto(FORM_GASTO_VACIO); setEditingGasto(null); }}
          onGuardarIngreso={guardarIngreso} onEliminarIngreso={eliminarIngreso}
          onCancelarIngreso={() => { setFormIngreso(FORM_INGRESO_VACIO); setEditingIngreso(null); }}
          onEditarGasto={editarGasto} onEditarIngreso={editarIngreso}
        />
      )}
    </div>
  );
}

function VistaProyeccion({ data }) {
  if (!data?.proyeccion?.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <p>No hay gastos configurados todavía.</p>
        <p style={{ fontSize: 13 }}>Andá a "Configurar gastos" para agregar tus gastos fijos y cuotas.</p>
      </div>
    );
  }

  const { proyeccion } = data;
  const tieneUSD = proyeccion.some(m => m.totalUSD > 0 || m.ingresoUSD > 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
        <thead>
          <tr>
            <th style={thStyle('left', true)}>Concepto</th>
            {proyeccion.map(m => (
              <th key={m.mes} style={thStyle('right', true)}>{mesLabel(m.mes)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Gastos fijos */}
          {data.gastos.filter(g => g.tipo === 'fijo').length > 0 && (
            <>
              <tr>
                <td colSpan={proyeccion.length + 1} style={sectionStyle}>GASTOS FIJOS</td>
              </tr>
              {data.gastos.filter(g => g.tipo === 'fijo').map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle('left')}>
                    {g.categoria_icono && <span style={{ marginRight: 6 }}>{g.categoria_icono}</span>}
                    {g.descripcion}
                  </td>
                  {proyeccion.map(m => {
                    const aparece = m.gastos.find(x => x.id === g.id);
                    return (
                      <td key={m.mes} style={tdStyle('right', g.moneda === 'USD' ? '#854d0e' : undefined)}>
                        {aparece ? fmt(g.monto, g.moneda) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          )}

          {/* Cuotas */}
          {data.gastos.filter(g => g.tipo === 'cuota').length > 0 && (
            <>
              <tr>
                <td colSpan={proyeccion.length + 1} style={sectionStyle}>CUOTAS / TARJETA</td>
              </tr>
              {data.gastos.filter(g => g.tipo === 'cuota').map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle('left')}>
                    {g.categoria_icono && <span style={{ marginRight: 6 }}>{g.categoria_icono}</span>}
                    {g.descripcion}
                    <span style={{ color: 'var(--text2)', fontSize: 11, marginLeft: 6 }}>
                      ({g.cuota_actual}/{g.cuota_total})
                    </span>
                  </td>
                  {proyeccion.map(m => {
                    const item = m.gastos.find(x => x.id === g.id);
                    return (
                      <td key={m.mes} style={tdStyle('right', g.moneda === 'USD' ? '#854d0e' : undefined)}>
                        {item
                          ? <span title={`Cuota ${item.cuota_num}/${g.cuota_total}`}>{fmt(g.monto, g.moneda)}</span>
                          : <span style={{ color: 'var(--text2)', fontSize: 11 }}>✓</span>
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          )}

          {/* Subtotal gastos */}
          <tr style={{ borderTop: '2px solid var(--border)' }}>
            <td style={{ ...tdStyle('left'), fontWeight: 700, color: 'var(--danger)' }}>Total gastos ARS</td>
            {proyeccion.map(m => (
              <td key={m.mes} style={{ ...tdStyle('right'), fontWeight: 700, color: 'var(--danger)' }}>
                {fmt(m.totalARS)}
              </td>
            ))}
          </tr>
          {tieneUSD && (
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ ...tdStyle('left'), fontWeight: 700, color: '#b45309' }}>Total gastos USD</td>
              {proyeccion.map(m => (
                <td key={m.mes} style={{ ...tdStyle('right'), fontWeight: 700, color: '#b45309' }}>
                  {m.totalUSD > 0 ? fmt(m.totalUSD, 'USD') : '-'}
                </td>
              ))}
            </tr>
          )}

          {/* Ingresos */}
          {data.ingresos.length > 0 && (
            <>
              <tr>
                <td colSpan={proyeccion.length + 1} style={sectionStyle}>INGRESOS</td>
              </tr>
              {data.ingresos.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle('left')}>💰 {i.descripcion}</td>
                  {proyeccion.map(m => (
                    <td key={m.mes} style={tdStyle('right', '#166534')}>
                      {fmt(i.monto, i.moneda)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ ...tdStyle('left'), fontWeight: 700, color: 'var(--success)' }}>Total ingresos ARS</td>
                {proyeccion.map(m => (
                  <td key={m.mes} style={{ ...tdStyle('right'), fontWeight: 700, color: 'var(--success)' }}>
                    {m.ingresoARS > 0 ? fmt(m.ingresoARS) : '-'}
                  </td>
                ))}
              </tr>
            </>
          )}

          {/* Balance */}
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
            <td style={{ ...tdStyle('left'), fontWeight: 700, fontSize: 14 }}>BALANCE ARS</td>
            {proyeccion.map(m => {
              const positivo = m.balanceARS >= 0;
              return (
                <td key={m.mes} style={{ ...tdStyle('right'), fontWeight: 700, fontSize: 14, color: positivo ? 'var(--success)' : 'var(--danger)' }}>
                  {m.ingresoARS > 0 ? fmt(m.balanceARS) : '-'}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function VistaConfig({ gastosFijos, gastosCuotas, ingresos, formGasto, setFormGasto, formIngreso, setFormIngreso,
  editingGasto, editingIngreso, saving, onGuardarGasto, onEliminarGasto, onCancelarGasto,
  onGuardarIngreso, onEliminarIngreso, onCancelarIngreso, onEditarGasto, onEditarIngreso }) {

  const inputStyle = { width: '100%', marginBottom: 10 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* Columna izquierda: formulario gastos + lista */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
            {editingGasto ? '✏️ Editar gasto' : '➕ Nuevo gasto recurrente'}
          </h3>
          <form onSubmit={onGuardarGasto}>
            <input style={inputStyle} placeholder="Descripción *" required
              value={formGasto.descripcion} onChange={e => setFormGasto(f => ({ ...f, descripcion: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <input type="number" placeholder="Monto *" required min="0" step="0.01"
                value={formGasto.monto} onChange={e => setFormGasto(f => ({ ...f, monto: e.target.value }))} />
              <select value={formGasto.moneda} onChange={e => setFormGasto(f => ({ ...f, moneda: e.target.value }))}>
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select>
            </div>
            <select style={inputStyle} value={formGasto.tipo} onChange={e => setFormGasto(f => ({ ...f, tipo: e.target.value }))}>
              <option value="fijo">Gasto fijo (mensual siempre)</option>
              <option value="cuota">Cuota / cuotas</option>
            </select>
            {formGasto.tipo === 'cuota' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <input type="number" placeholder="Cuota actual (ej: 3)" min="1"
                    value={formGasto.cuota_actual} onChange={e => setFormGasto(f => ({ ...f, cuota_actual: e.target.value }))} />
                  <input type="number" placeholder="Total cuotas (ej: 12)" min="1"
                    value={formGasto.cuota_total} onChange={e => setFormGasto(f => ({ ...f, cuota_total: e.target.value }))} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                    Mes de la cuota actual
                  </label>
                  <input type="month" style={{ width: '100%' }}
                    value={formGasto.mes_referencia} onChange={e => setFormGasto(f => ({ ...f, mes_referencia: e.target.value }))} />
                </div>
              </>
            )}
            <select style={inputStyle} value={formGasto.categoria_id}
              onChange={e => setFormGasto(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : editingGasto ? 'Actualizar' : 'Agregar'}
              </button>
              {editingGasto && (
                <button type="button" className="btn btn-ghost" onClick={onCancelarGasto}>Cancelar</button>
              )}
            </div>
          </form>
        </div>

        {/* Lista gastos fijos */}
        {gastosFijos.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>GASTOS FIJOS</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gastosFijos.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ marginRight: 6 }}>{g.categoria_icono || '💰'}</span>
                    <span style={{ fontWeight: 500 }}>{g.descripcion}</span>
                    <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{fmt(g.monto, g.moneda)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => onEditarGasto(g)}>✏️</button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => onEliminarGasto(g.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista cuotas */}
        {gastosCuotas.length > 0 && (
          <div className="card">
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>CUOTAS</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gastosCuotas.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ marginRight: 6 }}>{g.categoria_icono || '💳'}</span>
                    <span style={{ fontWeight: 500 }}>{g.descripcion}</span>
                    <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{fmt(g.monto, g.moneda)}</span>
                    <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, marginLeft: 6 }}>
                      {g.cuota_actual}/{g.cuota_total}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => onEditarGasto(g)}>✏️</button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => onEliminarGasto(g.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: ingresos */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
            {editingIngreso ? '✏️ Editar ingreso' : '➕ Nuevo ingreso'}
          </h3>
          <form onSubmit={onGuardarIngreso}>
            <input style={inputStyle} placeholder="Descripción (ej: Sueldo) *" required
              value={formIngreso.descripcion} onChange={e => setFormIngreso(f => ({ ...f, descripcion: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <input type="number" placeholder="Monto *" required min="0" step="0.01"
                value={formIngreso.monto} onChange={e => setFormIngreso(f => ({ ...f, monto: e.target.value }))} />
              <select value={formIngreso.moneda} onChange={e => setFormIngreso(f => ({ ...f, moneda: e.target.value }))}>
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : editingIngreso ? 'Actualizar' : 'Agregar'}
              </button>
              {editingIngreso && (
                <button type="button" className="btn btn-ghost" onClick={onCancelarIngreso}>Cancelar</button>
              )}
            </div>
          </form>
        </div>

        {ingresos.length > 0 && (
          <div className="card">
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text2)' }}>INGRESOS CONFIGURADOS</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ingresos.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ marginRight: 6 }}>💰</span>
                    <span style={{ fontWeight: 500 }}>{i.descripcion}</span>
                    <span style={{ color: 'var(--success)', fontSize: 12, marginLeft: 8 }}>{fmt(i.monto, i.moneda)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => onEditarIngreso(i)}>✏️</button>
                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => onEliminarIngreso(i.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ayuda */}
        <div className="card" style={{ marginTop: 16, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💡 ¿Cómo usar?</h4>
          <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8, paddingLeft: 16 }}>
            <li><strong>Gasto fijo:</strong> se repite todos los meses (alquiler, luz, etc.)</li>
            <li><strong>Cuota:</strong> indicá cuota actual y total. Ej: si estás en cuota 3 de 12, ponés 3/12. La app calcula los meses restantes.</li>
            <li><strong>Mes de la cuota actual:</strong> el mes en que se paga esa cuota.</li>
            <li><strong>Ingreso:</strong> tu sueldo u otros ingresos mensuales.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const thStyle = (align = 'left', header = false) => ({
  textAlign: align, padding: '10px 12px',
  background: header ? 'var(--bg2)' : undefined,
  color: 'var(--text2)', fontSize: 12, fontWeight: 700,
  borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap'
});

const tdStyle = (align = 'left', color) => ({
  textAlign: align, padding: '8px 12px',
  color: color || undefined, whiteSpace: 'nowrap'
});

const sectionStyle = {
  padding: '6px 12px', background: 'var(--bg3)',
  fontSize: 11, fontWeight: 700, color: 'var(--text2)',
  letterSpacing: 1
};
