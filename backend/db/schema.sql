CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario',
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  icono TEXT DEFAULT '💰',
  color TEXT DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS',
  categoria_id INTEGER,
  fecha TEXT NOT NULL DEFAULT (date('now')),
  origen TEXT DEFAULT 'manual',
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rol TEXT NOT NULL,
  contenido TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO categorias (id, nombre, icono, color) VALUES
  (1, 'Comida', '🍔', '#f97316'),
  (2, 'Transporte', '🚗', '#3b82f6'),
  (3, 'Servicios', '💡', '#eab308'),
  (4, 'Salud', '❤️', '#ef4444'),
  (5, 'Entretenimiento', '🎬', '#8b5cf6'),
  (6, 'Supermercado', '🛒', '#22c55e'),
  (7, 'Ropa', '👕', '#ec4899'),
  (8, 'Educación', '📚', '#06b6d4'),
  (9, 'Hogar', '🏠', '#a16207'),
  (10, 'Tarjeta de Crédito', '💳', '#6366f1'),
  (11, 'Otros', '📦', '#6b7280');
