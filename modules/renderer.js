const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const FORMATS = {
  '3:4':  { width: 1080, height: 1440 },
  '4:5':  { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
};

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

/**
 * Render a template HTML string to a PNG buffer.
 * @param {string} html - Full HTML content to render
 * @param {string} format - "3:4" | "4:5" | "9:16"
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function renderHtmlToPng(html, format = '4:5') {
  const dim = FORMATS[format] || FORMATS['4:5'];
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: dim.width, height: dim.height, deviceScaleFactor: 1 });

    // Strip the preview wrapper styles so the slide fills the viewport
    const cleanedHtml = html
      .replace(/html\s*\{[^}]*background:\s*#333[^}]*\}/g, 'html { margin: 0; }')
      .replace(/body\s*\{[^}]*background:\s*#333[^}]*\}/g, 'body { margin: 0; padding: 0; display: block; }');

    await page.setContent(cleanedHtml, { waitUntil: 'networkidle0', timeout: 15000 });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: dim.width, height: dim.height },
    });

    return Buffer.from(png);
  } finally {
    await page.close();
  }
}

/**
 * Render a template file with variable replacement.
 * @param {string} templateName - "step" | "resource" | "cover"
 * @param {object} data - Template variables to inject
 * @param {string} format - "3:4" | "4:5" | "9:16"
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function renderTemplate(templateName, data = {}, format = '4:5') {
  const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Update slide dimensions for the requested format
  const dim = FORMATS[format] || FORMATS['4:5'];
  html = html.replace(/--slide-w:\s*\d+px/, `--slide-w: ${dim.width}px`);
  html = html.replace(/--slide-h:\s*\d+px/, `--slide-h: ${dim.height}px`);

  // Inject custom colors if provided
  if (data.accent_color) {
    html = html.replace(/--accent:\s*#[0-9A-Fa-f]{6}/, `--accent: ${data.accent_color}`);
  }
  if (data.bg_color) {
    html = html.replace(/--bg:\s*#[0-9A-Fa-f]{6}/, `--bg: ${data.bg_color}`);
  }
  if (data.text_color) {
    html = html.replace(/--text:\s*#[0-9A-Fa-f]{6}/, `--text: ${data.text_color}`);
  }

  // Replace template variables {{key}}
  // Use a function replacement to avoid special $ interpretation in String.replace()
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), () => value);
  }

  // Remove any unreplaced {{variables}}
  html = html.replace(/\{\{[a-z_]+\}\}/g, '');

  return renderHtmlToPng(html, format);
}

/**
 * Render multiple slides and save them to disk.
 * @param {Array} slides - Array of { templateName, data }
 * @param {string} outputDir - Directory to save PNGs
 * @param {string} format - "3:4" | "4:5" | "9:16"
 * @returns {Promise<string[]>} Array of output file paths
 */
async function renderSlides(slides, outputDir, format = '4:5') {
  fs.mkdirSync(outputDir, { recursive: true });

  const paths = [];
  for (let i = 0; i < slides.length; i++) {
    const { templateName, data } = slides[i];
    const png = await renderTemplate(templateName, data, format);
    const filename = `slide_${String(i + 1).padStart(2, '0')}.png`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, png);
    paths.push(filepath);
  }

  return paths;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { renderHtmlToPng, renderTemplate, renderSlides, closeBrowser, FORMATS };
