const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
 * Check if a URL is a YouTube URL.
 */
function isYouTubeUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  } catch { return false; }
}

/**
 * Extract YouTube video ID from URL.
 */
function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * Capture a screenshot — uses ScreenshotOne API first, Puppeteer as fallback.
 * For YouTube URLs, fetches the HD thumbnail instead.
 *
 * @param {string} url - URL to capture
 * @param {string} outputPath - Where to save the PNG
 * @param {object} options - Capture options
 * @returns {Promise<string>} Output file path
 */
async function captureScreenshot(url, outputPath, options = {}) {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  // Priority 5: Never screenshot YouTube — use thumbnail directly
  if (isYouTubeUrl(url)) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const thumbUrls = [
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      ];
      for (const thumbUrl of thumbUrls) {
        try {
          const { data } = await axios.get(thumbUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
          });
          fs.writeFileSync(outputPath, Buffer.from(data));
          console.log(`YouTube thumbnail captured for ${videoId}`);
          return outputPath;
        } catch {}
      }
    }
    // If thumbnail fails, fall through to regular capture
  }

  // Helper: wrap a capture call with a timeout
  const withTimeout = (fn, ms, label) => Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);

  // Priority 2: Try ScreenshotOne first
  if (process.env.SCREENSHOTONE_API_KEY) {
    try {
      return await withTimeout(() => captureWithScreenshotOne(url, outputPath, options), 35000, 'ScreenshotOne');
    } catch (err) {
      console.log(`ScreenshotOne failed for ${url}: ${err.message}`);
    }
  }

  // Priority 3: Try Steel.dev cloud browser
  if (process.env.STEEL_API_KEY) {
    try {
      return await withTimeout(() => captureWithSteel(url, outputPath, options), 45000, 'Steel.dev');
    } catch (err) {
      console.log(`Steel.dev capture failed for ${url}: ${err.message}`);
    }
  }

  // Fallback: local Puppeteer
  return await withTimeout(() => captureWithPuppeteer(url, outputPath, options), 30000, 'Puppeteer');
}

/**
 * Capture via ScreenshotOne API (handles Cloudflare, cookie banners, JS).
 */
async function captureWithScreenshotOne(url, outputPath, options = {}) {
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOTONE_API_KEY,
    url: url,
    viewport_width: String(options.width || 1080),
    viewport_height: String(options.height || 1080),
    format: 'png',
    full_page: 'false',
    block_cookie_banners: 'true',
    block_ads: 'true',
    block_banners_by_heuristics: 'true',
    delay: '5',
    cache: 'true',
    cache_ttl: '14400',
    scripts: 'document.querySelectorAll("[class*=cookie],[class*=consent],[class*=gdpr],[class*=privacy-banner],[id*=cookie],[id*=onetrust],[id*=CybotCookiebot]").forEach(el=>el.remove())',
    styles: 'video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"] { visibility: hidden !important; background: #F0F0F0 !important; } [class*="cookie"], [class*="consent"], [class*="gdpr"], [class*="CookieBanner"], [id*="cookie"], [id*="onetrust"] { display: none !important; }',
  });

  const response = await axios.get(
    `https://api.screenshotone.com/take?${params}`,
    { responseType: 'arraybuffer', timeout: 30000 }
  );

  const buffer = Buffer.from(response.data);
  if (buffer.length < 5000) {
    throw new Error('ScreenshotOne returned suspiciously small image');
  }
  fs.writeFileSync(outputPath, buffer);
  console.log(`ScreenshotOne captured: ${url}`);
  return outputPath;
}

/**
 * Capture via Steel.dev cloud browser (handles Cloudflare, CAPTCHAs).
 */
