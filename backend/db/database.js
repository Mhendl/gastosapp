const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'gastos.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Migraciones idempotentes (agregan columnas nuevas a tablas existentes) ──
function hasColumn(table, col) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === col);
}
function addColumn(table, col, type) {
  if (!hasColumn(table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    console.log(`Migración: ${table}.${col} agregada`);
  }
}
// Mes de cierre del resumen de tarjeta (YYYY-MM). Cuando viene de archivo, agrupa por este mes en vez de por fecha.
addColumn('gastos', 'mes_cierre', 'TEXT');
// Código de comprobante para deduplicar al re-subir resúmenes con solape
addColumn('gastos', 'comprobante', 'TEXT');
addColumn('gastos_recurrentes', 'comprobante', 'TEXT');

// Índices útiles
db.exec(`CREATE INDEX IF NOT EXISTS idx_gastos_user_mescierre ON gastos(user_id, mes_cierre)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_gastos_user_comprob ON gastos(user_id, comprobante)`);

// Crear admin por defecto si no existe
const adminExists = db.prepare('SELECT id FROM users WHERE rol = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@gastos.com';
  db.prepare(
    'INSERT INTO users (nombre, email, password, rol) VALUES (?, ?, ?, ?)'
  ).run('Administrador', adminEmail, hash, 'admin');
  console.log(`Admin creado: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
}

module.exports = db;
