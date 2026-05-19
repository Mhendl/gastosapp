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
  const meses = Math.min(parseInt(req.query.meses) || 6, 24);
  const userId = req.user.id;

  const now = new Date();
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const gastos = db.prepare(
    `SELECT r.*, c.nombre as categoria_nombre, c.icono as categoria_icono
     FROM gastos_recurrentes r
     LEFT JOIN categorias c ON c.id = r.categoria_id
     WHERE r.user_id = ? AND r.activo = 1`
  ).all(userId);

  const ingresos = db.prepare(
    'SELECT * FROM ingresos_recurrentes WHERE user_id = ? AND activo = 1'
  ).all(userId);

  const proyeccion = [];

  for (let i = 0; i < meses; i++) {
    const mes = addMonths(mesActual, i);

    const gastosDelMes = gastos.reduce((acc, g) => {
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

    const totalARS = gastosDelMes.filter(g => g.moneda === 'ARS').reduce((s, g) => s + g.monto, 0);
    const totalUSD = gastosDelMes.filter(g => g.moneda === 'USD').reduce((s, g) => s + g.monto, 0);
    const ingresoARS = ingresos.filter(i => i.moneda === 'ARS').reduce((s, i) => s + i.monto, 0);
    const ingresoUSD = ingresos.filter(i => i.moneda === 'USD').reduce((s, i) => s + i.monto, 0);

    proyeccion.push({
      mes,
      gastos: gastosDelMes,
      totalARS,
      totalUSD,
      ingresoARS,
      ingresoUSD,
      balanceARS: ingresoARS - totalARS,
      balanceUSD: ingresoUSD - totalUSD
    });
  }

  res.json({ proyeccion, gastos, ingresos });
});

module.exports = router;
