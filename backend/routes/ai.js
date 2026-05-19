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

const SYSTEM_PROMPT = `Sos un asistente de gestión de gastos personales en Argentina.
Tu trabajo es ayudar al usuario a registrar, consultar y analizar sus gastos.

CATEGORÍAS DISPONIBLES (id: nombre):
${categoriasStr}

---
ACCIONES DISPONIBLES - Respondé SIEMPRE con JSON puro (sin texto antes ni después):

### 1. GASTO PUNTUAL (un solo mes, ya ocurrió o va a ocurrir una vez):
{
  "accion": "registrar_gastos",
  "gastos": [
    {
      "descripcion": "descripción clara",
      "monto": 1500.00,
      "moneda": "ARS",
      "categoria_id": 1,
      "fecha": "2026-05-19",
      "notas": "opcional"
    }
  ],
  "mensaje": "Confirmación amigable"
}

### 2. GASTO EN CUOTAS o GASTO FIJO MENSUAL (alquiler, servicios, cuotas de tarjeta):
{
  "accion": "registrar_recurrente",
  "recurrentes": [
    {
      "descripcion": "descripción",
      "monto": 20250.00,
      "moneda": "ARS",
      "categoria_id": 10,
      "tipo": "cuota",
      "cuota_actual": 3,
      "cuota_total": 12,
      "mes_referencia": "2026-05"
    }
  ],
  "mensaje": "Confirmación"
}
Para gastos fijos mensuales (alquiler, luz, internet, gym, sueldo de empleada, etc.) usá tipo "fijo" y omitir campos de cuota.

### 3. INGRESO MENSUAL (sueldo, freelance, renta, etc.):
{
  "accion": "registrar_ingreso",
  "ingresos": [
    {
      "descripcion": "Sueldo",
      "monto": 2400000.00,
      "moneda": "ARS"
    }
  ],
  "mensaje": "Confirmación"
}

### 4. CONSULTA O PREGUNTA GENERAL:
{
  "accion": "consulta",
  "mensaje": "Tu respuesta aquí"
}

---
REGLAS IMPORTANTES:
- Moneda por defecto: ARS. Si dicen dólares/USD/u$s/US$ → "USD"
- Fecha por defecto: hoy ${new Date().toISOString().split('T')[0]}
- mes_referencia: el mes en que se está pagando la cuota_actual (formato YYYY-MM)
- Si el usuario menciona cuotas pero NO dice cuál cuota va ni el total, PREGUNTALE antes de registrar: "¿En qué cuota estás actualmente y cuántas cuotas son en total? (ej: cuota 3 de 12)"
- Si hay múltiples gastos en un mensaje, incluílos todos en el array
- Detectá automáticamente la categoría más apropiada
- Cuando te pasen un resumen de tarjeta de crédito, analizá CADA item:
  * Si tiene formato X/Y (ej: 14/24) → tipo "cuota" con cuota_actual=X, cuota_total=Y
  * Si es un gasto fijo → tipo "fijo"
  * Agrupá todos los recurrentes en una sola respuesta "registrar_recurrente"
- Siempre respondé en español rioplatense (vos, sos, etc.)
- Los montos siempre deben ser números positivos`;

// Chat con IA
router.post('/chat', async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

  const historial = db.prepare(
    `SELECT rol, contenido FROM chat_mensajes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`
  ).all(req.user.id).reverse();

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historial.map(m => ({ role: m.rol, content: m.contenido })),
    { role: 'user', content: mensaje }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 2000
    });

    const respuestaRaw = completion.choices[0].message.content;

    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'user', mensaje);
    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'assistant', respuestaRaw);

    let parsedResponse;
    try {
      const jsonMatch = respuestaRaw.match(/\{[\s\S]*\}/);
      parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : respuestaRaw);
    } catch {
      parsedResponse = { accion: 'consulta', mensaje: respuestaRaw };
    }

    const gastosRegistrados = [];
    const recurrentesRegistrados = [];
    const ingresosRegistrados = [];

    // Gasto puntual
    if (parsedResponse.accion === 'registrar_gastos' && Array.isArray(parsedResponse.gastos)) {
      for (const gasto of parsedResponse.gastos) {
        if (!gasto.monto || !gasto.descripcion) continue;
        const result = db.prepare(
          `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ia')`
        ).run(
          req.user.id,
          gasto.descripcion,
          parseFloat(gasto.monto),
          gasto.moneda || 'ARS',
          gasto.categoria_id || null,
          gasto.fecha || new Date().toISOString().split('T')[0],
          gasto.notas || null
        );
        const g = db.prepare(
          `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono
           FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
        ).get(result.lastInsertRowid);
        gastosRegistrados.push(g);
      }
    }

    // Gasto recurrente o cuota
    if (parsedResponse.accion === 'registrar_recurrente' && Array.isArray(parsedResponse.recurrentes)) {
      for (const r of parsedResponse.recurrentes) {
        if (!r.monto || !r.descripcion) continue;
        const result = db.prepare(
          `INSERT INTO gastos_recurrentes (user_id, descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          req.user.id,
          r.descripcion,
          parseFloat(r.monto),
          r.moneda || 'ARS',
          r.categoria_id || null,
          r.tipo || 'fijo',
          r.cuota_actual || null,
          r.cuota_total || null,
          r.mes_referencia || null
        );
        const item = db.prepare(
          `SELECT rec.*, c.nombre as categoria_nombre, c.icono as categoria_icono
           FROM gastos_recurrentes rec LEFT JOIN categorias c ON c.id = rec.categoria_id WHERE rec.id = ?`
        ).get(result.lastInsertRowid);
        recurrentesRegistrados.push(item);
      }
    }

    // Ingreso mensual
    if (parsedResponse.accion === 'registrar_ingreso' && Array.isArray(parsedResponse.ingresos)) {
      for (const i of parsedResponse.ingresos) {
        if (!i.monto || !i.descripcion) continue;
        const result = db.prepare(
          'INSERT INTO ingresos_recurrentes (user_id, descripcion, monto, moneda) VALUES (?, ?, ?, ?)'
        ).run(req.user.id, i.descripcion, parseFloat(i.monto), i.moneda || 'ARS');
        ingresosRegistrados.push(db.prepare('SELECT * FROM ingresos_recurrentes WHERE id = ?').get(result.lastInsertRowid));
      }
    }

    res.json({
      mensaje: parsedResponse.mensaje || respuestaRaw,
      accion: parsedResponse.accion,
      gastosRegistrados,
      recurrentesRegistrados,
      ingresosRegistrados
    });
  } catch (err) {
    console.error('Error OpenAI:', err.message);
    res.status(500).json({ error: 'Error al procesar con IA: ' + err.message });
  }
});

