const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const categorias = db.prepare('SELECT * FROM categorias').all();
const categoriasStr = categorias.map(c => `${c.id}: ${c.nombre}`).join(', ');

// ─── Helpers ───────────────────────────────────────────────────────────

function fechaHoy() {
  return new Date().toISOString().split('T')[0];
}

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function contextoUsuario(userId) {
  // Contexto resumido para que la IA pueda contestar consultas y reconocer gastos a editar/borrar
  const hoy = fechaHoy();
  const mes = mesActual();
  const desde30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const totalesMes = db.prepare(
    `SELECT moneda, SUM(monto) as total, COUNT(*) as cantidad
     FROM gastos WHERE user_id = ? AND strftime('%Y-%m', fecha) = ?
     GROUP BY moneda`
  ).all(userId, mes);

  const ultimos = db.prepare(
    `SELECT g.id, g.descripcion, g.monto, g.moneda, g.fecha, c.nombre as categoria
     FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id
     WHERE g.user_id = ? AND g.fecha >= ?
     ORDER BY g.fecha DESC, g.id DESC LIMIT 25`
  ).all(userId, desde30);

  const cuotasActivas = db.prepare(
    `SELECT id, descripcion, monto, moneda, cuota_actual, cuota_total, mes_referencia
     FROM gastos_recurrentes
     WHERE user_id = ? AND activo = 1 AND tipo = 'cuota'`
  ).all(userId);

  const fijos = db.prepare(
    `SELECT id, descripcion, monto, moneda
     FROM gastos_recurrentes WHERE user_id = ? AND activo = 1 AND tipo = 'fijo'`
  ).all(userId);

  return { hoy, mes, totalesMes, ultimos, cuotasActivas, fijos };
}

// Filtro server-side para acciones de búsqueda/eliminar/editar
function buscarGastos(userId, filtro = {}) {
  let sql = `
    SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
    FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id
    WHERE g.user_id = ?
  `;
  const params = [userId];
  if (filtro.descripcion) {
    sql += ' AND lower(g.descripcion) LIKE ?';
    params.push(`%${String(filtro.descripcion).toLowerCase()}%`);
  }
  if (filtro.desde)  { sql += ' AND g.fecha >= ?'; params.push(filtro.desde); }
  if (filtro.hasta)  { sql += ' AND g.fecha <= ?'; params.push(filtro.hasta); }
  if (filtro.mes)    { sql += " AND strftime('%Y-%m', g.fecha) = ?"; params.push(filtro.mes); }
  if (filtro.moneda) { sql += ' AND g.moneda = ?'; params.push(filtro.moneda); }
  if (filtro.categoria_id) { sql += ' AND g.categoria_id = ?'; params.push(filtro.categoria_id); }
  if (filtro.monto_min)   { sql += ' AND g.monto >= ?'; params.push(parseFloat(filtro.monto_min)); }
  if (filtro.monto_max)   { sql += ' AND g.monto <= ?'; params.push(parseFloat(filtro.monto_max)); }
  if (filtro.ids?.length) {
    const ph = filtro.ids.map(() => '?').join(',');
    sql += ` AND g.id IN (${ph})`;
    params.push(...filtro.ids);
  }
  sql += ' ORDER BY g.fecha DESC, g.id DESC LIMIT 100';
  return db.prepare(sql).all(...params);
}

function buscarRecurrentes(userId, filtro = {}) {
  let sql = `
    SELECT r.*, c.nombre as categoria_nombre, c.icono as categoria_icono
    FROM gastos_recurrentes r LEFT JOIN categorias c ON c.id = r.categoria_id
    WHERE r.user_id = ? AND r.activo = 1
  `;
  const params = [userId];
  if (filtro.descripcion) {
    sql += ' AND lower(r.descripcion) LIKE ?';
    params.push(`%${String(filtro.descripcion).toLowerCase()}%`);
  }
  if (filtro.tipo) { sql += ' AND r.tipo = ?'; params.push(filtro.tipo); }
  if (filtro.ids?.length) {
    const ph = filtro.ids.map(() => '?').join(',');
    sql += ` AND r.id IN (${ph})`;
    params.push(...filtro.ids);
  }
  return db.prepare(sql).all(...params);
}

