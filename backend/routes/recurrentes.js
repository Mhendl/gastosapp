const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// --- Gastos recurrentes (fijos y cuotas) ---

router.get('/gastos', (req, res) => {
  const items = db.prepare(
    `SELECT r.*, c.nombre as categoria_nombre, c.icono as categoria_icono
     FROM gastos_recurrentes r
     LEFT JOIN categorias c ON c.id = r.categoria_id
     WHERE r.user_id = ? AND r.activo = 1
     ORDER BY r.tipo DESC, r.descripcion ASC`
  ).all(req.user.id);
  res.json(items);
});

router.post('/gastos', (req, res) => {
  const { descripcion, monto, moneda = 'ARS', categoria_id, tipo = 'fijo', cuota_actual, cuota_total, mes_referencia } = req.body;
  if (!descripcion || !monto) return res.status(400).json({ error: 'Descripción y monto requeridos' });

  const result = db.prepare(
    `INSERT INTO gastos_recurrentes (user_id, descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.id, descripcion, parseFloat(monto), moneda,
    categoria_id || null, tipo,
    cuota_actual || null, cuota_total || null, mes_referencia || null
  );

  const item = db.prepare(
    `SELECT r.*, c.nombre as categoria_nombre, c.icono as categoria_icono
     FROM gastos_recurrentes r LEFT JOIN categorias c ON c.id = r.categoria_id WHERE r.id = ?`
  ).get(result.lastInsertRowid);
  res.json(item);
});

router.put('/gastos/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM gastos_recurrentes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const { descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia } = req.body;
  db.prepare(
    `UPDATE gastos_recurrentes
     SET descripcion=?, monto=?, moneda=?, categoria_id=?, tipo=?, cuota_actual=?, cuota_total=?, mes_referencia=?
     WHERE id=?`
  ).run(
    descripcion ?? item.descripcion,
    monto !== undefined ? parseFloat(monto) : item.monto,
    moneda ?? item.moneda,
    categoria_id !== undefined ? categoria_id : item.categoria_id,
    tipo ?? item.tipo,
    cuota_actual !== undefined ? cuota_actual : item.cuota_actual,
    cuota_total !== undefined ? cuota_total : item.cuota_total,
    mes_referencia !== undefined ? mes_referencia : item.mes_referencia,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/gastos/:id', (req, res) => {
  db.prepare('UPDATE gastos_recurrentes SET activo = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/gastos/bulk-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de ids' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(
    `UPDATE gastos_recurrentes SET activo = 0 WHERE user_id = ? AND id IN (${placeholders})`
  ).run(req.user.id, ...ids);
  res.json({ ok: true, eliminados: result.changes });
});

// --- Ingresos recurrentes ---

router.get('/ingresos', (req, res) => {
  res.json(db.prepare('SELECT * FROM ingresos_recurrentes WHERE user_id = ? AND activo = 1 ORDER BY descripcion').all(req.user.id));
});

router.post('/ingresos', (req, res) => {
  const { descripcion, monto, moneda = 'ARS' } = req.body;
  if (!descripcion || !monto) return res.status(400).json({ error: 'Descripción y monto requeridos' });

  const result = db.prepare(
    'INSERT INTO ingresos_recurrentes (user_id, descripcion, monto, moneda) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, descripcion, parseFloat(monto), moneda);

  res.json(db.prepare('SELECT * FROM ingresos_recurrentes WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/ingresos/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM ingresos_recurrentes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const { descripcion, monto, moneda } = req.body;
  db.prepare('UPDATE ingresos_recurrentes SET descripcion=?, monto=?, moneda=? WHERE id=?').run(
    descripcion ?? item.descripcion,
    monto !== undefined ? parseFloat(monto) : item.monto,
    moneda ?? item.moneda,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/ingresos/:id', (req, res) => {
  db.prepare('UPDATE ingresos_recurrentes SET activo = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
