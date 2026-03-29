#!/bin/bash
# install.sh — AutoCarousel on Debian 13 (Hostinger VPS) with Apache
# Usage: sudo bash install.sh

set -e

echo "=== AutoCarousel Installer ==="
echo "Target: Debian 13 + Apache + Node.js 20"
echo ""

# System update
apt update && apt upgrade -y
apt install -y curl wget git apache2 ufw fail2ban

# Firewall
ufw allow OpenSSH
ufw allow 'WWW Full'
ufw --force enable

# Node.js 20 LTS
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "Node.js $(node -v)"

# Chromium dependencies for Puppeteer
apt install -y chromium chromium-sandbox fonts-liberation \
  fonts-noto-color-emoji fonts-noto-cjk libatk1.0-0 \
  libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libnss3 libxss1 libasound2 \
  2>/dev/null || true

# Project directory
APP_DIR="/opt/autocarousel"
OUTPUT_DIR="/var/www/autocarousel/outputs"
mkdir -p "$APP_DIR" "$OUTPUT_DIR"

# Copy project files (if running from project root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$PROJECT_DIR/server.js" ]; then
  echo "Copying project files to $APP_DIR..."
  cp -r "$PROJECT_DIR"/server.js "$APP_DIR/"
  cp -r "$PROJECT_DIR"/package.json "$APP_DIR/"
  cp -r "$PROJECT_DIR"/modules "$APP_DIR/"
  cp -r "$PROJECT_DIR"/templates "$APP_DIR/"
  cp -r "$PROJECT_DIR"/public "$APP_DIR/"
  [ -d "$PROJECT_DIR/assets" ] && cp -r "$PROJECT_DIR"/assets "$APP_DIR/"
fi

# Install npm dependencies
cd "$APP_DIR"
npm install --production

# Environment file (only create if not exists)
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << 'ENVEOF'
PORT=3000
ANTHROPIC_API_KEY=sk-ant-...
SCREENSHOTONE_API_KEY=
SERPAPI_KEY=
OUTPUT_DIR=/var/www/autocarousel/outputs
NODE_ENV=production
MOCK_AGENT=false
ENVEOF
  echo "Created .env — edit it with your API keys: nano $APP_DIR/.env"
fi

# Apache modules
a2enmod proxy proxy_http proxy_wstunnel headers rewrite
a2dissite 000-default 2>/dev/null || true

# Apache virtual host
cat > /etc/apache2/sites-available/autocarousel.conf << 'APACHEEOF'
<VirtualHost *:80>
    ServerName autocarousel.glorics.com

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
    Alias /outputs/ /var/www/autocarousel/outputs/
    <Directory /var/www/autocarousel/outputs/>
        Options -Indexes
        AllowOverride None
        Require all granted
        ExpiresActive On
        ExpiresDefault "access plus 24 hours"
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/autocarousel-error.log
    CustomLog ${APACHE_LOG_DIR}/autocarousel-access.log combined
</VirtualHost>
APACHEEOF

a2ensite autocarousel
apache2ctl configtest && systemctl restart apache2

# Systemd service
cat > /etc/systemd/system/autocarousel.service << 'SVCEOF'
[Unit]
Description=AutoCarousel - URL to Annotated Tutorial Images
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/autocarousel
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/autocarousel/.env
Environment=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

[Install]
WantedBy=multi-user.target
SVCEOF

# Set ownership
chown -R www-data:www-data "$APP_DIR" "$OUTPUT_DIR"

systemctl daemon-reload
systemctl enable autocarousel
systemctl start autocarousel

# Install cleanup cron
cp "$(dirname "$0")/cleanup.sh" /opt/autocarousel/scripts/cleanup.sh 2>/dev/null || true
echo "0 */6 * * * /bin/bash /opt/autocarousel/scripts/cleanup.sh 2>/dev/null" | crontab -u root -

echo ""
echo "=== Installation complete ==="
echo "App:    http://autocarousel.glorics.com"
echo "Health: http://autocarousel.glorics.com/health"
echo "Config: nano $APP_DIR/.env"
echo "Logs:   journalctl -u autocarousel -f"
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys"
echo "2. systemctl restart autocarousel"
echo "3. Set up DNS A record for autocarousel.glorics.com"
