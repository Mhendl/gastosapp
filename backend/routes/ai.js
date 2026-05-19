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

Cuando el usuario mencione un gasto, extraé la información y respondé con JSON en este formato EXACTO (sin texto adicional antes o después del JSON, solo el JSON):
{
  "accion": "registrar_gastos",
  "gastos": [
    {
      "descripcion": "descripción clara del gasto",
      "monto": 1500.00,
      "moneda": "ARS",
      "categoria_id": 1,
      "fecha": "2026-05-19",
      "notas": "nota opcional"
    }
  ],
  "mensaje": "Mensaje amigable confirmando lo registrado"
}

Cuando el usuario pregunte por sus gastos, resúmenes o estadísticas, respondé con:
{
  "accion": "consulta",
  "mensaje": "Tu respuesta aquí con la información solicitada"
}

Cuando el usuario haga preguntas generales que no son sobre gastos, respondé con:
{
  "accion": "consulta",
  "mensaje": "Tu respuesta aquí"
}

REGLAS:
- La moneda por defecto es ARS (pesos argentinos). Si mencionan dólares, USD, u$s o US$, usá "USD".
- Si no se menciona fecha, usá la fecha de hoy: ${new Date().toISOString().split('T')[0]}
- Detectá automáticamente la categoría más apropiada según la descripción
- Si hay múltiples gastos en un mensaje, incluílos todos en el array "gastos"
- Siempre respondé en español rioplatense (vos, sos, etc.)
- Los montos siempre deben ser números positivos`;

// Chat con IA
router.post('/chat', async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

  // Historial reciente (últimos 10 mensajes)
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
      max_tokens: 1500
    });

    const respuestaRaw = completion.choices[0].message.content;

    // Guardar en historial
    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'user', mensaje);
    db.prepare('INSERT INTO chat_mensajes (user_id, rol, contenido) VALUES (?, ?, ?)').run(req.user.id, 'assistant', respuestaRaw);

    let parsedResponse;
    try {
      const jsonMatch = respuestaRaw.match(/\{[\s\S]*\}/);
      parsedResponse = JSON.parse(jsonMatch ? jsonMatch[0] : respuestaRaw);
    } catch {
      parsedResponse = { accion: 'consulta', mensaje: respuestaRaw };
    }

    // Si hay gastos para registrar, insertarlos
    const gastosRegistrados = [];
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

    res.json({
      mensaje: parsedResponse.mensaje || respuestaRaw,
      accion: parsedResponse.accion,
      gastosRegistrados
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
      // Usar vision de OpenAI para imágenes
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64 = imageBuffer.toString('base64');

      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extraé todo el texto de esta imagen de resumen de tarjeta o ticket de gastos. Devolvé solo el texto extraído.' },
            { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${base64}` } }
          ]
        }],
        max_tokens: 2000
      });
      textoExtraido = visionResponse.choices[0].message.content;
    } else if (req.file.mimetype === 'text/plain') {
      textoExtraido = fs.readFileSync(req.file.path, 'utf8');
    }

    // Limpiar archivo temporal
    fs.unlinkSync(req.file.path);

    if (!textoExtraido.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto del archivo' });
    }

    // Analizar gastos con GPT-4o
    const prompt = `Analizá este resumen de tarjeta/ticket y extraé TODOS los gastos como JSON:

${textoExtraido.slice(0, 8000)}

Respondé SOLO con JSON en este formato:
{
  "gastos": [
    {
      "descripcion": "descripción del comercio/gasto",
      "monto": 1500.00,
      "moneda": "ARS",
      "categoria_id": 10,
      "fecha": "2026-05-15",
      "notas": "cuota 1/3 o nota relevante"
    }
  ],
  "resumen": "Resumen breve: X gastos, total aproximado"
}

CATEGORÍAS: ${categoriasStr}
Para gastos de tarjeta de crédito usá categoria_id=10.
La moneda es ARS a menos que sea obvio que es USD.`;

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

    // Insertar gastos extraídos
    const gastosInsertados = [];
    if (Array.isArray(parsed.gastos)) {
      for (const gasto of parsed.gastos) {
        if (!gasto.monto || !gasto.descripcion) continue;
        const result = db.prepare(
          `INSERT INTO gastos (user_id, descripcion, monto, moneda, categoria_id, fecha, notas, origen)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'archivo')`
        ).run(
          req.user.id,
          gasto.descripcion,
          parseFloat(gasto.monto),
          gasto.moneda || 'ARS',
          gasto.categoria_id || 10,
          gasto.fecha || new Date().toISOString().split('T')[0],
          gasto.notas || null
        );
        const g = db.prepare(
          `SELECT g.*, c.nombre as categoria_nombre, c.icono as categoria_icono
           FROM gastos g LEFT JOIN categorias c ON c.id = g.categoria_id WHERE g.id = ?`
        ).get(result.lastInsertRowid);
        gastosInsertados.push(g);
      }
    }

    res.json({
      gastosInsertados,
      resumen: parsed.resumen || `Se encontraron ${gastosInsertados.length} gastos`,
      totalGastos: gastosInsertados.length
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Error upload:', err.message);
    res.status(500).json({ error: 'Error al procesar archivo: ' + err.message });
  }
});

// Obtener historial de chat
router.get('/historial', (req, res) => {
  const mensajes = db.prepare(
    `SELECT rol, contenido, created_at FROM chat_mensajes WHERE user_id = ? ORDER BY created_at ASC LIMIT 100`
  ).all(req.user.id);
  res.json(mensajes);
});

// Limpiar historial de chat
router.delete('/historial', (req, res) => {
  db.prepare('DELETE FROM chat_mensajes WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
