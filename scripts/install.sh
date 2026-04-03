#!/bin/bash
# install.sh — Slidr on Debian 12/13 (VPS) with Apache
# Usage: sudo bash install.sh <your-domain.com>

set -euo pipefail

DOMAIN="${1:?Usage: sudo bash install.sh <domain>}"
APP_DIR="/opt/slidr"
OUTPUT_DIR="/var/www/slidr/outputs"
SERVICE_NAME="slidr"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║       Slidr Installer            ║"
echo "  ║  URL → Annotated Tutorial Slides  ║"
echo "  ╚══════════════════════════════════╝"
echo ""
echo "  Domain: $DOMAIN"
echo ""

# Must be root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo bash install.sh $DOMAIN)"
  exit 1
fi

# === System update ===
echo "[1/8] Updating system packages..."
apt update -qq && apt upgrade -y -qq

# === Core packages ===
echo "[2/8] Installing core packages..."
apt install -y -qq curl wget git apache2 ufw fail2ban > /dev/null

# Firewall
ufw allow OpenSSH > /dev/null 2>&1
ufw allow 'WWW Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

# === Node.js 20 LTS ===
echo "[3/8] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt install -y -qq nodejs > /dev/null
fi
echo "  Node.js $(node -v)"

# === Chromium for Puppeteer ===
echo "[4/8] Installing Chromium..."
apt install -y -qq chromium chromium-sandbox fonts-liberation \
  fonts-noto-color-emoji fonts-noto-cjk libatk1.0-0 \
  libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libnss3 libxss1 libasound2 \
  2>/dev/null || true

# === Project files ===
echo "[5/8] Setting up application..."
mkdir -p "$APP_DIR" "$OUTPUT_DIR"

# Copy project files (if running from project root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$PROJECT_DIR/server.js" ]; then
  cp "$PROJECT_DIR"/server.js "$APP_DIR/"
  cp "$PROJECT_DIR"/package.json "$APP_DIR/"
  cp "$PROJECT_DIR"/package-lock.json "$APP_DIR/" 2>/dev/null || true
  cp -r "$PROJECT_DIR"/modules "$APP_DIR/"
  cp -r "$PROJECT_DIR"/templates "$APP_DIR/"
  cp -r "$PROJECT_DIR"/public "$APP_DIR/"
  cp "$PROJECT_DIR"/.env.example "$APP_DIR/" 2>/dev/null || true
  mkdir -p "$APP_DIR/scripts"
  cp "$PROJECT_DIR"/scripts/cleanup.sh "$APP_DIR/scripts/" 2>/dev/null || true
fi

# Install npm dependencies
cd "$APP_DIR"
npm install --production --quiet 2>/dev/null

# === Environment file (empty — triggers Setup Wizard) ===
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << 'ENVEOF'
PORT=3000
ANTHROPIC_API_KEY=
SCREENSHOTONE_API_KEY=
STEEL_API_KEY=
SERPAPI_KEY=
OUTPUT_DIR=/var/www/slidr/outputs
NODE_ENV=production
MOCK_AGENT=false
AUTH_USER=
AUTH_PASS=
ENVEOF
  echo "  .env created (Setup Wizard will run on first visit)"
else
  echo "  .env already exists — keeping current configuration"
fi

# === Apache ===
echo "[6/8] Configuring Apache..."
a2enmod proxy proxy_http proxy_wstunnel headers rewrite > /dev/null 2>&1
a2dissite 000-default > /dev/null 2>&1 || true

cat > /etc/apache2/sites-available/${SERVICE_NAME}.conf << APACHEEOF
<VirtualHost *:80>
    ServerName ${DOMAIN}

    # Proxy to Node.js
    ProxyPreserveHost On
    ProxyPass /outputs/ !
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    # SSE support
    ProxyTimeout 300
    SetEnv proxy-nokeepalive 1
    SetEnv force-proxy-request-1.0 0
    SetEnv proxy-sendchunked 1

    # Serve static outputs directly via Apache
    Alias /outputs/ ${OUTPUT_DIR}/
    <Directory ${OUTPUT_DIR}/>
        Options -Indexes
        AllowOverride None
        Require all granted
        ExpiresActive On
        ExpiresDefault "access plus 24 hours"
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${SERVICE_NAME}-error.log
    CustomLog \${APACHE_LOG_DIR}/${SERVICE_NAME}-access.log combined
</VirtualHost>
APACHEEOF

a2ensite ${SERVICE_NAME} > /dev/null 2>&1
apache2ctl configtest > /dev/null 2>&1 && systemctl restart apache2

# === Systemd service ===
echo "[7/8] Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << SVCEOF
[Unit]
Description=Slidr - URL to Annotated Tutorial Slides
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
EnvironmentFile=${APP_DIR}/.env
Environment=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

[Install]
WantedBy=multi-user.target
SVCEOF

# Set ownership
chown -R root:root "$APP_DIR" "$OUTPUT_DIR"

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} > /dev/null 2>&1
systemctl start ${SERVICE_NAME}

# Cleanup cron (every 6 hours)
if command -v crontab &> /dev/null; then
  echo "0 */6 * * * /bin/bash ${APP_DIR}/scripts/cleanup.sh 2>/dev/null" | crontab -u root -
else
  apt install -y -qq cron > /dev/null 2>&1 || true
  echo "0 */6 * * * /bin/bash ${APP_DIR}/scripts/cleanup.sh 2>/dev/null" | crontab -u root - 2>/dev/null || true
fi

# === SSL (optional) ===
echo ""
echo "[8/8] SSL Setup"
read -p "  Set up HTTPS with Let's Encrypt? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  apt install -y -qq certbot python3-certbot-apache > /dev/null
  certbot --apache -d "$DOMAIN" --non-interactive --agree-tos --redirect -m "admin@$DOMAIN" || {
    echo "  SSL setup failed. You can retry later: certbot --apache -d $DOMAIN"
  }
  echo "  SSL configured!"
fi

# === Done ===
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║          Installation complete!          ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Open your browser:                      ║"
echo "  ║  http://${DOMAIN}                        ║"
echo "  ║                                          ║"
echo "  ║  The Setup Wizard will guide you         ║"
echo "  ║  through API key configuration.          ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Useful commands:                        ║"
echo "  ║  Logs:    journalctl -u ${SERVICE_NAME} -f   ║"
echo "  ║  Status:  systemctl status ${SERVICE_NAME}    ║"
echo "  ║  Restart: systemctl restart ${SERVICE_NAME}   ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
