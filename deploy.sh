#!/bin/bash
# Deploy script para gastosapp - ejecutar en el VPS como root
set -e

APP_DIR="/var/www/gastosapp"
REPO="https://github.com/Mhendl/gastosapp.git"
DOMAIN="gastosapp.prexacode.com"
LOG_DIR="/var/log/gastosapp"
CERTBOT_EMAIL="hendl.martin@gmail.com"

echo "================================================"
echo "  Deploy GastosIA -> $DOMAIN"
echo "================================================"

# La clave se pasa como variable de entorno: OPENAI_API_KEY=sk-... bash deploy.sh
# O se puede setear aquí antes de correr el script en el servidor (NO commitear)
if [ -z "$OPENAI_API_KEY" ]; then
    read -s -p "Ingresá tu OpenAI API Key: " OPENAI_API_KEY
    echo ""
fi

JWT_SECRET="gastosapp_$(openssl rand -hex 32)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gastos.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

echo ""
echo "==> [1/8] Instalando dependencias del sistema..."
apt-get update -qq
apt-get install -y -qq git nginx curl openssl

echo ""
echo "==> [2/8] Instalando Node.js 22..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | cut -c2-) -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
echo "Node: $(node --version)"

echo ""
echo "==> [3/8] Instalando PM2..."
npm install -g pm2 2>/dev/null
echo "PM2: $(pm2 --version)"

echo ""
echo "==> [4/8] Clonando/actualizando repositorio..."
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR" && git pull
else
    rm -rf "$APP_DIR"
    git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo ""
echo "==> [5/8] Creando .env del backend..."
mkdir -p "$LOG_DIR"
cat > "$APP_DIR/backend/.env" << ENV
OPENAI_API_KEY=$OPENAI_API_KEY
JWT_SECRET=$JWT_SECRET
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
PORT=3001
FRONTEND_URL=https://$DOMAIN
NODE_ENV=production
ENV
echo ".env creado."

echo ""
echo "==> [6/8] Instalando dependencias y buildeando..."
cd "$APP_DIR/backend" && npm install --production
cd "$APP_DIR/frontend" && npm install && npm run build
echo "Build completado."

echo ""
echo "==> [7/8] Configurando nginx..."
cp "$APP_DIR/nginx.conf" "/etc/nginx/sites-available/gastosapp"
ln -sf /etc/nginx/sites-available/gastosapp /etc/nginx/sites-enabled/gastosapp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl reload nginx

echo ""
echo "==> [7b/8] Instalando SSL con Certbot..."
apt-get install -y -qq certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect \
  && echo "SSL instalado!" \
  || echo "AVISO: Verificar que DNS apunta a este servidor."

echo ""
echo "==> [8/8] Iniciando backend con PM2..."
pm2 delete gastosapp-backend 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || true

echo ""
echo "================================================"
echo "  DEPLOY COMPLETADO!"
echo "  URL: https://$DOMAIN"
echo "  Admin: $ADMIN_EMAIL / $ADMIN_PASSWORD"
echo "  CAMBIAR CONTRASEÑA AL PRIMER LOGIN"
echo "================================================"
pm2 status
