import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';

const CATEGORIAS = [
  { id: 1, nombre: 'Comida', icono: '🍔' }, { id: 2, nombre: 'Transporte', icono: '🚗' },
  { id: 3, nombre: 'Servicios', icono: '💡' }, { id: 4, nombre: 'Salud', icono: '❤️' },
  { id: 5, nombre: 'Entretenimiento', icono: '🎬' }, { id: 6, nombre: 'Supermercado', icono: '🛒' },
  { id: 7, nombre: 'Ropa', icono: '👕' }, { id: 8, nombre: 'Educación', icono: '📚' },
  { id: 9, nombre: 'Hogar', icono: '🏠' }, { id: 10, nombre: 'Tarjeta', icono: '💳' },
  { id: 11, nombre: 'Otros', icono: '📦' },
];
const catIcono = id => CATEGORIAS.find(c => c.id === Number(id))?.icono || '📦';

function fmt(n, moneda = 'ARS') {
  const v = Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  return moneda === 'USD' ? `USD ${v}` : `$${v}`;
}

export default function Chat() {
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [previewIA, setPreviewIA] = useState(null);       // pending de /ia/chat
  const [previewArchivo, setPreviewArchivo] = useState(null); // preview de /ia/upload
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/ia/historial').then(r => {
      setMensajes(r.data.map(m => {
        if (m.rol === 'assistant') {
          try {
            const match = m.contenido.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match ? match[0] : m.contenido);
            return { rol: 'assistant', contenido: parsed.mensaje || m.contenido };
          } catch {
            return { rol: 'assistant', contenido: m.contenido };
          }
        }
        return { rol: m.rol, contenido: m.contenido };
      }));
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading]);

  async function enviar(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const texto = input.trim();
    setInput('');
    setMensajes(m => [...m, { rol: 'user', contenido: texto }]);
    setLoading(true);

    try {
      const { data } = await api.post('/ia/chat', { mensaje: texto });
      setMensajes(m => [...m, { rol: 'assistant', contenido: data.mensaje || '...' }]);
      if (data.pending) setPreviewIA(data.pending);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al contactar la IA') }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setMensajes(m => [...m, { rol: 'user', contenido: `📎 Subiendo archivo: ${file.name}...` }]);

    const form = new FormData();
    form.append('archivo', file);
    try {
      const { data } = await api.post('/ia/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMensajes(m => [...m, { rol: 'assistant', contenido: `📋 ${data.resumen}. Revisalos y confirmá.` }]);
      setPreviewArchivo(data.preview);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al procesar el archivo') }]);
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function limpiarHistorial() {
    if (!confirm('¿Borrar el historial del chat?')) return;
    await api.delete('/ia/historial');
    setMensajes([]);
  }

  const sugerencias = [
    'Gasté $2500 en el super',
    'Pagué la tarjeta de crédito $15000',
    '¿Cuánto gasté este mes?',
    'Borrame el último uber',
  ];

  // Aplica el pending de la IA. Recibe el array editado por el usuario.
  const aplicarIA = useCallback(async (pendingActualizado) => {
    try {
      const { data } = await api.post('/ia/aplicar', { pending: pendingActualizado });
      setMensajes(m => [...m, { rol: 'assistant', contenido: '✅ ' + data.mensaje }]);
      setPreviewIA(null);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al aplicar') }]);
    }
  }, []);

  const aplicarArchivo = useCallback(async (recurrentes, gastos) => {
    try {
      const { data } = await api.post('/ia/upload/aplicar', { recurrentes, gastos });
      setMensajes(m => [...m, { rol: 'assistant', contenido: '✅ ' + data.mensaje }]);
      setPreviewArchivo(null);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al aplicar') }]);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🤖 Chat con IA</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Registrar, consultar, editar o borrar gastos por chat</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" disabled={uploadLoading}>
            {uploadLoading ? <span className="spin" style={{ width: 14, height: 14 }} /> : '📎'} Subir resumen
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" style={{ display: 'none' }} onChange={handleUpload} />
          {mensajes.length > 0 && (
            <button onClick={limpiarHistorial} className="btn btn-ghost" style={{ color: 'var(--danger)' }}>
              🗑️ Limpiar
            </button>
          )}
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
        padding: '12px 0', marginBottom: 16
      }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <p style={{ color: 'var(--text2)', marginBottom: 20 }}>¡Hola! Contame tus gastos, hacé consultas o pedime que borre/edite algo.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {sugerencias.map((s, i) => (
                <button key={i} onClick={() => setInput(s)} className="btn btn-ghost" style={{ fontSize: 13 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rol === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%',
              padding: '11px 16px',
              borderRadius: m.rol === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.rol === 'user' ? 'var(--accent)' : 'var(--bg2)',
              border: m.rol === 'assistant' ? '1px solid var(--border)' : 'none',
              color: m.rol === 'user' ? 'white' : 'var(--text)',
              lineHeight: 1.55, whiteSpace: 'pre-wrap', fontSize: 14
            }}>
              {m.contenido}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="spin" style={{ width: 16, height: 16 }} />
              <span style={{ color: 'var(--text2)' }}>Pensando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={enviar} style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ej: gasté $3200 en almuerzo, borrame los uber de abril..."
          disabled={loading}
          style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar(e)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()} style={{ padding: '8px 20px' }}>
          Enviar
        </button>
      </form>

      <PreviewIAModal pending={previewIA} onCancel={() => setPreviewIA(null)} onAplicar={aplicarIA} />
      <PreviewArchivoModal preview={previewArchivo} onCancel={() => setPreviewArchivo(null)} onAplicar={aplicarArchivo} />
    </div>
  );
}

// ─── Preview de acciones del chat ──────────────────────────────────

function PreviewIAModal({ pending, onCancel, onAplicar }) {
  const [items, setItems] = useState([]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const lista = (pending.items || []).map(it => ({ ...it, _id: it._id ?? `it-${it.id}` }));
    setItems(lista);
    setSeleccion(new Set(lista.map(it => it._id)));
  }, [pending]);

  if (!pending) return null;

  const isRegistrar = ['registrar_gastos', 'registrar_recurrente', 'registrar_ingreso'].includes(pending.tipo);
  const isEliminar = pending.tipo === 'eliminar';
  const isEditar = pending.tipo === 'editar';

  const titulo = {
    registrar_gastos: '🧾 Confirmar gastos',
    registrar_recurrente: '💳 Confirmar cuotas / fijos',
    registrar_ingreso: '💰 Confirmar ingresos',
    eliminar: pending.tabla === 'recurrentes' ? '🗑️ Eliminar recurrentes' : '🗑️ Eliminar gastos',
    editar: '✏️ Confirmar edición'
  }[pending.tipo] || 'Confirmar';

  const toggleItem = id => {
    setSeleccion(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (seleccion.size === items.length) setSeleccion(new Set());
    else setSeleccion(new Set(items.map(it => it._id)));
  };

  function updateItem(id, campo, valor) {
    setItems(arr => arr.map(it => it._id === id ? { ...it, [campo]: valor } : it));
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const seleccionados = items.filter(it => seleccion.has(it._id));
      if (!seleccionados.length) { onCancel(); return; }
      await onAplicar({ ...pending, items: seleccionados });
    } finally { setAplicando(false); }
  }

  return (
    <Modal
      open={!!pending}
      onClose={onCancel}
      title={titulo}
      width={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={aplicando}>Cancelar</button>
          <button
            className={`btn ${isEliminar ? 'btn-danger' : 'btn-primary'}`}
            onClick={aplicar}
            disabled={aplicando || seleccion.size === 0}
          >
            {aplicando
              ? <span className="spin" style={{ width: 14, height: 14 }} />
              : `${isEliminar ? 'Eliminar' : isEditar ? 'Aplicar cambios' : 'Confirmar'} (${seleccion.size})`}
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <p style={{ color: 'var(--text2)' }}>No hay items para mostrar.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ color: 'var(--text2)', fontSize: 13 }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
              {isRegistrar && ' — podés editar o destildar lo que no quieras'}
              {isEliminar && ' — destildá los que querés conservar'}
              {isEditar && ' — confirmá los cambios propuestos'}
            </span>
            <button className="btn btn-ghost" onClick={toggleAll} style={{ padding: '4px 10px', fontSize: 12 }}>
              {seleccion.size === items.length ? 'Destildar todo' : 'Seleccionar todo'}
            </button>
          </div>

          {isEditar && pending.cambios && Object.keys(pending.cambios).length > 0 && (
            <div className="card" style={{ background: 'var(--bg)', marginBottom: 12, padding: 10, fontSize: 13 }}>
              <strong>Cambios propuestos:</strong>{' '}
              {Object.entries(pending.cambios).map(([k, v]) => (
                <span key={k} style={{ marginRight: 10 }}>{k}: <code style={{ color: 'var(--accent2)' }}>{String(v)}</code></span>
              ))}
            </div>
          )}

          <div>
            {items.map(it => (
              <ItemPreview
                key={it._id}
                item={it}
                tipo={pending.tipo}
                tabla={pending.tabla}
                selected={seleccion.has(it._id)}
                onToggle={() => toggleItem(it._id)}
                onChange={(c, v) => updateItem(it._id, c, v)}
                editable={isRegistrar}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function ItemPreview({ item, tipo, tabla, selected, onToggle, onChange, editable }) {
  const esRecurrente = tipo === 'registrar_recurrente' || (tipo === 'eliminar' && tabla === 'recurrentes');
  const esCuota = item.tipo === 'cuota';
  const esIngreso = tipo === 'registrar_ingreso';

  return (
    <div className={`preview-row ${selected ? 'selected' : ''} ${item.duplicado ? 'is-dup' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <div style={{ minWidth: 0 }}>
        {item.duplicado && (
          <div style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 700, marginBottom: 2, letterSpacing: 0.5 }}>
            ⚠️ YA EXISTE EN LA BASE
          </div>
        )}
        {editable ? (
          <input
            className="preview-desc"
            value={item.descripcion}
            onChange={e => onChange('descripcion', e.target.value)}
          />
        ) : (
          <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {!esIngreso && <span style={{ marginRight: 6 }}>{catIcono(item.categoria_id)}</span>}
            {item.descripcion}
            {item.fecha && <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>{item.fecha}</span>}
            {esCuota && item.cuota_actual && (
              <span style={{ background: 'var(--bg3)', borderRadius: 4, padding: '1px 6px', fontSize: 11, marginLeft: 6 }}>
                {item.cuota_actual}/{item.cuota_total}
              </span>
            )}
          </div>
        )}

        {editable && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {!esIngreso && (
              <select
                value={item.categoria_id || ''}
                onChange={e => onChange('categoria_id', e.target.value ? Number(e.target.value) : null)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }}
              >
                <option value="">Sin cat.</option>
                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
              </select>
            )}
            {!esRecurrente && !esIngreso && (
              <input
                type="date"
                value={item.fecha || ''}
                onChange={e => onChange('fecha', e.target.value)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }}
              />
            )}
            {esRecurrente && esCuota && (
              <>
                <input type="number" min="1" placeholder="Cuota" value={item.cuota_actual || ''}
                  onChange={e => onChange('cuota_actual', Number(e.target.value) || null)}
                  style={{ width: 70, padding: '3px 6px', fontSize: 12 }} />
                <span style={{ alignSelf: 'center', fontSize: 12 }}>/</span>
                <input type="number" min="1" placeholder="Total" value={item.cuota_total || ''}
                  onChange={e => onChange('cuota_total', Number(e.target.value) || null)}
                  style={{ width: 70, padding: '3px 6px', fontSize: 12 }} />
                <input type="month" value={item.mes_referencia || ''}
                  onChange={e => onChange('mes_referencia', e.target.value)}
                  style={{ width: 130, padding: '3px 6px', fontSize: 12 }} />
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {editable ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="preview-monto"
              type="number" min="0" step="0.01"
              value={item.monto}
              onChange={e => onChange('monto', parseFloat(e.target.value) || 0)}
            />
            <select value={item.moneda} onChange={e => onChange('moneda', e.target.value)}
              style={{ width: 60, padding: '4px 6px', fontSize: 12 }}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        ) : (
          <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(item.monto, item.moneda)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Preview de upload archivo ─────────────────────────────────────

function PreviewArchivoModal({ preview, onCancel, onAplicar }) {
  const [rec, setRec] = useState([]);
  const [gas, setGas] = useState([]);
  const [selRec, setSelRec] = useState(new Set());
  const [selGas, setSelGas] = useState(new Set());
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!preview) return;
    setRec(preview.recurrentes || []);
    setGas(preview.gastos || []);
    // Por defecto destildamos los duplicados (el usuario los puede volver a tildar si quiere)
    setSelRec(new Set((preview.recurrentes || []).filter(r => !r.duplicado).map(r => r._id)));
    setSelGas(new Set((preview.gastos || []).filter(g => !g.duplicado).map(g => g._id)));
  }, [preview]);

  if (!preview) return null;

  function updateRec(id, c, v) { setRec(arr => arr.map(it => it._id === id ? { ...it, [c]: v } : it)); }
  function updateGas(id, c, v) { setGas(arr => arr.map(it => it._id === id ? { ...it, [c]: v } : it)); }
  function toggle(set, id, setter) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setter(n);
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const recurrentes = rec.filter(r => selRec.has(r._id));
      const gastos = gas.filter(g => selGas.has(g._id));
      if (!recurrentes.length && !gastos.length) { onCancel(); return; }
      await onAplicar(recurrentes, gastos);
    } finally { setAplicando(false); }
  }

  const totalSel = selRec.size + selGas.size;
  const numDup = rec.filter(r => r.duplicado).length + gas.filter(g => g.duplicado).length;

  return (
    <Modal
      open={!!preview}
      onClose={onCancel}
      title={`📋 Revisar movimientos${preview.cierre ? ` — cierre ${preview.cierre}` : ''}`}
      width={760}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={aplicando}>Cancelar</button>
          <button className="btn btn-primary" onClick={aplicar} disabled={aplicando || totalSel === 0}>
            {aplicando ? <span className="spin" style={{ width: 14, height: 14 }} /> : `Cargar ${totalSel} items`}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12 }}>
        Revisá lo que la IA detectó del archivo. Editá montos/categorías o destildá los que no quieras cargar.
        {numDup > 0 && (
          <><br />
            <span style={{ color: 'var(--warning)' }}>
              ⚠️ {numDup} item{numDup !== 1 ? 's' : ''} ya existe{numDup !== 1 ? 'n' : ''} en la base. Los destildé por defecto.
            </span>
          </>
        )}
      </p>

      {rec.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
            CUOTAS Y RECURRENTES ({rec.length})
          </div>
          {rec.map(it => (
            <ItemPreview
              key={it._id}
              item={it}
              tipo="registrar_recurrente"
              tabla="recurrentes"
              selected={selRec.has(it._id)}
              onToggle={() => toggle(selRec, it._id, setSelRec)}
              onChange={(c, v) => updateRec(it._id, c, v)}
              editable
            />
          ))}
        </>
      )}

      {gas.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginTop: 14, marginBottom: 8, letterSpacing: 0.5 }}>
            GASTOS PUNTUALES ({gas.length})
          </div>
          {gas.map(it => (
            <ItemPreview
              key={it._id}
              item={it}
              tipo="registrar_gastos"
              selected={selGas.has(it._id)}
              onToggle={() => toggle(selGas, it._id, setSelGas)}
              onChange={(c, v) => updateGas(it._id, c, v)}
              editable
            />
          ))}
        </>
      )}

      {rec.length === 0 && gas.length === 0 && (
        <p style={{ color: 'var(--text2)' }}>No se detectaron movimientos en el archivo.</p>
      )}
    </Modal>
  );
}
