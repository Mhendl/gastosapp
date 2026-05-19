const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { adminMiddleware, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Listar usuarios (admin)
router.get('/', adminMiddleware, (req, res) => {
  const users = db.prepare(
    `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.created_at,
      COUNT(g.id) as total_gastos,
      COALESCE(SUM(CASE WHEN g.moneda='ARS' THEN g.monto ELSE 0 END), 0) as total_ars,
      COALESCE(SUM(CASE WHEN g.moneda='USD' THEN g.monto ELSE 0 END), 0) as total_usd
    FROM users u
    LEFT JOIN gastos g ON g.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC`
  ).all();
  res.json(users);
});

// Crear usuario (admin)
router.post('/', adminMiddleware, (req, res) => {
  const { nombre, email, password, rol = 'usuario' } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
  }
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existe) return res.status(400).json({ error: 'El email ya existe' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (nombre, email, password, rol) VALUES (?, ?, ?, ?)'
  ).run(nombre, email, hash, rol);

  res.json({ id: result.lastInsertRowid, nombre, email, rol });
});

// Editar usuario (admin)
router.put('/:id', adminMiddleware, (req, res) => {
  const { nombre, email, rol, activo, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const nuevoNombre = nombre ?? user.nombre;
  const nuevoEmail = email ?? user.email;
  const nuevoRol = rol ?? user.rol;
  const nuevoActivo = activo !== undefined ? (activo ? 1 : 0) : user.activo;

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET nombre=?, email=?, rol=?, activo=?, password=? WHERE id=?')
      .run(nuevoNombre, nuevoEmail, nuevoRol, nuevoActivo, hash, req.params.id);
  } else {
    db.prepare('UPDATE users SET nombre=?, email=?, rol=?, activo=? WHERE id=?')
      .run(nuevoNombre, nuevoEmail, nuevoRol, nuevoActivo, req.params.id);
  }

  res.json({ ok: true });
});

// Eliminar usuario (admin)
router.delete('/:id', adminMiddleware, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
  }
  db.prepare('UPDATE users SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Ver gastos de un usuario (admin)
router.get('/:id/gastos', adminMiddleware, (req, res) => {
  const gastos = db.prepare(
    `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
     FROM gastos g
     LEFT JOIN categorias c ON c.id = g.categoria_id
     WHERE g.user_id = ?
     ORDER BY g.fecha DESC, g.created_at DESC`
  ).all(req.params.id);
  res.json(gastos);
});

module.exports = router;
