/**
 * Setup Wizard — First-launch configuration.
 * When ANTHROPIC_API_KEY is missing, shows a web form to collect API keys and credentials.
 * After validation, writes .env and restarts the process (systemd picks it back up).
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/**
 * Check if setup is needed (no Anthropic key configured).
 */
function needsSetup() {
  const key = process.env.ANTHROPIC_API_KEY;
  return !key || key === '' || key === 'sk-ant-...';
}

/**
 * Build the wizard HTML page.
 */
function wizardHtml(error = '', values = {}) {
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  const v = (name) => values[name] || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Setup - Slidr</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #FAFAFA;
  --surface: #FFFFFF;
  --border: #E4E4E7;
  --text: #09090B;
  --text-muted: #71717A;
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
  padding: 24px;
}
.wizard-box {
  width: 100%;
  max-width: 480px;
}
.logo {
  font-size: 28px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
  color: var(--accent);
}
.logo .fade-r { opacity: 0.6; }
.logo .fade-r2 { opacity: 0.35; }
.logo .fade-r3 { opacity: 0.18; }
.logo .fade-r4 { opacity: 0.08; }
.wizard-subtitle {
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 36px;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 14px;
  margin-top: 28px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.section-title:first-of-type { margin-top: 0; }
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 5px;
}
.form-group label .required {
  color: var(--accent);
  font-size: 11px;
  font-weight: 400;
}
.form-group label .optional {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
}
.form-group input {
  width: 100%;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.form-group input:focus { border-color: var(--accent); }
.form-group input::placeholder { color: #A1A1AA; }
.form-group .hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
.form-group .hint a { color: var(--accent); text-decoration: none; }
.form-group .hint a:hover { text-decoration: underline; }
.btn-setup {
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
  margin-top: 24px;
  transition: opacity 0.2s;
}
.btn-setup:hover { opacity: 0.9; }
.btn-setup:disabled { opacity: 0.5; cursor: wait; }
.error {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(220, 53, 69, 0.08);
  border: 1px solid rgba(220, 53, 69, 0.25);
  border-radius: var(--radius);
  color: #DC3545;
  font-size: 13px;
  text-align: center;
}
.success-box {
  text-align: center;
  padding: 48px 24px;
}
.success-box h2 { font-size: 20px; margin-bottom: 12px; }
.success-box p { color: var(--text-muted); font-size: 14px; }
.spinner-inline {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2.5px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="wizard-box">
  <div class="logo">Slidr<span class="fade-r">r</span><span class="fade-r2">r</span><span class="fade-r3">r</span><span class="fade-r4">r</span></div>
  <p class="wizard-subtitle">First-time setup — configure your API keys</p>
  ${errorHtml}
  <form method="POST" action="/setup" id="setupForm">
    <div class="section-title">API Keys</div>
    <div class="form-group">
      <label>Anthropic API Key <span class="required">required</span></label>
      <input type="password" name="anthropic_key" placeholder="sk-ant-api03-..." value="${v('anthropic_key')}" required>
      <div class="hint">Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a></div>
    </div>
    <div class="form-group">
      <label>Steel API Key <span class="required">required</span></label>
      <input type="text" name="steel_key" placeholder="ste-..." value="${v('steel_key')}" required>
      <div class="hint">Get your key at <a href="https://app.steel.dev/settings/api-keys" target="_blank">steel.dev</a> — used for web scraping + DOM annotations</div>
    </div>
    <div class="form-group">
      <label>ScreenshotOne API Key <span class="required">required</span></label>
      <input type="text" name="screenshotone_key" placeholder="Your access key" value="${v('screenshotone_key')}" required>
      <div class="hint">Get your key at <a href="https://screenshotone.com/dashboard" target="_blank">screenshotone.com</a> — used for screenshot capture</div>
    </div>
    <div class="form-group">
      <label>SerpAPI Key <span class="optional">optional</span></label>
      <input type="text" name="serpapi_key" placeholder="Leave empty to skip" value="${v('serpapi_key')}">
      <div class="hint">For Google Image search. Get at <a href="https://serpapi.com/manage-api-key" target="_blank">serpapi.com</a></div>
    </div>

    <div class="section-title">Login Credentials</div>
    <div class="form-group">
      <label>Username <span class="required">required</span></label>
      <input type="text" name="username" placeholder="admin" value="${v('username')}" required autocomplete="username">
    </div>
    <div class="form-group">
      <label>Password <span class="required">required</span></label>
      <input type="password" name="password" placeholder="Choose a strong password" required autocomplete="new-password">
    </div>

    <button type="submit" class="btn-setup" id="btnSetup">Validate & Save</button>
  </form>
  <script>
    document.getElementById('setupForm').addEventListener('submit', function() {
      const btn = document.getElementById('btnSetup');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-inline"></span> Validating API key...';
    });
  </script>
</div>
</body>
</html>`;
}

/**
 * Success page shown after .env is written. Auto-redirects to /login after 6 seconds.
 */
function successHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="6;url=/login">
<title>Setup Complete - Slidr</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root { --bg: #FAFAFA; --text: #09090B; --text-muted: #71717A; --accent: #D97757; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.success-box { text-align: center; padding: 48px 24px; }
.success-box .check { font-size: 48px; margin-bottom: 16px; }
.success-box h2 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
.success-box p { color: var(--text-muted); font-size: 14px; line-height: 1.6; }
.spinner-inline { display: inline-block; width: 14px; height: 14px; border: 2px solid #E4E4E7; border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 4px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="success-box">
  <div class="check">&#10003;</div>
  <h2>Configuration saved</h2>
  <p><span class="spinner-inline"></span> Restarting server... you'll be redirected to login in a few seconds.</p>
</div>
</body>
</html>`;
}

// === ROUTES ===

router.get('/setup', (req, res) => {
  if (!needsSetup()) return res.redirect('/');
  res.type('html').send(wizardHtml());
});

router.post('/setup', async (req, res) => {
  if (!needsSetup()) return res.redirect('/');

  const { anthropic_key, steel_key, screenshotone_key, serpapi_key, username, password } = req.body;

  // Validate required fields
  if (!anthropic_key || !steel_key || !screenshotone_key || !username || !password) {
    return res.type('html').send(wizardHtml('All required fields must be filled.', req.body));
  }

  // Validate Anthropic key with a test call
  try {
    await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }, {
      headers: {
        'x-api-key': anthropic_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 10000,
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      return res.type('html').send(wizardHtml('Invalid Anthropic API key. Please check and try again.', req.body));
    }
    if (status === 403) {
      return res.type('html').send(wizardHtml('Anthropic API key is valid but access is forbidden. Check your account permissions.', req.body));
    }
    // Network errors or other issues — key might still be valid
    if (!err.response) {
      return res.type('html').send(wizardHtml(`Could not reach Anthropic API: ${err.message}. Check your network.`, req.body));
    }
    // Other status codes (429 rate limit, etc.) — key is probably valid
  }

  // Build .env content
  const outputDir = process.env.OUTPUT_DIR || './outputs';
  const envContent = `PORT=${process.env.PORT || 3000}
ANTHROPIC_API_KEY=${anthropic_key}
SCREENSHOTONE_API_KEY=${screenshotone_key}
STEEL_API_KEY=${steel_key}
SERPAPI_KEY=${serpapi_key || ''}
OUTPUT_DIR=${outputDir}
NODE_ENV=production
MOCK_AGENT=false
AUTH_USER=${username}
AUTH_PASS=${password}
`;

  // Write .env
  const envPath = path.join(__dirname, '..', '.env');
  try {
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('[SETUP] .env written successfully');
  } catch (err) {
    return res.type('html').send(wizardHtml(`Failed to write configuration: ${err.message}`, req.body));
  }

  // Send success page
  res.type('html').send(successHtml());

  // Restart after a short delay (let the response flush)
  setTimeout(() => {
    console.log('[SETUP] Configuration complete — restarting process');
    process.exit(0);
  }, 1000);
});

module.exports = { router, needsSetup };