// ─── System prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx) {
  const totalMes = ctx.totalesMes.map(t => `${t.moneda} ${t.total.toFixed(2)} (${t.cantidad} gastos)`).join(', ') || 'sin gastos';
  const ultimosTxt = ctx.ultimos.slice(0, 15).map(g => `[id:${g.id}] ${g.fecha} ${g.descripcion} ${g.moneda} ${g.monto} (${g.categoria || 'sin cat'})`).join('\n  ') || '  (sin gastos recientes)';
  const cuotasTxt = ctx.cuotasActivas.map(c => `[id:${c.id}] ${c.descripcion} ${c.moneda} ${c.monto} cuota ${c.cuota_actual}/${c.cuota_total} (ref ${c.mes_referencia})`).join('\n  ') || '  (sin cuotas)';
  const fijosTxt = ctx.fijos.map(f => `[id:${f.id}] ${f.descripcion} ${f.moneda} ${f.monto}`).join('\n  ') || '  (sin fijos)';

  return `Sos un asistente de gestión de gastos personales en Argentina.
Ayudás a registrar, consultar, editar y borrar gastos.

CATEGORÍAS DISPONIBLES (id: nombre):
${categoriasStr}

CONTEXTO DEL USUARIO (${ctx.hoy}, mes ${ctx.mes}):
- Totales del mes: ${totalMes}
- Últimos gastos registrados:
  ${ultimosTxt}
- Cuotas activas:
  ${cuotasTxt}
- Gastos fijos:
  ${fijosTxt}

---
REGLAS GENERALES:
- Hablás en castellano rioplatense (vos, sos).
- SIEMPRE respondés con JSON puro, sin texto antes ni después.
- Moneda por defecto: ARS. Si dicen dólares/USD/u$s → "USD".
- Fecha por defecto: hoy (${ctx.hoy}).
- Los montos son números sin separadores de miles. Usá monto POSITIVO para gastos normales, y monto NEGATIVO solo para devoluciones/reintegros/anulaciones (ej: "me devolvieron 5000 de GitHub" → monto: -5000, descripcion: "GitHub (devolución)").
- Si te faltan datos importantes (cuota actual y total cuando habla de cuotas) → preguntá con accion "consulta".

---
ACCIONES (elegí UNA por respuesta):

### 1) Registrar gastos puntuales (un solo mes):
{
  "accion": "registrar_gastos",
  "gastos": [
    {"descripcion":"Almuerzo","monto":3200,"moneda":"ARS","categoria_id":1,"fecha":"${ctx.hoy}","notas":""}
  ],
  "mensaje": "Listo, ¿confirmás estos gastos?"
}

### 2) Registrar gastos recurrentes (fijos mensuales o cuotas):
{
  "accion": "registrar_recurrente",
  "recurrentes": [
    {"descripcion":"Tienda BNA","monto":20250,"moneda":"ARS","categoria_id":10,
     "tipo":"cuota","cuota_actual":13,"cuota_total":24,"mes_referencia":"${ctx.mes}"}
  ],
  "mensaje": "Te cargo estas cuotas..."
}
- tipo "fijo" para alquiler/luz/internet/gym (sin campos de cuota).
- tipo "cuota" SIEMPRE con cuota_actual, cuota_total y mes_referencia (YYYY-MM).

### 3) Registrar ingresos mensuales:
{
  "accion": "registrar_ingreso",
  "ingresos": [{"descripcion":"Sueldo","monto":2400000,"moneda":"ARS"}],
  "mensaje": "..."
}

### 4) Eliminar gastos (puntuales) buscándolos por criterio:
{
  "accion": "buscar_eliminar",
  "tabla": "gastos",
  "filtro": {"descripcion":"uber","desde":"2026-04-01","hasta":"2026-04-30"},
  "mensaje": "Encontré estos Ubers de abril, ¿los borro?"
}
- Filtros válidos: descripcion (substring), desde, hasta, mes ("YYYY-MM"), moneda, categoria_id, monto_min, monto_max, ids ([1,2]).
- Si el usuario menciona un id específico de los listados arriba, usá "ids":[N].

### 5) Eliminar recurrentes (fijos o cuotas):
{
  "accion": "buscar_eliminar",
  "tabla": "recurrentes",
  "filtro": {"descripcion":"netflix"},
  "mensaje": "Te borro este recurrente?"
}

### 6) Editar gastos (puntuales o recurrentes):
{
  "accion": "editar",
  "tabla": "gastos",
  "filtro": {"ids":[123]},
  "cambios": {"monto": 5000, "descripcion": "Nuevo nombre", "categoria_id": 2, "fecha": "2026-05-19"},
  "mensaje": "Te lo dejo en $5000, ¿confirmás?"
}
- tabla: "gastos" o "recurrentes".
- En cambios incluí SOLO los campos a modificar.
- Para recurrentes podés cambiar: descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia.

### 7) Consulta / pregunta general (no modifica nada):
{
  "accion": "consulta",
  "mensaje": "Este mes llevás gastados $XX en ARS..."
}
- Usá los datos del contexto para responder consultas como "cuánto gasté", "cuáles son mis cuotas activas", etc.

---
NUNCA inventes IDs que no aparezcan en el contexto.
NUNCA mezcles acciones distintas en una sola respuesta.
Si la pregunta es ambigua, devolvé accion "consulta" con un texto pidiendo aclaración.`;
}

