import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import Modal, { ConfirmModal } from '../components/Modal';

const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function mesActualStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

  // Modal de edición/creación (gastos recurrentes / ingresos)
  const [modalGasto, setModalGasto] = useState(false);
  const [modalIng, setModalIng] = useState(false);
  const [formGasto, setFormGasto] = useState(FORM_GASTO_VACIO);
  const [formIng, setFormIng] = useState(FORM_ING_VACIO);
  const [editingGasto, setEditingGasto] = useState(null);
  const [editingIng, setEditingIng] = useState(null);
  const [saving, setSaving] = useState(false);

  // Confirmaciones de borrado
  const [confirmDel, setConfirmDel] = useState(null); // { tipo, id, nombre }
  const [deleting, setDeleting] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const cargar = useCallback(() => {
    setLoading(true);
    api.get(`/proyeccion?anio=${anio}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (anio === anioActual) setMesSel(mesActual);
    else setMesSel(`${anio}-01`);
  }, [anio]);

  const mesData = data?.proyeccion?.find(m => m.mes === mesSel);
  const meses = data?.proyeccion?.map(m => m.mes) || [];

  // ── Gastos recurrentes (modal) ─────────────────────────────
  function abrirNuevoGasto() {
    setFormGasto(FORM_GASTO_VACIO);
    setEditingGasto(null);
    setModalGasto(true);
  }
  function editarGasto(g) {
    setFormGasto({
      descripcion: g.descripcion, monto: String(g.monto), moneda: g.moneda,
      categoria_id: g.categoria_id || '', tipo: g.tipo,
      cuota_actual: g.cuota_actual || '', cuota_total: g.cuota_total || '',
      mes_referencia: g.mes_referencia || mesActualStr(),
    });
    setEditingGasto(g.id);
    setModalGasto(true);
  }
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
      if (editingGasto) await api.put(`/recurrentes/gastos/${editingGasto}`, payload);
      else await api.post('/recurrentes/gastos', payload);
      setModalGasto(false);
      cargar();
    } finally { setSaving(false); }
  }

  // ── Ingresos (modal) ───────────────────────────────────────
  function abrirNuevoIng() {
    setFormIng(FORM_ING_VACIO);
    setEditingIng(null);
    setModalIng(true);
  }
  function editarIng(i) {
    setFormIng({ descripcion: i.descripcion, monto: String(i.monto), moneda: i.moneda });
    setEditingIng(i.id);
    setModalIng(true);
  }
  async function guardarIng(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formIng, monto: parseFloat(formIng.monto) };
      if (editingIng) await api.put(`/recurrentes/ingresos/${editingIng}`, payload);
      else await api.post('/recurrentes/ingresos', payload);
      setModalIng(false);
      cargar();
    } finally { setSaving(false); }
  }

  // ── Borrar (con confirm modal) ─────────────────────────────
  function pedirBorrar(tipo, id, nombre) {
    setConfirmDel({ tipo, id, nombre });
  }
  async function confirmarBorrar() {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      const url = {
        gasto: `/gastos/${confirmDel.id}`,
        recurrente: `/recurrentes/gastos/${confirmDel.id}`,
        ingreso: `/recurrentes/ingresos/${confirmDel.id}`,
      }[confirmDel.tipo];
      await api.delete(url);
      setConfirmDel(null);
      cargar();
    } finally { setDeleting(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Hola, {user.nombre} 👋</h1>
          <p style={{ color: 'var(--text2)', marginTop: 2, fontSize: 13 }}>Resumen mensual de gastos e ingresos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${vista === 'mes' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVista('mes')}>📅 Meses</button>
          <button className={`btn ${vista === 'config' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVista('config')}>⚙️ Configurar</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spin" /></div>
      ) : vista === 'mes' ? (
        <>
          {/* Selector de año */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setAnio(a => a - 1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 18, minWidth: 60, textAlign: 'center' }}>{anio}</span>
            <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setAnio(a => a + 1)}>›</button>
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

          <VistaMes
            data={mesData}
            onEditarGasto={editarGasto}
            onEditarIng={editarIng}
            onBorrarGasto={(g) => pedirBorrar('gasto', g.id, g.descripcion)}
            onBorrarRecurrente={(g) => pedirBorrar('recurrente', g.id, g.descripcion)}
          />
        </>
      ) : (
        <VistaConfig
          recurrentes={data?.recurrentes || []}
          ingresos={data?.ingresos || []}
          onNuevoGasto={abrirNuevoGasto}
          onNuevoIng={abrirNuevoIng}
          onEditarGasto={editarGasto}
          onEditarIng={editarIng}
          onBorrarRecurrente={(g) => pedirBorrar('recurrente', g.id, g.descripcion)}
          onBorrarIngreso={(i) => pedirBorrar('ingreso', i.id, i.descripcion)}
        />
      )}

      {/* Modal Gasto recurrente */}
      <Modal
        open={modalGasto}
        onClose={() => setModalGasto(false)}
        title={editingGasto ? '✏️ Editar gasto recurrente' : '➕ Nuevo gasto fijo o cuota'}
        width={460}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalGasto(false)}>Cancelar</button>
            <button form="form-rec" type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spin" style={{ width: 14, height: 14 }} /> : (editingGasto ? 'Guardar cambios' : 'Agregar')}
            </button>
          </>
        }
      >
        <FormGastoRecurrente
          formGasto={formGasto}
          setFormGasto={setFormGasto}
          onSubmit={guardarGasto}
        />
      </Modal>

      {/* Modal Ingreso */}
      <Modal
        open={modalIng}
        onClose={() => setModalIng(false)}
        title={editingIng ? '✏️ Editar ingreso' : '➕ Nuevo ingreso mensual'}
        width={420}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalIng(false)}>Cancelar</button>
            <button form="form-ing" type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spin" style={{ width: 14, height: 14 }} /> : (editingIng ? 'Guardar cambios' : 'Agregar')}
            </button>
          </>
        }
      >
        <form id="form-ing" onSubmit={guardarIng}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>DESCRIPCIÓN</label>
            <input placeholder="Ej: Sueldo" required autoFocus
              value={formIng.descripcion} onChange={e => setFormIng(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>MONTO</label>
              <input type="number" required min="0" step="0.01"
                value={formIng.monto} onChange={e => setFormIng(f => ({ ...f, monto: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>MONEDA</label>
              <select value={formIng.moneda} onChange={e => setFormIng(f => ({ ...f, moneda: e.target.value }))}>
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Confirmar eliminación"
        message={confirmDel ? `¿Borrar "${confirmDel.nombre}"? Esta acción no se puede deshacer.` : ''}
        confirmText="Borrar"
        danger
        loading={deleting}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmarBorrar}
      />
    </div>
  );
}

// ─── Vista mensual ─────────────────────────────────────────────

function VistaMes({ data, onEditarGasto, onEditarIng, onBorrarGasto, onBorrarRecurrente }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Seccion titulo="💰 Ingresos mensuales">
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

          {fijos.length > 0 && (
            <Seccion titulo="📌 Gastos fijos">
              {fijos.map(g => (
                <FilaItem key={g.id}
                  icono={g.categoria_icono || '💰'} nombre={g.descripcion}
                  monto={fmt(g.monto, g.moneda)}
                  onEditar={() => onEditarGasto(g)}
                  onEliminar={() => onBorrarRecurrente(g)} />
              ))}
              <TotalFila label="Total fijos" total={fijos.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0)} />
            </Seccion>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cuotas.length > 0 && (
            <Seccion titulo="💳 Cuotas activas este mes">
              {cuotas.map(g => (
                <FilaItem key={g.id}
                  icono={g.categoria_icono || '💳'}
                  nombre={g.descripcion}
                  badge={`${g.cuota_num}/${g.cuota_total}`}
                  monto={fmt(g.monto, g.moneda)}
                  onEditar={() => onEditarGasto(g)}
                  onEliminar={() => onBorrarRecurrente(g)} />
              ))}
              <TotalFila label="Total cuotas" total={cuotas.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0)} />
            </Seccion>
          )}

          {gastosRegistrados.length > 0 && (
            <Seccion titulo="🧾 Gastos del mes (registrados)">
              {gastosRegistrados.map(g => {
                const subFecha = g.mes_cierre && g.fecha && g.fecha.slice(0, 7) !== g.mes_cierre
                  ? `${g.fecha} · resumen tarjeta`
                  : g.fecha;
                return (
                  <FilaItem key={g.id}
                    icono={g.categoria_icono || '💰'}
                    nombre={g.descripcion}
                    sub={subFecha}
                    monto={fmt(g.monto, g.moneda)}
                    onEliminar={() => onBorrarGasto(g)} />
                );
              })}
              <TotalFila label="Total registrados" total={gastosRegistrados.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0)} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function TotalFila({ label, total }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
      <span>{label}</span>
      <span style={{ color: 'var(--danger)' }}>{fmt(total)}</span>
    </div>
  );
}

function FilaItem({ icono, nombre, badge, sub, monto, colorMonto, onEditar, onEliminar }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{icono}</span>
          <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
          {badge && <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>{badge}</span>}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 22 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: colorMonto || undefined }}>{monto}</span>
        {onEditar && <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }} onClick={onEditar} title="Editar">✏️</button>}
        {onEliminar && <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }} onClick={onEliminar} title="Borrar">🗑️</button>}
      </div>
    </div>
  );
}