async function captureWithSteel(url, outputPath, options = {}) {
  const { width = 1080, height = 1080, fullPage = false } = options;
  const wsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
  let steelBrowser = null;

  try {
    steelBrowser = await Promise.race([
      puppeteer.connect({ browserWSEndpoint: wsUrl }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Steel.dev connect timed out')), 15000)),
    ]);
    const page = await steelBrowser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Dismiss popups and hide videos
    await dismissPopups(page);
    await hideVideoElements(page);

    await page.screenshot({ path: outputPath, type: 'png', fullPage });
    await page.close();

    const stat = fs.statSync(outputPath);
    if (stat.size < 5000) {
      throw new Error('Steel.dev returned suspiciously small image');
    }

    console.log(`Steel.dev captured: ${url}`);
    return outputPath;
  } finally {
    if (steelBrowser) {
      try { steelBrowser.disconnect(); } catch {}
    }
  }
}

/**
 * Capture via local Puppeteer (fallback).
 */
async function captureWithPuppeteer(url, outputPath, options = {}) {
  const {
    width = 1080,
    height = 1080,
    delay = 3000,
    fullPage = false,
  } = options;

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // Set cookies to bypass consent pages (YouTube/Google)
    const domain = new URL(url).hostname;
    if (domain.includes('youtube.com') || domain.includes('google.com')) {
      await page.setCookie({
        name: 'CONSENT',
        value: 'YES+cb.20210720-07-p0.en+FX+410',
        domain: '.youtube.com',
      }, {
        name: 'CONSENT',
        value: 'YES+cb.20210720-07-p0.en+FX+410',
        domain: '.google.com',
      });
    }

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    // Wait for dynamic content
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    // Dismiss cookie banners / popups (best effort) and hide videos
    await dismissPopups(page);
    await hideVideoElements(page);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage,
    });

    return outputPath;
  } finally {
    await page.close();
  }
}

/**
 * Aggressively remove banner/popup/overlay elements from the DOM.
 * Runs page.evaluate to find and remove elements that look like cookie banners,
 * consent dialogs, notification bars, or floating overlays.
 */
async function removeBannerElements(page) {
  try {
    await page.evaluate(() => {
      const bannerKeywords = ['cookie', 'consent', 'gdpr', 'privacy', 'tracking', 'accept all', 'reject all', 'more options'];
      const topBarKeywords = ['preferred language', 'change to english', 'translate', 'see this page'];

      // 1. Remove by selector patterns — unconditionally
      const selectorPatterns = [
        '[class*="cookie" i]', '[class*="consent" i]', '[class*="gdpr" i]',
        '[class*="CookieBanner" i]', '[class*="cookie-banner" i]', '[class*="cookie-notice" i]',
        '[class*="privacy-banner" i]', '[class*="notification-bar" i]',
        '[id*="cookie" i]', '[id*="consent" i]', '[id*="gdpr" i]',
        '[id*="onetrust"]', '[id*="CybotCookiebot"]',
      ];
      for (const sel of selectorPatterns) {
        try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
      }

      // 2. Scan ALL elements for banner-like content (text-based detection)
      const allElements = document.querySelectorAll('div, section, aside, footer, dialog, [role="dialog"], [role="banner"], [role="alertdialog"]');
      allElements.forEach(el => {
        try {
          const text = (el.textContent || '').toLowerCase().substring(0, 500);
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const isOverlay = style.position === 'fixed' || style.position === 'sticky' || parseInt(style.zIndex) > 50;

          // Bottom cookie banners: any wide element in the bottom 30% with cookie keywords
          if (rect.bottom > window.innerHeight * 0.7 && rect.width > window.innerWidth * 0.4 && rect.height < 350) {
            const hasBannerText = bannerKeywords.some(kw => text.includes(kw));
            if (hasBannerText && (isOverlay || rect.height > 80)) {
              el.remove();
              return;
            }
          }

          // Top language/notification bars
          if (rect.top < 60 && rect.width > window.innerWidth * 0.6 && rect.height < 80) {
            const hasTopBarText = topBarKeywords.some(kw => text.includes(kw));
            if (hasTopBarText) {
              el.remove();
              return;
            }
          }

          // Any fixed/sticky overlay with banner keywords
          if (isOverlay && rect.height < 400 && rect.width > window.innerWidth * 0.3) {
            const hasBannerText = bannerKeywords.some(kw => text.includes(kw));
            if (hasBannerText) {
              el.remove();
            }
          }
        } catch {}
      });
    });
    await new Promise(r => setTimeout(r, 300));
  } catch {}
}

