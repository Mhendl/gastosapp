import { useState, useEffect } from 'react';
import api from '../services/api';

function formatMonto(n, moneda = 'ARS') {
  return moneda === 'USD'
    ? `USD ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

export default function Admin() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [gastosUser, setGastosUser] = useState([]);
  const [gastosLoading, setGastosLoading] = useState(false);

  const cargar = () => {
    setLoading(true);
    api.get('/usuarios').then(r => setUsuarios(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  function abrirNuevo() {
    setForm({ nombre: '', email: '', password: '', rol: 'usuario' });
    setEditId(null);
    setModal('usuario');
  }

  function abrirEditar(u) {
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, activo: u.activo === 1 });
    setEditId(u.id);
    setModal('usuario');
  }

  async function verGastos(u) {
    setSelectedUser(u);
    setGastosLoading(true);
    setModal('gastos');
    const { data } = await api.get(`/usuarios/${u.id}/gastos`);
    setGastosUser(data);
    setGastosLoading(false);
  }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editId) {
        await api.put(`/usuarios/${editId}`, payload);
      } else {
        await api.post('/usuarios', payload);
      }
      setModal(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(u) {
    await api.put(`/usuarios/${u.id}`, { activo: u.activo === 0 });
    cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Desactivar este usuario?')) return;
    await api.delete(`/usuarios/${id}`);
    cargar();
  }

  const totalGlobal = usuarios.reduce((a, u) => a + u.total_ars, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>⚙️ Administración</h1>
          <p style={{ color: 'var(--text2)', marginTop: 2 }}>{usuarios.length} usuarios · Total global: {formatMonto(totalGlobal)}</p>
        </div>
        <button onClick={abrirNuevo} className="btn btn-primary">+ Nuevo usuario</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spin" /></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuario</th><th>Rol</th><th>Gastos</th><th>Total ARS</th><th>Total USD</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{u.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{u.email}</div>
                  </td>
                  <td><span className={`badge badge-${u.rol}`}>{u.rol}</span></td>
                  <td style={{ color: 'var(--text2)' }}>{u.total_gastos}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>{formatMonto(u.total_ars)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--warning)' }}>{u.total_usd > 0 ? formatMonto(u.total_usd, 'USD') : '-'}</td>
                  <td>
                    <span className={`badge badge-${u.activo ? 'activo' : 'inactivo'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => verGastos(u)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>Ver gastos</button>
                      <button onClick={() => abrirEditar(u)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>Editar</button>
                      <button onClick={() => eliminar(u.id)} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}>Desactivar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal usuario */}
      {modal === 'usuario' && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 440 }}>
            <h2 style={{ marginBottom: 20, fontSize: 16, fontWeight: 700 }}>{editId ? 'Editar' : 'Nuevo'} usuario</h2>
            <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>NOMBRE</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required placeholder="Nombre completo" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>EMAIL</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>
                  CONTRASEÑA {editId && <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(dejar vacío para no cambiar)</span>}
                </label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editId ? '••••••••' : 'Contraseña'} required={!editId} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text2)', fontSize: 12 }}>ROL</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                  <option value="usuario">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {editId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} style={{ width: 'auto' }} />
                  <span style={{ fontSize: 14 }}>Usuario activo</span>
                </label>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spin" style={{ width: 14, height: 14 }} /> : (editId ? 'Guardar' : 'Crear usuario')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal gastos de usuario */}
      {modal === 'gastos' && selectedUser && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Gastos de {selectedUser.nombre}</h2>
              <button onClick={() => setModal(null)} className="btn btn-ghost" style={{ padding: '4px 12px' }}>✕ Cerrar</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {gastosLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spin" /></div>
              ) : gastosUser.length === 0 ? (
                <p style={{ color: 'var(--text2)', textAlign: 'center', padding: 30 }}>Sin gastos registrados</p>
              ) : (
                <table>
                  <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th></tr></thead>
                  <tbody>
                    {gastosUser.map(g => (
                      <tr key={g.id}>
                        <td style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>{g.fecha}</td>
                        <td>{g.descripcion}</td>
                        <td>{g.categoria_icono} {g.categoria_nombre}</td>
                        <td style={{ fontWeight: 600, color: 'var(--success)' }}>{formatMonto(g.monto, g.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