// ─── Vista config ──────────────────────────────────────────────

function VistaConfig({ recurrentes, ingresos, onNuevoGasto, onNuevoIng, onEditarGasto, onEditarIng, onBorrarRecurrente, onBorrarIngreso }) {
  const fijos = recurrentes.filter(g => g.tipo === 'fijo');
  const cuotas = recurrentes.filter(g => g.tipo === 'cuota');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>💸 Gastos recurrentes</h3>
          <button className="btn btn-primary" onClick={onNuevoGasto} style={{ padding: '6px 14px', fontSize: 13 }}>+ Nuevo</button>
        </div>

        {fijos.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>GASTOS FIJOS</div>
            {fijos.map(g => (
              <FilaConfig key={g.id} item={g} onEditar={() => onEditarGasto(g)} onEliminar={() => onBorrarRecurrente(g)} />
            ))}
          </div>
        )}
        {cuotas.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>CUOTAS</div>
            {cuotas.map(g => (
              <FilaConfig key={g.id} item={g} badge={`${g.cuota_actual}/${g.cuota_total}`}
                onEditar={() => onEditarGasto(g)} onEliminar={() => onBorrarRecurrente(g)} />
            ))}
          </div>
        )}
        {fijos.length === 0 && cuotas.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
            Sin gastos configurados todavía.
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>💰 Ingresos mensuales</h3>
          <button className="btn btn-primary" onClick={onNuevoIng} style={{ padding: '6px 14px', fontSize: 13 }}>+ Nuevo</button>
        </div>

        {ingresos.length > 0 ? (
          <div className="card" style={{ marginBottom: 14 }}>
            {ingresos.map(i => (
              <FilaConfig key={i.id} item={{ ...i, categoria_icono: '💰' }}
                onEditar={() => onEditarIng(i)} onEliminar={() => onBorrarIngreso(i)} />
            ))}
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
            Sin ingresos configurados.
          </div>
        )}

        <div className="card" style={{ background: 'var(--bg)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💡 Tips</div>
          <ul style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.9, paddingLeft: 16 }}>
            <li><strong>Gasto fijo:</strong> se repite todos los meses (alquiler, luz, gym).</li>
            <li><strong>Cuota:</strong> indicá en qué cuota estás y el total. La app la saca automáticamente al terminar.</li>
            <li><strong>IA:</strong> podés pedirle que cree, borre o modifique cualquier cosa desde el chat. Siempre te pide confirmación antes.</li>
            <li><strong>Resumen Visa:</strong> subilo desde Chat IA y se cargan las cuotas y gastos automáticamente.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FormGastoRecurrente({ formGasto, setFormGasto, onSubmit }) {
  const inp = { width: '100%', marginBottom: 10 };
  return (
    <form id="form-rec" onSubmit={onSubmit}>
      <input style={inp} placeholder="Descripción *" required autoFocus
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
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Datos de la cuota</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Cuota actual</label>
              <input type="number" placeholder="ej: 3" min="1"
                value={formGasto.cuota_actual} onChange={e => setFormGasto(f => ({ ...f, cuota_actual: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Total cuotas</label>
              <input type="number" placeholder="ej: 12" min="1"
                value={formGasto.cuota_total} onChange={e => setFormGasto(f => ({ ...f, cuota_total: e.target.value }))} />
            </div>
          </div>
          <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>Mes en que pagás esa cuota</label>
          <input type="month" style={{ width: '100%' }}
            value={formGasto.mes_referencia} onChange={e => setFormGasto(f => ({ ...f, mes_referencia: e.target.value }))} />
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
            Ej: cuota 3/12 en {formGasto.mes_referencia} → la cuota 4 se proyecta el mes siguiente, etc.
          </div>
        </div>
      )}
      <select style={inp} value={formGasto.categoria_id}
        onChange={e => setFormGasto(f => ({ ...f, categoria_id: e.target.value }))}>
        <option value="">Sin categoría</option>
        {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
      </select>
    </form>
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
