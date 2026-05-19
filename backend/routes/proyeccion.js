const express = require('express');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function addMonths(yyyymm, n) {
  const [year, month] = yyyymm.split('-').map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split('-').map(Number);
  const [ty, tm] = toYYYYMM.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

router.get('/', (req, res) => {
  const meses = Math.min(parseInt(req.query.meses) || 12, 24);
  const userId = req.user.id;

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const recurrentes = db.prepare(
    `SELECT r.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
     FROM gastos_recurrentes r
     LEFT JOIN categorias c ON c.id = r.categoria_id
     WHERE r.user_id = ? AND r.activo = 1`
  ).all(userId);

  const ingresos = db.prepare(
    'SELECT * FROM ingresos_recurrentes WHERE user_id = ? AND activo = 1 ORDER BY descripcion'
  ).all(userId);

  const proyeccion = [];

  for (let i = 0; i < meses; i++) {
    const mes = addMonths(mesActual, i);

    // Gastos recurrentes activos este mes
    const recurrentesDelMes = recurrentes.reduce((acc, g) => {
      if (g.tipo === 'fijo') {
        acc.push({ ...g });
        return acc;
      }
      if (g.tipo === 'cuota' && g.mes_referencia && g.cuota_actual && g.cuota_total) {
        const diff = monthDiff(g.mes_referencia, mes);
        const cuotaNum = g.cuota_actual + diff;
        if (cuotaNum >= 1 && cuotaNum <= g.cuota_total) {
          acc.push({ ...g, cuota_num: cuotaNum });
        }
      }
      return acc;
    }, []);

    // Gastos registrados (uno a uno) para este mes
    const gastosRegistrados = db.prepare(
      `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
       FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id
       WHERE g.user_id = ? AND strftime('%Y-%m', g.fecha) = ?
       ORDER BY g.fecha DESC`
    ).all(userId, mes);

    const recARS = recurrentesDelMes.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0);
    const recUSD = recurrentesDelMes.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0);
    const regARS = gastosRegistrados.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0);
    const regUSD = gastosRegistrados.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0);
    const ingARS = ingresos.filter(i => i.moneda === 'ARS').reduce((s, i) => s + i.monto, 0);
    const ingUSD = ingresos.filter(i => i.moneda === 'USD').reduce((s, i) => s + i.monto, 0);

    proyeccion.push({
      mes,
      recurrentes: recurrentesDelMes,
      gastosRegistrados,
      ingresos,
      totalRecARS: recARS,
      totalRecUSD: recUSD,
      totalRegARS: regARS,
      totalRegUSD: regUSD,
      totalARS: recARS + regARS,
      totalUSD: recUSD + regUSD,
      ingresoARS: ingARS,
      ingresoUSD: ingUSD,
      balanceARS: ingARS - (recARS + regARS),
      balanceUSD: ingUSD - (recUSD + regUSD),
    });
  }

  res.json({ proyeccion, recurrentes, ingresos });
});

module.exports = router;