// ─── Endpoint chat (genera plan; no escribe) ───────────────────────────

router.post('/chat', async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

  const ctx = contextoUsuario(req.user.id);
  const systemPrompt = buildSystemPrompt(ctx);

  const historial = db.prepare(
    `SELECT rol, contenido FROM chat_mensajes WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`
  ).all(req.user.id).reverse();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historial.map(m => ({ role: m.rol, content: m.contenido })),
    { role: 'user', content: mensaje }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });

    const respuestaRaw = completion.choices[0].message.content;

    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'user', mensaje);
    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'assistant', respuestaRaw);

    let parsed;
    try { parsed = JSON.parse(respuestaRaw); }
    catch { parsed = { accion: 'consulta', mensaje: respuestaRaw }; }

    // Construimos el preview que el frontend va a confirmar
    const pending = construirPending(req.user.id, parsed);

    res.json({
      mensaje: parsed.mensaje || '',
      accion: parsed.accion,
      pending  // null si es solo consulta
    });
  } catch (err) {
    console.error('Error OpenAI:', err.message);
    res.status(500).json({ error: 'Error al procesar con IA: ' + err.message });
  }
});

// Convierte la respuesta de la IA en un preview con datos resueltos (sin escribir)
function construirPending(userId, parsed) {
  switch (parsed.accion) {
    case 'registrar_gastos':
      return {
        tipo: 'registrar_gastos',
        items: (parsed.gastos || []).filter(g => g.monto && g.descripcion).map((g, i) => ({
          _id: `g${i}`,
          descripcion: String(g.descripcion),
          monto: parseFloat(g.monto),
          moneda: g.moneda || 'ARS',
          categoria_id: g.categoria_id || null,
          fecha: g.fecha || fechaHoy(),
          notas: g.notas || null
        }))
      };

    case 'registrar_recurrente':
      return {
        tipo: 'registrar_recurrente',
        items: (parsed.recurrentes || []).filter(r => r.monto && r.descripcion).map((r, i) => ({
          _id: `r${i}`,
          descripcion: String(r.descripcion),
          monto: parseFloat(r.monto),
          moneda: r.moneda || 'ARS',
          categoria_id: r.categoria_id || null,
          tipo: r.tipo === 'cuota' ? 'cuota' : 'fijo',
          cuota_actual: r.tipo === 'cuota' ? (r.cuota_actual || null) : null,
          cuota_total: r.tipo === 'cuota' ? (r.cuota_total || null) : null,
          mes_referencia: r.tipo === 'cuota' ? (r.mes_referencia || mesActual()) : null
        }))
      };

    case 'registrar_ingreso':
      return {
        tipo: 'registrar_ingreso',
        items: (parsed.ingresos || []).filter(i => i.monto && i.descripcion).map((i, idx) => ({
          _id: `i${idx}`,
          descripcion: String(i.descripcion),
          monto: parseFloat(i.monto),
          moneda: i.moneda || 'ARS'
        }))
      };

    case 'buscar_eliminar': {
      const tabla = parsed.tabla === 'recurrentes' ? 'recurrentes' : 'gastos';
      const items = tabla === 'recurrentes'
        ? buscarRecurrentes(userId, parsed.filtro || {})
        : buscarGastos(userId, parsed.filtro || {});
      return { tipo: 'eliminar', tabla, items };
    }

    case 'editar': {
      const tabla = parsed.tabla === 'recurrentes' ? 'recurrentes' : 'gastos';
      const matches = tabla === 'recurrentes'
        ? buscarRecurrentes(userId, parsed.filtro || {})
        : buscarGastos(userId, parsed.filtro || {});
      return {
        tipo: 'editar',
        tabla,
        cambios: parsed.cambios || {},
        items: matches  // el cliente ve el "antes" y los cambios propuestos
      };
    }

    default:
      return null;
  }
}