// Subir archivo (resumen de tarjeta, ticket, etc.)
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
            { type: 'text', text: 'Extraé todo el texto de esta imagen de resumen de tarjeta o ticket. Devolvé solo el texto.' },
            { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${base64}` } }
          ]
        }],
        max_tokens: 2000
      });
      textoExtraido = visionResponse.choices[0].message.content;
    } else if (req.file.mimetype === 'text/plain') {
      textoExtraido = fs.readFileSync(req.file.path, 'utf8');
    }

    fs.unlinkSync(req.file.path);

    if (!textoExtraido.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto del archivo' });
    }

    const mesActual = new Date().toISOString().slice(0, 7);

    const prompt = `Analizá este resumen de tarjeta/ticket y extraé TODOS los gastos.
Para cada item determiná si es una cuota (tiene formato X/Y o similar) o un gasto puntual.

TEXTO:
${textoExtraido.slice(0, 8000)}

Respondé SOLO con este JSON:
{
  "recurrentes": [
    {
      "descripcion": "nombre del item",
      "monto": 20250.00,
      "moneda": "ARS",
      "categoria_id": 10,
      "tipo": "cuota",
      "cuota_actual": 14,
      "cuota_total": 24,
      "mes_referencia": "${mesActual}"
    }
  ],
  "gastosUnicos": [
    {
      "descripcion": "compra puntual",
      "monto": 5000.00,
      "moneda": "ARS",
      "categoria_id": 1,
      "fecha": "${new Date().toISOString().split('T')[0]}",
      "notas": ""
    }
  ],
  "resumen": "X cuotas cargadas, Y gastos puntuales"
}

REGLAS:
- Si el item tiene formato "X/Y" (ej: 14/24, 3/12) → tipo "cuota" con cuota_actual=X, cuota_total=Y
- Gastos fijos sin cuotas (alquiler, servicios) → tipo "fijo" sin campos de cuota
- Para gastos de tarjeta sin info de cuotas → gastosUnicos
- CATEGORÍAS: ${categoriasStr}
- cuota_actual=1 para cuotas si no se especifica cuál va`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4000
    });

    const respuestaRaw = completion.choices[0].message.content;
    let parsed;
    try {
      const jsonMatch = respuestaRaw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : respuestaRaw);
    } catch {
      return res.status(500).json({ error: 'Error al parsear respuesta de IA' });
    }

    const recurrentesInsertados = [];
    const gastosInsertados = [];

    if (Array.isArray(parsed.recurrentes)) {
      for (const r of parsed.recurrentes) {
        if (!r.monto || !r.descripcion) continue;
        const result = db.prepare(
          `INSERT INTO gastos_recurrentes (user_id, descripcion, monto, moneda, categoria_id, tipo, cuota_actual, cuota_total, mes_referencia)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          req.user.id, r.descripcion, parseFloat(r.monto), r.moneda || 'ARS',
          r.categoria_id || 10, r.tipo || 'cuota',
          r.cuota_actual || null, r.cuota_total || null, r.mes_referencia || null
        );
        recurrentesInsertados.push(db.prepare('SELECT * FROM gastos_recurrentes WHERE id = ?').get(result.lastInsertRowid));
      }
    }

    if (Array.isArray(parsed.gastosUnicos)) {
      for (const gasto of parsed.gastosUnicos) {
        if (!gasto.monto || !gasto.descripcion) continue;
        const result = db.prepare(
          `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'archivo')`
        ).run(
          req.user.id, gasto.descripcion, parseFloat(gasto.monto), gasto.moneda || 'ARS',
          gasto.categoria_id || null, gasto.fecha || new Date().toISOString().split('T')[0],
          gasto.notas || null
        );
        gastosInsertados.push(db.prepare('SELECT * FROM gastos WHERE id = ?').get(result.lastInsertRowid));
      }
    }

    res.json({
      recurrentesInsertados,
      gastosInsertados,
      resumen: parsed.resumen || `${recurrentesInsertados.length} recurrentes, ${gastosInsertados.length} gastos puntuales`,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error upload:', err.message);
    res.status(500).json({ error: 'Error al procesar archivo: ' + err.message });
  }
});

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
