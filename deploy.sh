#!/bin/bash
# Script de deploy - ejecutar en el VPS como root
set -e

APP_DIR="/var/www/gastosapp"
REPO="https://github.com/Mhendl/gastosapp.git"
DOMAIN="gastosapp.prexacode.com"
LOG_DIR="/var/log/gastosapp"

echo "==> Instalando dependencias del sistema..."
apt-get update -qq
apt-get install -y -qq git nginx curl

# Instalar Node.js 22 (LTS)
if ! command -v node &> /dev/null; then
    echo "==> Instalando Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

# Instalar PM2
if ! command -v pm2 &> /dev/null; then
    echo "==> Instalando PM2..."
    npm install -g pm2
fi

echo "==> Clonando/actualizando repositorio..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull
else
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

echo "==> Instalando dependencias del backend..."
cd "$APP_DIR/backend"
npm install --production

echo "==> Buildeando frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build

echo "==> Configurando nginx..."
cp "$APP_DIR/nginx.conf" "/etc/nginx/sites-available/gastosapp"
ln -sf /etc/nginx/sites-available/gastosapp /etc/nginx/sites-enabled/gastosapp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Configurando directorio de logs..."
mkdir -p "$LOG_DIR"

echo "==> Iniciando/reiniciando backend con PM2..."
cd "$APP_DIR"
pm2 delete gastosapp-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

echo "==> Instalando SSL con Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@prexacode.com --redirect || echo "SSL: verificar DNS apuntando al servidor"

echo ""
echo "=========================================="
echo "Deploy completado!"
echo "App disponible en: https://$DOMAIN"
echo "Admin: admin@gastos.com / admin123"
echo "IMPORTANTE: Cambiar contraseña del admin!"
echo "=========================================="