// ─── Endpoint aplicar (escribe lo confirmado) ─────────────────────────

router.post('/aplicar', (req, res) => {
  const { pending } = req.body;
  if (!pending?.tipo) return res.status(400).json({ error: 'Pending inválido' });
  const userId = req.user.id;

  try {
    switch (pending.tipo) {
      case 'registrar_gastos': {
        const insertados = [];
        for (const g of (pending.items || [])) {
          if (!g.monto || !g.descripcion) continue;
          const r = db.prepare(
            `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen)
             VALUES (?,?,?,?,?,?,?,'ia')`
          ).run(userId, g.descripcion, parseFloat(g.monto), g.moneda || 'ARS',
            g.categoria_id || null, g.fecha || fechaHoy(), g.notas || null);
          insertados.push(db.prepare(
            `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
             FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
          ).get(r.lastInsertRowid));
        }
        return res.json({ ok: true, insertados, mensaje: `${insertados.length} gastos registrados` });
      }

      case 'registrar_recurrente': {
        const insertados = [];
        for (const r of (pending.items || [])) {
          if (!r.monto || !r.descripcion) continue;
          const rs = db.prepare(
            `INSERT INTO gastos_recurrentes (user_id, descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia)
             VALUES (?,?,?,?,?,?,?,?,?)`
          ).run(userId, r.descripcion, parseFloat(r.monto), r.moneda || 'ARS',
            r.categoria_id || null, r.tipo || 'fijo',
            r.cuota_actual || null, r.cuota_total || null, r.mes_referencia || null);
          insertados.push(db.prepare(
            `SELECT rec.*, c.nombre as categoria_nombre, c.icono as categoria_icono
             FROM gastos_recurrentes rec LEFT JOIN categorias c ON c.id = rec.categoria_id WHERE rec.id = ?`
          ).get(rs.lastInsertRowid));
        }
        return res.json({ ok: true, insertados, mensaje: `${insertados.length} recurrentes cargados` });
      }

      case 'registrar_ingreso': {
        const insertados = [];
        for (const i of (pending.items || [])) {
          if (!i.monto || !i.descripcion) continue;
          const r = db.prepare(
            'INSERT INTO ingresos_recurrentes (user_id, descripcion, monto, moneda) VALUES (?,?,?,?)'
          ).run(userId, i.descripcion, parseFloat(i.monto), i.moneda || 'ARS');
          insertados.push(db.prepare('SELECT * FROM ingresos_recurrentes WHERE id = ?').get(r.lastInsertRowid));
        }
        return res.json({ ok: true, insertados, mensaje: `${insertados.length} ingresos cargados` });
      }

      case 'eliminar': {
        const ids = (pending.items || []).map(i => i.id).filter(Boolean);
        if (!ids.length) return res.json({ ok: true, eliminados: 0, mensaje: 'Nada para borrar' });
        const ph = ids.map(() => '?').join(',');
        const r = pending.tabla === 'recurrentes'
          ? db.prepare(`UPDATE gastos_recurrentes SET activo = 0 WHERE user_id = ? AND id IN (${ph})`).run(userId, ...ids)
          : db.prepare(`DELETE FROM gastos WHERE user_id = ? AND id IN (${ph})`).run(userId, ...ids);
        return res.json({ ok: true, eliminados: r.changes, mensaje: `${r.changes} eliminados` });
      }

      case 'editar': {
        const ids = (pending.items || []).map(i => i.id).filter(Boolean);
        const cambios = pending.cambios || {};
        let actualizados = 0;
        for (const id of ids) {
          if (pending.tabla === 'recurrentes') {
            const actual = db.prepare('SELECT * FROM gastos_recurrentes WHERE id = ? AND user_id = ?').get(id, userId);
            if (!actual) continue;
            db.prepare(
              `UPDATE gastos_recurrentes
               SET descripcion=?, monto=?, moneda=?, categoria_id=?, tipo=?, cuota_actual=?, cuota_total=?, mes_referencia=?
               WHERE id=?`
            ).run(
              cambios.descripcion ?? actual.descripcion,
              cambios.monto !== undefined ? parseFloat(cambios.monto) : actual.monto,
              cambios.moneda ?? actual.moneda,
              cambios.categoria_id !== undefined ? cambios.categoria_id : actual.categoria_id,
              cambios.tipo ?? actual.tipo,
              cambios.cuota_actual !== undefined ? cambios.cuota_actual : actual.cuota_actual,
              cambios.cuota_total !== undefined ? cambios.cuota_total : actual.cuota_total,
              cambios.mes_referencia !== undefined ? cambios.mes_referencia : actual.mes_referencia,
              id
            );
            actualizados++;
          } else {
            const actual = db.prepare('SELECT * FROM gastos WHERE id = ? AND user_id = ?').get(id, userId);
            if (!actual) continue;
            db.prepare(
              `UPDATE gastos SET descripcion=?, monto=?, moneda=?, categoria_id=?, fecha=?, notas=? WHERE id=?`
            ).run(
              cambios.descripcion ?? actual.descripcion,
              cambios.monto !== undefined ? parseFloat(cambios.monto) : actual.monto,
              cambios.moneda ?? actual.moneda,
              cambios.categoria_id !== undefined ? cambios.categoria_id : actual.categoria_id,
              cambios.fecha ?? actual.fecha,
              cambios.notas !== undefined ? cambios.notas : actual.notas,
              id
            );
            actualizados++;
          }
        }
        return res.json({ ok: true, actualizados, mensaje: `${actualizados} actualizados` });
      }

      default:
        return res.status(400).json({ error: 'Tipo de operación inválido' });
    }
  } catch (err) {
    console.error('Error aplicar:', err.message);
    res.status(500).json({ error: 'Error al aplicar cambios: ' + err.message });
  }
});

// ─── Endpoint upload (resumen Visa / tickets) ─────────────────────────

const UPLOAD_PROMPT = (texto, hoy, mes) => `Analizá este resumen de tarjeta de crédito o ticket y extraé TODOS los movimientos.

TEXTO DEL ARCHIVO:
"""
${texto.slice(0, 12000)}
"""

REGLAS DE EXTRACCIÓN (resumen Banco Nación / Visa):
1) Primero detectá el campo "CIERRE ACTUAL" (ej: "CIERRE ACTUAL: 14 May 26"). Convertilo a YYYY-MM y devolvelo como "cierre" en el JSON final (ej "2026-05"). Si no encontrás cierre, usá "${mes}".

2) Cada línea de transacción tiene formato:
   FECHA(DD.MM.AA) COMPROBANTE DESCRIPCION [Cuota X/Y] MONTO_PESOS [MONTO_DOLARES]
   Ej: "14.05.25  007699* MULTIPOINT S.A.        Cuota 13/24      20.249,95"
   Ej: "20.04.26  006281* SUPREMITAS                               55.496,00"
   Ej: "22.04.26  161641  CLAUDE.AI SUBSCR USD 20,00              20,00"
   El "COMPROBANTE" es el código alfanumérico que va antes de la descripción (ej "007699*", "006281*", "161641", "956809K"). Capturalo TAL CUAL.

3) Si en la línea aparece "Cuota X/Y" → es una CUOTA:
     tipo: "cuota", cuota_actual=X, cuota_total=Y, mes_referencia = cierre (YYYY-MM)
     Va en "recurrentes"

4) Si NO tiene "Cuota" → es un gasto puntual. Va en "gastosUnicos".
     fecha = la fecha de la columna FECHA convertida a YYYY-MM-DD (DD.MM.AA → 20AA-MM-DD)
     IMPORTANTE: el campo "mes_cierre" del gasto = el cierre detectado en el paso 1 (todos los gastos del resumen tienen el MISMO mes_cierre).

5) Monto: formato "20.249,95" (punto miles, coma decimal) → 20249.95.

6) Monedas: las dos últimas columnas son ARS y USD. Si la columna ARS está vacía y la USD tiene valor → moneda="USD", monto = valor USD.

7) "VISA PLAN V" (interés/financiación, ej "VISA PLAN V 8-09 (TNA 79,01)"): INCLUILO como gasto puntual en "gastosUnicos" con descripcion="Interés Plan V", categoria_id=3 (Servicios) y fecha = la fecha de la línea. NO lo metas en "recurrentes". El usuario después decide si lo registra o no.

8) IGNORAR (NO devolver) todo esto:
   - "SALDO ANTERIOR", "SU PAGO", líneas con "TOTAL"
   - Impuestos y percepciones: "IIBB", "IVA RG 4240", "IVA RG", "DB.RG", "DB IVA", "PERCEP-CABA"
   - Líneas de cabecera/pie: "PROXIMO CIERRE", "Tarjeta XXXX Total"

