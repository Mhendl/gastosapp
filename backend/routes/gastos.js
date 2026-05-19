const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Listar gastos del usuario con filtros
router.get('/', (req, res) => {
  const { desde, hasta, categoria, moneda, buscar } = req.query;
  let sql = `
    SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
    FROM gastos g
    LEFT JOIN categorias c ON c.id = g.categoria_id
    WHERE g.user_id = ?
  `;
  const params = [req.user.id];

  if (desde) { sql += ' AND g.fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND g.fecha <= ?'; params.push(hasta); }
  if (categoria) { sql += ' AND g.categoria_id = ?'; params.push(categoria); }
  if (moneda) { sql += ' AND g.moneda = ?'; params.push(moneda); }
  if (buscar) { sql += ' AND g.descripcion LIKE ?'; params.push(`%${buscar}%`); }

  sql += ' ORDER BY g.fecha DESC, g.created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// Resumen por categoría y totales
router.get('/resumen', (req, res) => {
  const { mes, anio } = req.query;
  const filtroFecha = mes && anio
    ? `AND strftime('%Y-%m', g.fecha) = '${anio}-${mes.padStart(2, '0')}'`
    : '';

  const porCategoria = db.prepare(`
    SELECT c.nombre, c.icono, c.color, g.moneda,
      COUNT(*) as cantidad, SUM(g.monto) as total
    FROM gastos g
    LEFT JOIN categorias c ON c.id = g.categoria_id
    WHERE g.user_id = ? ${filtroFecha}
    GROUP BY g.categoria_id, g.moneda
    ORDER BY total DESC
  `).all(req.user.id);

  const totales = db.prepare(`
    SELECT moneda, SUM(monto) as total, COUNT(*) as cantidad
    FROM gastos g WHERE user_id = ? ${filtroFecha}
    GROUP BY moneda
  `).all(req.user.id);

  const porMes = db.prepare(`
    SELECT strftime('%Y-%m', fecha) as mes, moneda, SUM(monto) as total
    FROM gastos WHERE user_id = ?
    GROUP BY mes, moneda ORDER BY mes DESC LIMIT 24
  `).all(req.user.id);

  res.json({ porCategoria, totales, porMes });
});

// Crear gasto manual
router.post('/', (req, res) => {
  const { descripcion, monto, moneda = 'ARS', categoria_id, fecha, notas, origen } = req.body;
  if (!descripcion || !monto) {
    return res.status(400).json({ error: 'Descripción y monto requeridos' });
  }

  const result = db.prepare(
    `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, descripcion, parseFloat(monto), moneda,
    categoria_id || null,
    fecha || new Date().toISOString().split('T')[0],
    notas || null,
    origen || 'manual'
  );

  const gasto = db.prepare(
    `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
     FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
  ).get(result.lastInsertRowid);

  res.json(gasto);
});

// Editar gasto
router.put('/:id', (req, res) => {
  const gasto = db.prepare('SELECT * FROM gastos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

  const { descripcion, monto, moneda, categoria_id, fecha, notas } = req.body;
  db.prepare(
    `UPDATE gastos SET descripcion=?, monto=?, moneda=?, categoria_id=?, fecha=?, notas=? WHERE id=?`
  ).run(
    descripcion ?? gasto.descripcion,
    monto !== undefined ? parseFloat(monto) : gasto.monto,
    moneda ?? gasto.moneda,
    categoria_id !== undefined ? categoria_id : gasto.categoria_id,
    fecha ?? gasto.fecha,
    notas !== undefined ? notas : gasto.notas,
    req.params.id
  );

  const actualizado = db.prepare(
    `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
     FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
  ).get(req.params.id);
  res.json(actualizado);
});

// Eliminar gasto único
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM gastos WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Gasto no encontrado' });
  res.json({ ok: true });
});

// Eliminar varios gastos a la vez
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de ids' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(
    `DELETE FROM gastos WHERE user_id = ? AND id IN (${placeholders})`
  ).run(req.user.id, ...ids);
  res.json({ ok: true, eliminados: result.changes });
});

// Listar categorías
router.get('/categorias', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
});

module.exports = router;
