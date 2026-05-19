import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function mesActualStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function mesLabel(yyyymm, corto = false) {
  const [y, m] = yyyymm.split('-');
  const arr = corto ? MESES_CORTOS : MESES_NOMBRES;
  return `${arr[parseInt(m) - 1]} ${y}`;
}

function fmt(n, moneda = 'ARS') {
  if (!n && n !== 0) return '-';
  const abs = Math.abs(n);
  const str = moneda === 'USD'
    ? `USD ${abs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${abs.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
  return n < 0 ? `-${str}` : str;
}

const categorias = [
  { id: 1, nombre: 'Comida', icono: '🍔' }, { id: 2, nombre: 'Transporte', icono: '🚗' },
  { id: 3, nombre: 'Servicios', icono: '💡' }, { id: 4, nombre: 'Salud', icono: '❤️' },
  { id: 5, nombre: 'Entretenimiento', icono: '🎬' }, { id: 6, nombre: 'Supermercado', icono: '🛒' },
  { id: 7, nombre: 'Ropa', icono: '👕' }, { id: 8, nombre: 'Educación', icono: '📚' },
  { id: 9, nombre: 'Hogar', icono: '🏠' }, { id: 10, nombre: 'Tarjeta de Crédito', icono: '💳' },
  { id: 11, nombre: 'Otros', icono: '📦' },
];

const FORM_GASTO_VACIO = { descripcion: '', monto: '', moneda: 'ARS', categoria_id: '', tipo: 'fijo', cuota_actual: '', cuota_total: '', mes_referencia: mesActualStr() };
const FORM_ING_VACIO = { descripcion: '', monto: '', moneda: 'ARS' };

const anioActual = new Date().getFullYear();
const mesActual = mesActualStr();

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(anioActual);
  const [mesSel, setMesSel] = useState(mesActual);
  const [vista, setVista] = useState('mes'); // 'mes' | 'config'
  const [formGasto, setFormGasto] = useState(FORM_GASTO_VACIO);
  const [formIng, setFormIng] = useState(FORM_ING_VACIO);
  const [editingGasto, setEditingGasto] = useState(null);
  const [editingIng, setEditingIng] = useState(null);
  const [saving, setSaving] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const cargar = useCallback(() => {
    setLoading(true);
    api.get(`/proyeccion?anio=${anio}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  // Al cambiar año, seleccionar enero de ese año (o mes actual si es el año actual)
  useEffect(() => {
    if (anio === anioActual) {
      setMesSel(mesActual);
    } else {
      setMesSel(`${anio}-01`);
    }
  }, [anio]);

  const mesData = data?.proyeccion?.find(m => m.mes === mesSel);
  const meses = data?.proyeccion?.map(m => m.mes) || [];

  // ---- CRUD gastos recurrentes ----
  async function guardarGasto(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formGasto,
        monto: parseFloat(formGasto.monto),
        categoria_id: formGasto.categoria_id || null,
        cuota_actual: formGasto.tipo === 'cuota' ? parseInt(formGasto.cuota_actual) || null : null,
        cuota_total: formGasto.tipo === 'cuota' ? parseInt(formGasto.cuota_total) || null : null,
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
    } finally { setSaving(false); }
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
      mes_referencia: g.mes_referencia || mesActualStr(),
    });
    setEditingGasto(g.id);
    setVista('config');
  }

  // ---- CRUD ingresos ----
  async function guardarIng(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formIng, monto: parseFloat(formIng.monto) };
      if (editingIng) {
        await api.put(`/recurrentes/ingresos/${editingIng}`, payload);
      } else {
        await api.post('/recurrentes/ingresos', payload);
      }
      setFormIng(FORM_ING_VACIO);
      setEditingIng(null);
      cargar();
    } finally { setSaving(false); }
  }

  async function eliminarIng(id) {
    if (!confirm('¿Eliminar este ingreso?')) return;
    await api.delete(`/recurrentes/ingresos/${id}`);
    cargar();
  }

  function editarIng(i) {
    setFormIng({ descripcion: i.descripcion, monto: String(i.monto), moneda: i.moneda });
    setEditingIng(i.id);
    setVista('config');
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hola, {user.nombre} 👋</h1>
          <p style={{ color: 'var(--text2)', marginTop: 2, fontSize: 13 }}>Resumen mensual de gastos e ingresos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${vista === 'mes' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVista('mes')}>
            📅 Meses
          </button>
          <button
            className={`btn ${vista === 'config' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVista('config')}>
            ⚙️ Configurar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spin" /></div>
      ) : vista === 'mes' ? (
        <>
          {/* Selector de año */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost" style={{ padding: '4px 10px' }}
              onClick={() => setAnio(a => a - 1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 18, minWidth: 60, textAlign: 'center' }}>{anio}</span>
            <button className="btn btn-ghost" style={{ padding: '4px 10px' }}
              onClick={() => setAnio(a => a + 1)}>›</button>
          </div>

          {/* Tabs de los 12 meses */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 20 }}>
            {meses.map(m => {
              const md = data.proyeccion.find(x => x.mes === m);
              const balance = md?.balanceARS ?? 0;
              const activo = m === mesSel;
              const esHoy = m === mesActual;
              return (
                <button key={m} onClick={() => setMesSel(m)}
                  style={{
                    padding: '8px 4px', border: esHoy ? '1px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', borderRadius: 8, textAlign: 'center',
                    background: activo ? 'var(--accent)' : 'var(--bg2)',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: activo ? 700 : 500, color: activo ? 'white' : 'var(--text)' }}>
                    {MESES_CORTOS[parseInt(m.split('-')[1]) - 1]}
                  </div>
                  {md && (md.ingresoARS > 0 || md.totalARS > 0) && (
                    <div style={{ fontSize: 10, marginTop: 3, color: activo ? 'rgba(255,255,255,0.85)' : (balance >= 0 ? 'var(--success)' : 'var(--danger)') }}>
                      {balance >= 0 ? '+' : ''}{Math.round(balance / 1000)}k
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <VistaMes mes={mesSel} data={mesData} onEditarGasto={editarGasto} onEditarIng={editarIng} onRecargar={cargar} />
        </>
      ) : (
        <VistaConfig
          recurrentes={data?.recurrentes || []}
          ingresos={data?.ingresos || []}
          formGasto={formGasto} setFormGasto={setFormGasto}
          formIng={formIng} setFormIng={setFormIng}
          editingGasto={editingGasto} editingIng={editingIng}
          saving={saving}
          onGuardarGasto={guardarGasto} onEliminarGasto={eliminarGasto}
          onCancelarGasto={() => { setFormGasto(FORM_GASTO_VACIO); setEditingGasto(null); }}
          onGuardarIng={guardarIng} onEliminarIng={eliminarIng}
          onCancelarIng={() => { setFormIng(FORM_ING_VACIO); setEditingIng(null); }}
          onEditarGasto={editarGasto} onEditarIng={editarIng}
        />
      )}
    </div>
  );
}

// ---- Vista mensual ----
function VistaMes({ mes, data, onEditarGasto, onEditarIng, onRecargar }) {
  const [eliminando, setEliminando] = useState(null);

  if (!data) return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
      <p>Sin datos para este mes.</p>
      <p style={{ fontSize: 13, marginTop: 4 }}>Configurá tus gastos fijos, cuotas e ingresos en ⚙️ Configurar.</p>
    </div>
  );

  const { recurrentes = [], gastosRegistrados = [], ingresos = [] } = data;
  const fijos = recurrentes.filter(g => g.tipo === 'fijo');
  const cuotas = recurrentes.filter(g => g.tipo === 'cuota');
  const tieneIngresos = ingresos.length > 0;
  const balance = data.balanceARS;
  const balancePositivo = balance >= 0;

  async function eliminarRegistrado(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    setEliminando(id);
    try {
      await api.delete(`/gastos/${id}`);
      onRecargar();
    } finally { setEliminando(null); }
  }

  return (
    <div>
      {/* Cards resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>INGRESOS ARS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>
            {data.ingresoARS > 0 ? fmt(data.ingresoARS) : <span style={{ color: 'var(--text2)', fontSize: 14 }}>No configurado</span>}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>GASTOS ARS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>{fmt(data.totalARS)}</div>
          {data.totalUSD > 0 && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>+ {fmt(data.totalUSD, 'USD')}</div>}
        </div>
        <div className="card" style={{ background: balancePositivo ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>BALANCE ARS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: balancePositivo ? 'var(--success)' : 'var(--danger)' }}>
            {data.ingresoARS > 0 ? (balancePositivo ? '+' : '') + fmt(balance) : <span style={{ fontSize: 14 }}>-</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Columna izquierda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Ingresos */}
          <Seccion titulo="💰 Ingresos mensuales" color="#166534">
            {tieneIngresos ? ingresos.map(i => (
              <FilaItem key={i.id} icono="💰" nombre={i.descripcion}
                monto={fmt(i.monto, i.moneda)} colorMonto="var(--success)"
                onEditar={() => onEditarIng(i)} />
            )) : (
              <p style={{ color: 'var(--text2)', fontSize: 13, padding: '4px 0' }}>
                Sin ingresos configurados. Andá a ⚙️ Configurar.
              </p>
            )}
          </Seccion>

          {/* Gastos fijos */}
          {fijos.length > 0 && (
            <Seccion titulo="📌 Gastos fijos" color="var(--text2)">
              {fijos.map(g => (
                <FilaItem key={g.id}
                  icono={g.categoria_icono || '💰'} nombre={g.descripcion}
                  monto={fmt(g.monto, g.moneda)}
                  onEditar={() => onEditarGasto(g)} />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>Total fijos</span>
                <span style={{ color: 'var(--danger)' }}>{fmt(fijos.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0))}</span>
              </div>
            </Seccion>
          )}
        </div>

        {/* Columna derecha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Cuotas */}
          {cuotas.length > 0 && (
            <Seccion titulo="💳 Cuotas activas este mes" color="var(--text2)">
              {cuotas.map(g => (
                <FilaItem key={g.id}
                  icono={g.categoria_icono || '💳'}
                  nombre={g.descripcion}
                  badge={`${g.cuota_num}/${g.cuota_total}`}
                  monto={fmt(g.monto, g.moneda)}
                  onEditar={() => onEditarGasto(g)} />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>Total cuotas</span>
                <span style={{ color: 'var(--danger)' }}>{fmt(cuotas.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0))}</span>
              </div>
            </Seccion>
          )}

          {/* Gastos registrados del mes */}
          {gastosRegistrados.length > 0 && (
            <Seccion titulo="🧾 Gastos del mes (registrados)" color="var(--text2)">
              {gastosRegistrados.map(g => (
                <FilaItem key={g.id}
                  icono={g.categoria_icono || '💰'}
                  nombre={g.descripcion}
                  sub={g.fecha}
                  monto={fmt(g.monto, g.moneda)}
                  onEliminar={() => eliminarRegistrado(g.id)}
                  eliminando={eliminando === g.id} />
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>Total registrados</span>
                <span style={{ color: 'var(--danger)' }}>{fmt(gastosRegistrados.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0))}</span>
              </div>
            </Seccion>
          )}

          {cuotas.length === 0 && gastosRegistrados.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 24, fontSize: 13 }}>
              Sin cuotas ni gastos registrados este mes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 12, letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function FilaItem({ icono, nombre, badge, sub, monto, colorMonto, onEditar, onEliminar, eliminando }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{icono}</span>
          <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
          {badge && (
            <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>{badge}</span>
          )}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 22 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: colorMonto || undefined }}>{monto}</span>
        {onEditar && (
          <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} onClick={onEditar}>✏️</button>
        )}
        {onEliminar && (
          <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }}
            onClick={onEliminar} disabled={eliminando}>
            {eliminando ? '...' : '🗑️'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Vista config ----
function VistaConfig({ recurrentes, ingresos, formGasto, setFormGasto, formIng, setFormIng,
  editingGasto, editingIng, saving, onGuardarGasto, onEliminarGasto, onCancelarGasto,
  onGuardarIng, onEliminarIng, onCancelarIng, onEditarGasto, onEditarIng }) {

  const fijos = recurrentes.filter(g => g.tipo === 'fijo');
  const cuotas = recurrentes.filter(g => g.tipo === 'cuota');
  const inp = { width: '100%', marginBottom: 10 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

      {/* Gastos recurrentes */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            {editingGasto ? '✏️ Editar gasto' : '➕ Gasto fijo o cuota'}
          </h3>
          <form onSubmit={onGuardarGasto}>
            <input style={inp} placeholder="Descripción *" required
              value={formGasto.descripcion} onChange={e => setFormGasto(f => ({ ...f, descripcion: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <input type="number" placeholder="Monto *" required min="0" step="0.01"
                value={formGasto.monto} onChange={e => setFormGasto(f => ({ ...f, monto: e.target.value }))} />
              <select value={formGasto.moneda} onChange={e => setFormGasto(f => ({ ...f, moneda: e.target.value }))}>
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select>
            </div>
            <select style={inp} value={formGasto.tipo} onChange={e => setFormGasto(f => ({ ...f, tipo: e.target.value }))}>
              <option value="fijo">Gasto fijo (mensual, siempre)</option>
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
                  <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Mes en que pagás esa cuota</label>
                  <input type="month" style={{ width: '100%' }}
                    value={formGasto.mes_referencia} onChange={e => setFormGasto(f => ({ ...f, mes_referencia: e.target.value }))} />
                </div>
              </>
            )}
            <select style={inp} value={formGasto.categoria_id}
              onChange={e => setFormGasto(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : editingGasto ? 'Actualizar' : 'Agregar'}
              </button>
              {editingGasto && <button type="button" className="btn btn-ghost" onClick={onCancelarGasto}>Cancelar</button>}
            </div>
          </form>
        </div>

        {fijos.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>GASTOS FIJOS</div>
            {fijos.map(g => <FilaConfig key={g.id} item={g} onEditar={() => onEditarGasto(g)} onEliminar={() => onEliminarGasto(g.id)} />)}
          </div>
        )}

        {cuotas.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>CUOTAS</div>
            {cuotas.map(g => (
              <FilaConfig key={g.id} item={g}
                badge={`${g.cuota_actual}/${g.cuota_total}`}
                onEditar={() => onEditarGasto(g)} onEliminar={() => onEliminarGasto(g.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Ingresos */}
      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            {editingIng ? '✏️ Editar ingreso' : '➕ Ingreso mensual'}
          </h3>
          <form onSubmit={onGuardarIng}>
            <input style={inp} placeholder="Descripción (ej: Sueldo) *" required
              value={formIng.descripcion} onChange={e => setFormIng(f => ({ ...f, descripcion: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <input type="number" placeholder="Monto *" required min="0" step="0.01"
                value={formIng.monto} onChange={e => setFormIng(f => ({ ...f, monto: e.target.value }))} />
              <select value={formIng.moneda} onChange={e => setFormIng(f => ({ ...f, moneda: e.target.value }))}>
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Guardando...' : editingIng ? 'Actualizar' : 'Agregar'}
              </button>
              {editingIng && <button type="button" className="btn btn-ghost" onClick={onCancelarIng}>Cancelar</button>}
            </div>
          </form>
        </div>

        {ingresos.length > 0 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>INGRESOS CONFIGURADOS</div>
            {ingresos.map(i => <FilaConfig key={i.id} item={{ ...i, categoria_icono: '💰' }} onEditar={() => onEditarIng(i)} onEliminar={() => onEliminarIng(i.id)} />)}
          </div>
        )}

        <div className="card" style={{ background: 'var(--bg2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💡 Tips</div>
          <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 2, paddingLeft: 16 }}>
            <li><strong>Gasto fijo:</strong> se repite todos los meses (alquiler, luz, gym)</li>
            <li><strong>Cuota:</strong> indicá en qué cuota estás y el total. La app la saca automáticamente cuando termina.</li>
            <li><strong>IA:</strong> podés pedirle que registre cuotas desde el Chat, o subir el resumen de tarjeta.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FilaConfig({ item, badge, onEditar, onEliminar }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <span style={{ marginRight: 6 }}>{item.categoria_icono || '💰'}</span>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{item.descripcion}</span>
        {badge && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px', fontSize: 10, marginLeft: 6 }}>{badge}</span>}
        <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>
          {item.moneda === 'USD' ? `USD ${item.monto}` : `$${Number(item.monto).toLocaleString('es-AR')}`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '2px 7px', fontSize: 12 }} onClick={onEditar}>✏️</button>
        <button className="btn btn-ghost" style={{ padding: '2px 7px', fontSize: 12, color: 'var(--danger)' }} onClick={onEliminar}>🗑️</button>
      </div>
    </div>
  );
}
