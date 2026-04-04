/**
 * Annotation Compositor — burns annotations directly into screenshot images.
 *
 * Instead of positioning annotations with CSS overlays (which shift due to
 * layout, object-fit, and aspect-ratio mismatches), this module composites
 * annotation graphics directly onto screenshot pixels using Sharp + SVG.
 *
 * Coordinates come from DOM (pixel-perfect) or Vision (estimated), but once
 * applied to the image, they can never shift — they ARE the image.
 */

const sharp = require('sharp');
const fs = require('fs');

// Style constants — defaults matching the carousel design system
const DEFAULT_ACCENT = '#D97757';

/**
 * Convert hex color to rgba string.
 */
function hexToRgba(hex, alpha = 0.3) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Circle: 44px diameter (matching CSS .anno-circle)
const CIRCLE_R = 22;
const CIRCLE_CANVAS = 60; // extra space for glow + shadow
const CIRCLE_CENTER = 30;

// Highlight box
const HL_BORDER = 3;
const HL_RADIUS = 12;
const HL_GLOW = 8; // padding for outer glow

/**
 * Create SVG for a numbered circle annotation.
 */
function createCircleSvg(label, accent = DEFAULT_ACCENT) {
  const accentRgba = hexToRgba(accent, 0.3);
  return Buffer.from(`<svg width="${CIRCLE_CANVAS}" height="${CIRCLE_CANVAS}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ds" x="-30%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <circle cx="${CIRCLE_CENTER}" cy="${CIRCLE_CENTER}" r="${CIRCLE_R + 2}"
          fill="none" stroke="${accentRgba}" stroke-width="2"/>
  <circle cx="${CIRCLE_CENTER}" cy="${CIRCLE_CENTER}" r="${CIRCLE_R}"
          fill="${accent}" stroke="rgba(255,255,255,0.35)" stroke-width="2.5" filter="url(#ds)"/>
  <text x="${CIRCLE_CENTER}" y="${CIRCLE_CENTER}" text-anchor="middle" dy="0.35em"
        font-family="Liberation Sans, Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="white">${label}</text>
</svg>`);
}

/**
 * Create SVG for a highlight box annotation.
 */
function createHighlightSvg(w, h, accent = DEFAULT_ACCENT) {
  const accentRgba = hexToRgba(accent, 0.3);
  const svgW = w + HL_GLOW * 2;
  const svgH = h + HL_GLOW * 2;
  return Buffer.from(`<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${HL_GLOW - 4}" y="${HL_GLOW - 4}" width="${w + 8}" height="${h + 8}"
        fill="none" stroke="${accentRgba}" stroke-width="4" rx="${HL_RADIUS + 2}"/>
  <rect x="${HL_GLOW}" y="${HL_GLOW}" width="${w}" height="${h}"
        fill="none" stroke="${accent}" stroke-width="${HL_BORDER}" rx="${HL_RADIUS}"/>
</svg>`);
}

/**
 * Composite annotations directly onto a screenshot image.
 * Produces pixel-perfect results — no CSS positioning needed.
 *
 * @param {string} screenshotPath - Path to the processed screenshot PNG
 * @param {Array} annotations - Annotations with x_percent, y_percent, etc.
 * @param {string} outputPath - Where to save the annotated image
 * @returns {Promise<string>} Output file path
 */
async function compositeAnnotations(screenshotPath, annotations, outputPath, accentColor = DEFAULT_ACCENT) {
  const valid = (annotations || []).filter(a => !a._notFound);
  if (valid.length === 0) {
    fs.copyFileSync(screenshotPath, outputPath);
    return outputPath;
  }

  const meta = await sharp(screenshotPath).metadata();
  const imgW = meta.width;
  const imgH = meta.height;
  const composites = [];

  // 1. Highlight boxes (z-index 5 — behind circles)
  for (const hl of valid.filter(a => a.type === 'highlight_box')) {
    const w = Math.round(((hl.width_percent || 15) / 100) * imgW);
    const h = Math.round(((hl.height_percent || 8) / 100) * imgH);
    const cx = Math.round((hl.x_percent / 100) * imgW);
    const cy = Math.round((hl.y_percent / 100) * imgH);

    const svg = createHighlightSvg(w, h, accentColor);
    composites.push({
      input: svg,
      left: Math.max(0, Math.round(cx - w / 2 - HL_GLOW)),
      top: Math.max(0, Math.round(cy - h / 2 - HL_GLOW)),
    });
  }

  // 2. Numbered circles (z-index 10 — on top of everything)
  // Safety margin: clamp to 5%-95% of image to avoid annotations being cropped
  const MARGIN_PX_X = Math.round(imgW * 0.05);
  const MARGIN_PX_Y = Math.round(imgH * 0.05);
  for (const circle of valid.filter(a => a.type === 'circle_number')) {
    const cx = Math.round((circle.x_percent / 100) * imgW);
    const cy = Math.round((circle.y_percent / 100) * imgH);
    const svg = createCircleSvg(circle.label, accentColor);

    composites.push({
      input: svg,
      left: Math.max(MARGIN_PX_X, Math.min(imgW - CIRCLE_CANVAS - MARGIN_PX_X, cx - CIRCLE_CENTER)),
      top: Math.max(MARGIN_PX_Y, Math.min(imgH - CIRCLE_CANVAS - MARGIN_PX_Y, cy - CIRCLE_CENTER)),
    });
  }

  if (composites.length === 0) {
    fs.copyFileSync(screenshotPath, outputPath);
    return outputPath;
  }

  await sharp(screenshotPath)
    .composite(composites)
    .toFile(outputPath);

  return outputPath;
}

module.exports = { compositeAnnotations };