/**
 * Hide video/iframe elements that render as black rectangles in screenshots.
 * Uses visibility:hidden to preserve page layout.
 */
async function hideVideoElements(page) {
  try {
    await page.addStyleTag({
      content: `
        video,
        iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"],
        iframe[data-src*="youtube"], iframe[data-src*="vimeo"],
        .video-player, [class*="video-embed"] {
          visibility: hidden !important;
          background: #F0F0F0 !important;
        }
      `,
    });
  } catch {}
}

/**
 * Try to dismiss common cookie banners and popups.
 */
async function dismissPopups(page) {
  const selectors = [
    // YouTube/Google consent
    'button[aria-label="Accept all"]',
    'button[aria-label="Tout accepter"]',
    'form[action*="consent"] button',
    'tp-yt-paper-button.ytd-consent-bump-v2-lightbox',
    // OneTrust (very common)
    '#onetrust-accept-btn-handler',
    '#onetrust-close-btn-container button',
    // CookieBot
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    // TrustArc
    '.truste-consent-button',
    // Generic cookie/consent banners — buttons
    '[class*="cookie"] button[class*="accept"]',
    '[class*="cookie"] button[class*="agree"]',
    '[class*="cookie"] button[class*="close"]',
    '[class*="cookie"] button[class*="Allow"]',
    '[class*="cookie"] button:first-of-type',
    '[id*="cookie"] button',
    '[class*="consent"] button[class*="accept"]',
    '[class*="consent"] button:first-of-type',
    '[class*="CookieBanner"] button',
    '[class*="cookie-banner"] button',
    '[class*="cookie-notice"] button',
    '[class*="cookie-notification"] button',
    '[class*="gdpr"] button',
    '[class*="privacy-banner"] button',
    // Generic accept/dismiss patterns
    'button[data-testid*="accept"]',
    'button[data-testid*="cookie"]',
    'button[aria-label*="Accept"]',
    'button[aria-label*="accept"]',
    'button[aria-label*="close"]',
    'button[aria-label*="dismiss"]',
    'button[aria-label*="Dismiss"]',
    'a[class*="accept"]',
    '.cookie-banner button',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await new Promise(r => setTimeout(r, 300));
      }
    } catch {}
  }

  // Nuclear option: hide any remaining cookie/consent banners via CSS
  try {
    await page.addStyleTag({
      content: `
        [class*="cookie-banner"], [class*="CookieBanner"], [class*="cookie-notice"],
        [class*="cookie-notification"], [class*="cookie-consent"], [class*="CookieConsent"],
        [class*="gdpr"], [class*="consent-banner"], [class*="privacy-banner"],
        [id*="cookie-banner"], [id*="cookie-notice"], [id*="cookie-consent"],
        [id*="onetrust"], [id*="CybotCookiebot"],
        [class*="truste"], [class*="cookie_notice"],
        [role="dialog"][class*="cookie"], [role="dialog"][class*="consent"],
        [aria-label*="cookie" i], [aria-label*="consent" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `,
    });
  } catch {}
  await new Promise(r => setTimeout(r, 300));
}

/**
 * Capture screenshots for all URLs identified by the agent.
 * Deduplicates URLs so we don't capture the same page multiple times,
 * but each slide still gets its own screenshot file.
 *
 * @param {Array} slides - Slides with screenshot_url
 * @param {string} workDir - Working directory for captures
 * @returns {Promise<Map>} Map of slide_number → screenshot path
 */
