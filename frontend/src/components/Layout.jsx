import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0
      }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>💰 GastosIA</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{user.nombre}</div>
        </div>
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { to: '/', icon: '📊', label: 'Dashboard', end: true },
            { to: '/gastos', icon: '📋', label: 'Mis Gastos' },
            { to: '/proyeccion', icon: '📅', label: 'Proyección' },
            { to: '/chat', icon: '🤖', label: 'Chat IA' },
            ...(user.rol === 'admin' ? [{ to: '/admin', icon: '⚙️', label: 'Administración' }] : [])
          ].map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderRadius: 8, color: isActive ? 'white' : 'var(--text2)',
                background: isActive ? 'var(--accent)' : 'transparent',
                fontWeight: isActive ? 600 : 400, transition: 'all 0.15s'
              })}>
              <span>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
          <button onClick={logout} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <Outlet />
      </main>
    </div>
  );
}
