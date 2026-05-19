import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/', icon: '📊', label: 'Mis Gastos', end: true },
  { to: '/gastos', icon: '📋', label: 'Historial' },
  { to: '/chat', icon: '🤖', label: 'Chat IA' },
];

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    ...NAV_ITEMS,
    ...(user.rol === 'admin' ? [{ to: '/admin', icon: '⚙️', label: 'Administración' }] : []),
  ];

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <button className="icon-btn" onClick={() => setDrawerOpen(o => !o)} aria-label="Menú">
          {drawerOpen ? '✕' : '☰'}
        </button>
        <span className="topbar-brand">💰 GastosIA</span>
      </header>

      {/* Mobile backdrop */}
      {drawerOpen && <div className="sidebar-backdrop" onClick={closeDrawer} />}

      <aside className={`sidebar${drawerOpen ? ' sidebar-open' : ''}${collapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="brand-icon">💰</span>
            <div className="brand-info">
              <div className="brand-name">GastosIA</div>
              <div className="brand-user">{user.nombre}</div>
            </div>
          </div>
          <button
            className="icon-btn collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={closeDrawer}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button onClick={logout} className="btn btn-ghost logout-btn">
            <span>🚪</span>
            <span className="nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