9) REVERSIONES / DEVOLUCIONES: si un monto termina con guión ("22,23-", "2.388,70-") es un crédito/devolución (ej: una queja, un reintegro, una compra anulada). INCLUILA como gasto con MONTO NEGATIVO.
   - En la descripción agregá " (devolución)" al final para que el usuario vea claramente que es una resta.
   - Ej línea "22.04.26 462074K GITHUB, INC. USD 22,23 22,23-" → gasto USD -22.23 descripcion="GitHub (devolución)" fecha="2026-04-22".
   - Conservás TAMBIÉN la compra original si aparece (no las cancelás entre sí).
   - EXCEPCIÓN: las líneas "SU PAGO EN PESOS" o "SU PAGO EN DOLARES" NO son devoluciones, son pagos que vos hiciste a la tarjeta. Esas se siguen IGNORANDO (no las devuelvas).

10) Limpiá la descripción: sacá prefijos como "MERPAGO*", "PAYU*AR*", "DLO*", "WL *", asteriscos sueltos, IDs largos al final ("P88798458USD", "C43IK05n4dtw8xxmq1"). Dejá nombre limpio.
    Ejemplos:
      "MERPAGO*COTO" → "COTO"
      "PAYU*AR*UBER" → "UBER"
      "DLO*DiDi" → "DiDi"
      "GOOGLE *YouTubeP P1l3fnbG" → "YouTube Premium"
      "NETFLIX.COM C43IK05n4dtw8xxmq1" → "Netflix"
      "WL *Steam Purchase" → "Steam"