async function captureAll(slides, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const screenshots = new Map();
  const urlCache = new Map(); // URL → captured file path (avoid duplicate captures)

  // Log URL distribution for debugging
  const urls = slides.filter(s => s.screenshot_url).map(s => s.screenshot_url);
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length < urls.length) {
    console.log(`Warning: ${urls.length} screenshot URLs but only ${uniqueUrls.length} unique. Some slides share the same URL.`);
  }

  for (const slide of slides) {
    if (!slide.screenshot_url) continue;

    const filename = `screenshot_${slide.slide_number}.png`;
    const outputPath = path.join(workDir, filename);

    try {
      // Check if we already captured this exact URL
      const normalizedUrl = slide.screenshot_url.replace(/\/+$/, '').toLowerCase();
      if (urlCache.has(normalizedUrl)) {
        // Copy the already-captured file
        fs.copyFileSync(urlCache.get(normalizedUrl), outputPath);
        screenshots.set(slide.slide_number, outputPath);
        console.log(`Reused cached screenshot for slide ${slide.slide_number}: ${slide.screenshot_url}`);
      } else {
        await captureScreenshot(slide.screenshot_url, outputPath);
        urlCache.set(normalizedUrl, outputPath);
        screenshots.set(slide.slide_number, outputPath);
        console.log(`Captured screenshot for slide ${slide.slide_number}: ${slide.screenshot_url}`);
      }
    } catch (err) {
      console.log(`Screenshot failed for slide ${slide.slide_number} (${slide.screenshot_url}): ${err.message}`);
    }
  }

  return screenshots;
}

/**
 * Enumerate all interactive elements on the page with their exact DOM positions.
 * Returns elements that are visible within the viewport.
 */
async function enumerateInteractiveElements(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const selectors = [
      'a[href]', 'button', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
      '[onclick]', '.btn', '[class*="button"]', '[class*="cta"]',
    ];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        // Skip invisible, tiny, or off-viewport elements
        if (rect.width < 20 || rect.height < 12) return;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        if (rect.right < 0 || rect.left > window.innerWidth) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 80);
        const placeholder = el.placeholder || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const label = text || placeholder || ariaLabel;
        if (!label || label.length < 2) return;

        results.push({
          index: results.length,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          text: label,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      });
    }
    return results;
  });
}

/**
 * Capture screenshot + enumerate interactive elements in one page load.
 * Used by Steel and Puppeteer captures.
 */
async function captureWithElementsSteel(url, outputPath, options = {}) {
  const { width = 1080, height = 1080, fullPage = false } = options;
  const wsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
  let steelBrowser = null;

  try {
    steelBrowser = await Promise.race([
      puppeteer.connect({ browserWSEndpoint: wsUrl }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Steel.dev connect timed out')), 15000)),
    ]);
    const page = await steelBrowser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    await dismissPopups(page);
    await hideVideoElements(page);
    await removeBannerElements(page);

    // Enumerate BEFORE screenshot
    const elements = await enumerateInteractiveElements(page);

    // Wait for any late-rendered popups, then final cleanup before screenshot
    await new Promise(r => setTimeout(r, 1000));
    await dismissPopups(page);
    await removeBannerElements(page);
    await page.screenshot({ path: outputPath, type: 'png', fullPage });
    await page.close();

    const stat = fs.statSync(outputPath);
    if (stat.size < 5000) throw new Error('Steel.dev returned suspiciously small image');

    console.log(`Steel.dev captured: ${url} (${elements.length} interactive elements)`);
    return { path: outputPath, elements };
  } finally {
    if (steelBrowser) {
      try { steelBrowser.disconnect(); } catch {}
    }
  }
}

async function captureWithElementsPuppeteer(url, outputPath, options = {}) {
  const { width = 1080, height = 1080, delay = 3000, fullPage = false } = options;

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });

    const domain = new URL(url).hostname;
    if (domain.includes('youtube.com') || domain.includes('google.com')) {
      await page.setCookie(
        { name: 'CONSENT', value: 'YES+cb.20210720-07-p0.en+FX+410', domain: '.youtube.com' },
        { name: 'CONSENT', value: 'YES+cb.20210720-07-p0.en+FX+410', domain: '.google.com' },
      );
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    await dismissPopups(page);
    await hideVideoElements(page);
    await removeBannerElements(page);

    // Enumerate BEFORE screenshot
    const elements = await enumerateInteractiveElements(page);

    // Wait for any late-rendered popups, then final cleanup before screenshot
    await new Promise(r => setTimeout(r, 1000));
    await dismissPopups(page);
    await removeBannerElements(page);
    await page.screenshot({ path: outputPath, type: 'png', fullPage });

    console.log(`Puppeteer captured: ${url} (${elements.length} interactive elements)`);
    return { path: outputPath, elements };
  } finally {
    await page.close();
  }
}

