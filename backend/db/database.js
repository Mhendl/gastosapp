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