CATEGORÍAS DISPONIBLES (id: nombre):
${categoriasStr}

- Asigná la categoría más apropiada:
    Comida/Restaurantes → 1
    Uber/Didi/transporte → 2
    Servicios (Spotify, Netflix, YouTube, Google, hosting, ESET, interés Plan V) → 3
    Entretenimiento (Steam, juegos) → 5
    Supermercado (Coto, Carrefour, Día) → 6
    Cuotas/Tarjeta sin categoría clara → 10

RESPONDÉ con JSON ESTRICTO así:
{
  "cierre": "${mes}",
  "recurrentes": [
    {"comprobante":"007699*","descripcion":"MULTIPOINT","monto":20249.95,"moneda":"ARS","categoria_id":10,
     "tipo":"cuota","cuota_actual":13,"cuota_total":24,"mes_referencia":"${mes}"}
  ],
  "gastosUnicos": [
    {"comprobante":"004935K","descripcion":"Uber","monto":18661,"moneda":"ARS","categoria_id":2,"fecha":"2026-04-18","mes_cierre":"${mes}","notas":""}
  ],
  "resumen":"X cuotas y Y gastos detectados en el resumen del cierre YYYY-MM"
}`;

router.post('/upload', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  try {
    let textoExtraido = '';

    if (req.file.mimetype === 'application/pdf') {
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(buffer);
      textoExtraido = data.text;
    } else if (req.file.mimetype.startsWith('image/')) {
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64 = imageBuffer.toString('base64');
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribí TODO el texto visible de este resumen/ticket fila por fila respetando columnas (fecha, descripción, cuota, monto ARS, monto USD). No interpretes, solo transcribí.' },
            { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${base64}` } }
          ]
        }],
        max_tokens: 4000
      });
      textoExtraido = visionResponse.choices[0].message.content;
    } else if (req.file.mimetype === 'text/plain') {
      textoExtraido = fs.readFileSync(req.file.path, 'utf8');
    }

    fs.unlinkSync(req.file.path);

    if (!textoExtraido.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto del archivo' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: UPLOAD_PROMPT(textoExtraido, fechaHoy(), mesActual()) }],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    let parsed;
    try { parsed = JSON.parse(completion.choices[0].message.content); }
    catch { return res.status(500).json({ error: 'No se pudo parsear la respuesta de la IA' }); }

    const cierre = parsed.cierre || mesActual();
    const userId = req.user.id;

    // Helpers de duplicado
    const findGastoDup = (item) => {
      // Prioridad 1: por comprobante (única identidad confiable)
      if (item.comprobante) {
        const r = db.prepare(
          'SELECT id, fecha FROM gastos WHERE user_id = ? AND comprobante = ? LIMIT 1'
        ).get(userId, item.comprobante);
        if (r) return r;
      }
      // Fallback: misma descripción + monto + fecha (mismo día, descripción exacta)
      return db.prepare(
        `SELECT id, fecha FROM gastos
         WHERE user_id = ? AND lower(descripcion) = lower(?) AND monto = ? AND fecha = ? LIMIT 1`
      ).get(userId, item.descripcion, parseFloat(item.monto), item.fecha);
    };
    const findRecDup = (item) => {
      if (item.comprobante) {
        const r = db.prepare(
          'SELECT id FROM gastos_recurrentes WHERE user_id = ? AND comprobante = ? AND activo = 1 LIMIT 1'
        ).get(userId, item.comprobante);
        if (r) return r;
      }
      return db.prepare(
        `SELECT id FROM gastos_recurrentes
         WHERE user_id = ? AND activo = 1 AND lower(descripcion) = lower(?)
           AND cuota_actual = ? AND cuota_total = ? LIMIT 1`
      ).get(userId, item.descripcion, item.cuota_actual || null, item.cuota_total || null);
    };

    // Normalizamos y marcamos duplicados
    const recurrentes = (parsed.recurrentes || []).filter(r => r.monto && r.descripcion).map((r, i) => {
      const item = {
        _id: `r${i}`,
        comprobante: r.comprobante || null,
        descripcion: r.descripcion,
        monto: parseFloat(r.monto),
        moneda: r.moneda || 'ARS',
        categoria_id: r.categoria_id || 10,
        tipo: r.tipo === 'fijo' ? 'fijo' : 'cuota',
        cuota_actual: r.cuota_actual || null,
        cuota_total: r.cuota_total || null,
        mes_referencia: r.mes_referencia || cierre
      };
      const dup = findRecDup(item);
      if (dup) item.duplicado = true;
      return item;
    });

    const gastos = (parsed.gastosUnicos || []).filter(g => g.monto && g.descripcion).map((g, i) => {
      const item = {
        _id: `g${i}`,
        comprobante: g.comprobante || null,
        descripcion: g.descripcion,
        monto: parseFloat(g.monto),
        moneda: g.moneda || 'ARS',
        categoria_id: g.categoria_id || null,
        fecha: g.fecha || fechaHoy(),
        mes_cierre: g.mes_cierre || cierre,
        notas: g.notas || null
      };
      const dup = findGastoDup(item);
      if (dup) item.duplicado = true;
      return item;
    });

    const numDup = recurrentes.filter(r => r.duplicado).length + gastos.filter(g => g.duplicado).length;
    res.json({
      preview: { recurrentes, gastos, cierre },
      resumen: parsed.resumen || `${recurrentes.length} cuotas + ${gastos.length} gastos detectados (cierre ${cierre}${numDup ? `, ${numDup} duplicados` : ''})`
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error upload:', err.message);
    res.status(500).json({ error: 'Error al procesar archivo: ' + err.message });
  }
});