/**
 * Capture screenshot + enumerate elements. Tries all capture methods.
 * Returns { path, elements } where elements is an array of DOM elements with rects.
 */
async function captureScreenshotWithElements(url, outputPath, options = {}) {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });

  // YouTube → thumbnail only, no elements
  if (isYouTubeUrl(url)) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const thumbUrls = [
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      ];
      for (const thumbUrl of thumbUrls) {
        try {
          const { data } = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
          fs.writeFileSync(outputPath, Buffer.from(data));
          return { path: outputPath, elements: [] };
        } catch {}
      }
    }
  }

  const withTimeout = (fn, ms, label) => Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);

  // Priority 1: Steel.dev — screenshot + DOM elements in one pass (best accuracy)
  if (process.env.STEEL_API_KEY) {
    try {
      return await withTimeout(() => captureWithElementsSteel(url, outputPath, options), 45000, 'Steel.dev');
    } catch (err) {
      console.log(`Steel.dev capture failed for ${url}: ${err.message}`);
    }
  }

  // Priority 2: Puppeteer local — screenshot + DOM elements in one pass
  try {
    return await withTimeout(() => captureWithElementsPuppeteer(url, outputPath, options), 30000, 'Puppeteer');
  } catch (err) {
    console.log(`Puppeteer capture failed for ${url}: ${err.message}`);
  }

  // Priority 3: ScreenshotOne — screenshot only, no DOM (Vision will handle coordinates)
  if (process.env.SCREENSHOTONE_API_KEY) {
    try {
      const p = await withTimeout(() => captureWithScreenshotOne(url, outputPath, options), 35000, 'ScreenshotOne');
      console.log(`ScreenshotOne captured (no DOM elements — Vision fallback): ${url}`);
      return { path: p, elements: [] };
    } catch (err) {
      console.log(`ScreenshotOne failed for ${url}: ${err.message}`);
    }
  }

  throw new Error(`All capture methods failed for ${url}`);
}

/**
 * Capture screenshots + enumerate elements for all slides.
 */
async function captureAllWithElements(slides, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const screenshots = new Map();     // slide_number → path
  const elementsMap = new Map();      // slide_number → elements[]
  const urlCache = new Map();         // normalizedUrl → { path, elements }

  const urls = slides.filter(s => s.screenshot_url).map(s => s.screenshot_url);
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length < urls.length) {
    console.log(`Warning: ${urls.length} screenshot URLs but only ${uniqueUrls.length} unique.`);
  }

  for (const slide of slides) {
    if (!slide.screenshot_url) continue;

    const filename = `screenshot_${slide.slide_number}.png`;
    const outputPath = path.join(workDir, filename);

    try {
      const normalizedUrl = slide.screenshot_url.replace(/\/+$/, '').toLowerCase();
      if (urlCache.has(normalizedUrl)) {
        const cached = urlCache.get(normalizedUrl);
        fs.copyFileSync(cached.path, outputPath);
        screenshots.set(slide.slide_number, outputPath);
        elementsMap.set(slide.slide_number, cached.elements);
        console.log(`Reused cached screenshot for slide ${slide.slide_number}`);
      } else {
        const result = await captureScreenshotWithElements(slide.screenshot_url, outputPath);
        urlCache.set(normalizedUrl, result);
        screenshots.set(slide.slide_number, result.path);
        elementsMap.set(slide.slide_number, result.elements);
        console.log(`Captured screenshot for slide ${slide.slide_number}: ${slide.screenshot_url}`);
      }
    } catch (err) {
      console.log(`Screenshot failed for slide ${slide.slide_number} (${slide.screenshot_url}): ${err.message}`);
    }
  }

  return { screenshots, elementsMap };
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { captureScreenshot, captureAll, captureAllWithElements, closeBrowser };
