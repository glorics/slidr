require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { renderTemplate, closeBrowser } = require('./modules/renderer');
const { generateCarousel } = require('./modules/pipeline');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

// === AUTH ===
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASS = process.env.AUTH_PASS || '';
const AUTH_ENABLED = AUTH_USER && AUTH_PASS;
// Secret for signing tokens — derived from password so no extra env var needed
const AUTH_SECRET = AUTH_ENABLED
  ? crypto.createHash('sha256').update(`autocarousel:${AUTH_PASS}`).digest('hex')
  : '';

function makeToken(user) {
  const payload = `${user}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return false;
  const payload = Buffer.from(b64, 'base64').toString();
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

// Login page HTML
function loginPageHtml(error = '') {
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login - AutoCarousel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0A0A0A;
  --surface: #141414;
  --border: #2A2A2A;
  --text: #FFFFFF;
  --text-muted: #888888;
  --accent: #D97757;
  --radius: 12px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-box {
  width: 100%;
  max-width: 380px;
  padding: 24px;
}
.logo {
  font-size: 24px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 40px;
  letter-spacing: -0.02em;
}
.logo span { color: var(--accent); }
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.form-group input {
  width: 100%;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.form-group input:focus { border-color: var(--accent); }
.btn-login {
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius);
  font-size: 15px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 0.2s;
}
.btn-login:hover { opacity: 0.9; }
.error {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: var(--radius);
  color: #FF6B7A;
  font-size: 13px;
  text-align: center;
}
</style>
</head>
<body>
<div class="login-box">
  <div class="logo">Auto<span>Carousel</span></div>
  ${errorHtml}
  <form method="POST" action="/login">
    <div class="form-group">
      <label>Username</label>
      <input type="text" name="username" autocomplete="username" autofocus required>
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required>
    </div>
    <button type="submit" class="btn-login">Sign in</button>
  </form>
</div>
</body>
</html>`;
}

// Auth routes (only if auth is enabled)
if (AUTH_ENABLED) {
  app.get('/login', (req, res) => {
    // If already authenticated, redirect to app
    const cookies = parseCookies(req);
    if (verifyToken(cookies.auth)) return res.redirect('/');
    res.type('html').send(loginPageHtml());
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === AUTH_USER && password === AUTH_PASS) {
      const token = makeToken(username);
      res.setHeader('Set-Cookie', `auth=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
      return res.redirect('/');
    }
    res.status(401).type('html').send(loginPageHtml('Invalid username or password'));
  });

  app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'auth=; HttpOnly; Path=/; Max-Age=0');
    res.redirect('/login');
  });
}

// Health check (always public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware — protect everything below this point
if (AUTH_ENABLED) {
  app.use((req, res, next) => {
    const cookies = parseCookies(req);
    if (verifyToken(cookies.auth)) return next();
    // API calls get 401, browsers get redirect
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/login');
    }
    res.status(401).json({ error: 'Authentication required' });
  });
  console.log(`Auth enabled for user "${AUTH_USER}"`);
} else {
  console.log('Auth disabled (set AUTH_USER and AUTH_PASS in .env to enable)');
}

// Static files (protected)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Render a template to PNG (dev/test)
app.get('/render/:template', async (req, res) => {
  const { template } = req.params;
  const format = req.query.format || '4:5';
  try {
    const png = await renderTemplate(template, {}, format);
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === MAIN ENDPOINT: Generate carousel ===
app.post('/generate', async (req, res) => {
  const { url, format = '4:5', max_slides = 7, language = 'en', accent_color, bg_color, text_color } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // SSE setup
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await generateCarousel(url, {
      format,
      maxSlides: max_slides,
      language,
      accentColor: accent_color || process.env.ACCENT_COLOR || '#D97757',
      bgColor: bg_color || '#0D0D0D',
      textColor: text_color || '#FFFFFF',
      onStatus: (status) => sendEvent('status', status),
    });

    sendEvent('complete', result);
  } catch (err) {
    sendEvent('error', { message: err.message });
  } finally {
    res.end();
  }
});

// === ZIP DOWNLOAD ===
app.get('/download/:jobId', (req, res) => {
  const { jobId } = req.params;

  // Validate jobId format to prevent path traversal
  if (!/^job_\d+_[a-z0-9]+$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID' });
  }

  const jobDir = path.join(process.env.OUTPUT_DIR || './outputs', jobId);

  if (!fs.existsSync(jobDir)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const pngFiles = fs.readdirSync(jobDir).filter(f => f.endsWith('.png')).sort();
  if (pngFiles.length === 0) {
    return res.status(404).json({ error: 'No slides found' });
  }

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${jobId}.zip"`,
  });

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const file of pngFiles) {
    archive.file(path.join(jobDir, file), { name: file });
  }

  archive.finalize();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`AutoCarousel server: http://localhost:${PORT}`);
});