// Aplica el preview del upload (confirmación del usuario)
router.post('/upload/aplicar', (req, res) => {
  const { recurrentes = [], gastos = [] } = req.body;
  const userId = req.user.id;
  const insertadosRec = [];
  const insertadosGas = [];

  try {
    for (const r of recurrentes) {
      if (!r.monto || !r.descripcion) continue;
      const result = db.prepare(
        `INSERT INTO gastos_recurrentes (user_id, descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia, comprobante)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(userId, r.descripcion, parseFloat(r.monto), r.moneda || 'ARS',
        r.categoria_id || 10, r.tipo || 'cuota',
        r.cuota_actual || null, r.cuota_total || null, r.mes_referencia || mesActual(),
        r.comprobante || null);
      insertadosRec.push(db.prepare(
        `SELECT rec.*, c.nombre as categoria_nombre, c.icono as categoria_icono
         FROM gastos_recurrentes rec LEFT JOIN categorias c ON c.id = rec.categoria_id WHERE rec.id = ?`
      ).get(result.lastInsertRowid));
    }
    for (const g of gastos) {
      if (!g.monto || !g.descripcion) continue;
      const result = db.prepare(
        `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen, mes_cierre, comprobante)
         VALUES (?,?,?,?,?,?,?,'archivo',?,?)`
      ).run(userId, g.descripcion, parseFloat(g.monto), g.moneda || 'ARS',
        g.categoria_id || null, g.fecha || fechaHoy(), g.notas || null,
        g.mes_cierre || null, g.comprobante || null);
      insertadosGas.push(db.prepare(
        `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color
         FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
      ).get(result.lastInsertRowid));
    }
    res.json({
      ok: true,
      recurrentes: insertadosRec,
      gastos: insertadosGas,
      mensaje: `Cargué ${insertadosRec.length} cuotas y ${insertadosGas.length} gastos`
    });
  } catch (err) {
    console.error('Error aplicar upload:', err.message);
    res.status(500).json({ error: 'Error al aplicar: ' + err.message });
  }
});

// ─── Historial chat ────────────────────────────────────────────────────

router.get('/historial', (req, res) => {
  const mensajes = db.prepare(
    `SELECT rol, contenido, created_at FROM chat_mensajes WHERE user_id = ? ORDER BY created_at ASC LIMIT 100`
  ).all(req.user.id);
  res.json(mensajes);
});

router.delete('/historial', (req, res) => {
  db.prepare('DELETE FROM chat_mensajes WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
