const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

/**
 * Extract content from a URL.
 * Strategy: Steel.dev first (if configured), then Jina Reader, fallback to cheerio.
 *
 * @param {string} url - The URL to scrape
 * @returns {Promise<object>} Structured content
 */
async function scrape(url) {
  const result = await scrapeInternal(url);
  // Filter navigation links
  result.navigation_links = filterNavigationLinks(result.navigation_links || [], url);
  return result;
}

async function scrapeInternal(url) {
  const type = detectUrlType(url);

  if (type === 'youtube') {
    return scrapeYouTube(url);
  }

  // Try Steel.dev first (cloud browser, handles Cloudflare/JS/CAPTCHAs)
  if (process.env.STEEL_API_KEY) {
    try {
      const result = await scrapeWithSteel(url);
      if (result.content_markdown && result.content_markdown.length > 100) {
        return { ...result, type };
      }
      console.log('Steel.dev returned insufficient content, trying Jina');
    } catch (err) {
      console.log(`Steel.dev failed for ${url}: ${err.message}, trying Jina`);
    }
  }

  // Try Jina Reader (free, handles simple JS rendering)
  try {
    const result = await scrapeWithJina(url);
    if (result.content_markdown && result.content_markdown.length > 100) {
      return { ...result, type };
    }
  } catch (err) {
    console.log(`Jina Reader failed for ${url}: ${err.message}, falling back to cheerio`);
  }

  // Fallback: direct fetch + cheerio
  return scrapeWithCheerio(url, type);
}

/**
 * Detect URL type.
 */
function detectUrlType(url) {
  const u = url.toLowerCase();
  if (u.includes('youtube.com/watch') || u.includes('youtu.be/')) {
    return 'youtube';
  }
  return 'article';
}

/**
 * Extract YouTube video ID from URL.
 */
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Scrape YouTube video metadata via oEmbed.
 */
async function scrapeYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('Could not extract YouTube video ID');

  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const { data } = await axios.get(oembedUrl, { timeout: 10000 });

  return {
    url,
    type: 'youtube',
    title: data.title,
    content_markdown: data.title,
    images: [
      { src: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, alt: data.title },
      { src: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, alt: `${data.title} (HQ)` },
    ],
    navigation_links: [],
    metadata: {
      author: data.author_name,
      author_url: data.author_url,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      video_id: videoId,
    },
  };
}

/**
 * Scrape via Jina Reader API (free, no auth needed).
 * Returns clean markdown from any URL.
 */
async function scrapeWithJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const { data } = await axios.get(jinaUrl, {
    timeout: 15000,
    headers: {
      'Accept': 'text/markdown',
    },
  });

  const markdown = typeof data === 'string' ? data : JSON.stringify(data);

  // Extract title from first heading
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : extractTitleFromUrl(url);

  // Extract images from markdown
  const images = [];
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(markdown)) !== null) {
    images.push({ alt: match[1], src: match[2] });
  }

  // Extract links from markdown
  const navigation_links = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch;
  const seenHrefs = new Set();
  while ((linkMatch = linkRegex.exec(markdown)) !== null) {
    const href = linkMatch[2];
    if (!seenHrefs.has(href) && !href.startsWith('#') && !href.startsWith('mailto:')) {
      seenHrefs.add(href);
      navigation_links.push({ text: linkMatch[1], href });
    }
  }

  return {
    url,
    type: 'article',
    title,
    content_markdown: markdown,
    images,
    navigation_links,
    metadata: {
      source: 'jina',
    },
  };
}

/**
 * Scrape via Steel.dev cloud browser (handles Cloudflare, CAPTCHAs, JS-heavy pages).
 * Connects Puppeteer to Steel's WebSocket endpoint, extracts content from rendered page.
 */
async function scrapeWithSteel(url) {
  const wsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
  let browser = null;

  try {
    browser = await Promise.race([
      puppeteer.connect({ browserWSEndpoint: wsUrl }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Steel.dev connect timed out after 15s')), 15000)),
    ]);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit for dynamic content
    await new Promise(r => setTimeout(r, 2000));

    // Extract structured content from the rendered page
    const extracted = await page.evaluate(() => {
      // Extract navigation links BEFORE removing noise
      const navLinks = [];
      const seen = new Set();
      document.querySelectorAll('a[href]').forEach(el => {
        const href = el.href;
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100);
        if (!href || !text || text.length < 2 || seen.has(href)) return;
        if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) return;
        seen.add(href);
        navLinks.push({ text, href });
      });

      // Remove noise elements
      const noiseSelectors = 'script, style, nav, footer, header, iframe, noscript, [class*="ads"], [class*="sidebar"], [class*="cookie"], [class*="banner"], [class*="popup"]';
      document.querySelectorAll(noiseSelectors).forEach(el => el.remove());

      // Get title
      const title = document.querySelector('meta[property="og:title"]')?.content
        || document.title
        || document.querySelector('h1')?.textContent?.trim()
        || '';

      // Find main content area
      const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '.content', '.markdown-body', '.prose'];
      let mainEl = null;
      for (const sel of mainSelectors) {
        const el = document.querySelector(sel);
        if (el) { mainEl = el; break; }
      }
      if (!mainEl) mainEl = document.body;

      // Build markdown from content
      const lines = [];
      const elements = mainEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, code, table');
      elements.forEach(node => {
        const tag = node.tagName.toLowerCase();
        const text = node.textContent?.trim();
        if (!text) return;

        if (tag.startsWith('h')) {
          const level = parseInt(tag[1]);
          lines.push('#'.repeat(level) + ' ' + text);
        } else if (tag === 'li') {
          lines.push('- ' + text);
        } else if (tag === 'blockquote') {
          lines.push('> ' + text);
        } else if (tag === 'pre' || tag === 'code') {
          if (node.closest('pre') && tag === 'code') return; // skip inner code in pre
          lines.push('```\n' + text + '\n```');
        } else if (tag === 'table') {
          lines.push(text); // simplified table extraction
        } else {
          lines.push(text);
        }
      });

      // Extract images
      const images = [];
      const ogImage = document.querySelector('meta[property="og:image"]')?.content;
      if (ogImage) images.push({ src: ogImage, alt: 'OG Image' });
      mainEl.querySelectorAll('img').forEach(img => {
        const src = img.src;
        const alt = img.alt || '';
        if (src && !src.startsWith('data:') && !src.includes('pixel') && !src.includes('tracking')) {
          images.push({ src, alt });
        }
      });

      // Extract metadata
      const metadata = {
        author: document.querySelector('meta[name="author"]')?.content || '',
        description: document.querySelector('meta[name="description"]')?.content
          || document.querySelector('meta[property="og:description"]')?.content || '',
      };

      return { title, markdown: lines.join('\n\n'), images, metadata, navLinks };
    });

    await page.close();

    console.log(`Steel.dev scraped: ${url} (${extracted.markdown.length} chars)`);

    return {
      url,
      type: 'article',
      title: extracted.title || extractTitleFromUrl(url),
      content_markdown: extracted.markdown,
      images: extracted.images,
      navigation_links: extracted.navLinks || [],
      metadata: { ...extracted.metadata, source: 'steel' },
    };
  } finally {
    if (browser) {
      try { browser.disconnect(); } catch {}
    }
  }
}

/**
 * Fallback: fetch HTML + cheerio extraction.
 */
async function scrapeWithCheerio(url, type = 'article') {
  const { data: html } = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const $ = cheerio.load(html);

  // Extract navigation links BEFORE removing noise
  const navigation_links = [];
  const seenHrefs = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().replace(/\s+/g, ' ').substring(0, 100);
    if (!href || !text || text.length < 2 || seenHrefs.has(href)) return;
    if (href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) return;
    const absoluteHref = resolveUrl(url, href);
    seenHrefs.add(absoluteHref);
    navigation_links.push({ text, href: absoluteHref });
  });

  // Remove noise
  $('script, style, nav, footer, header, iframe, noscript, .ads, .sidebar').remove();

  // Extract title
  const title = $('meta[property="og:title"]').attr('content')
    || $('title').text().trim()
    || $('h1').first().text().trim()
    || extractTitleFromUrl(url);

  // Extract main content
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '.content'];
  let contentEl = null;
  for (const sel of selectors) {
    if ($(sel).length) {
      contentEl = $(sel).first();
      break;
    }
  }
  if (!contentEl) contentEl = $('body');

  // Convert to markdown-like text
  const content_markdown = htmlToSimpleMarkdown($, contentEl);

  // Extract images
  const images = [];
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) images.push({ src: ogImage, alt: 'OG Image' });

  contentEl.find('img').each((_, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || '';
    if (src && !src.includes('data:image') && !src.includes('pixel') && !src.includes('tracking')) {
      images.push({ src: resolveUrl(url, src), alt });
    }
  });

  // Extract metadata
  const metadata = {
    author: $('meta[name="author"]').attr('content') || $('[rel="author"]').text().trim() || '',
    date: $('meta[property="article:published_time"]').attr('content')
      || $('time').first().attr('datetime') || '',
    description: $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content') || '',
    source: 'cheerio',
  };

  return { url, type, title, content_markdown, images, navigation_links, metadata };
}

/**
 * Simple HTML to markdown converter.
 */
function htmlToSimpleMarkdown($, el) {
  const lines = [];

  el.find('h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_, node) => {
    const tag = node.tagName.toLowerCase();
    const text = $(node).text().trim();
    if (!text) return;

    if (tag.startsWith('h')) {
      const level = parseInt(tag[1]);
      lines.push(`${'#'.repeat(level)} ${text}`);
    } else if (tag === 'li') {
      lines.push(`- ${text}`);
    } else if (tag === 'blockquote') {
      lines.push(`> ${text}`);
    } else {
      lines.push(text);
    }
  });

  return lines.join('\n\n');
}

/**
 * Resolve relative URLs to absolute.
 */
function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Extract a readable title from a URL path.
 */
function extractTitleFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.split('/').filter(Boolean).pop() || '';
    return slug.replace(/[-_]/g, ' ').replace(/\.\w+$/, '').trim() || 'Untitled';
  } catch {
    return 'Untitled';
  }
}

/**
 * Filter and deduplicate navigation links.
 * Keeps same-domain links, removes social/utility links.
 */
function filterNavigationLinks(links, sourceUrl) {
  try {
    const sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    const noisePatterns = [/login/, /signup/, /signin/, /auth/, /privacy/, /terms/, /cookie/, /legal/, /facebook\.com/, /twitter\.com/, /linkedin\.com\/share/, /instagram\.com/];

    return links
      .filter(l => {
        try {
          const u = new URL(l.href);
          // Prioritize same-domain links
          const isSameDomain = u.hostname.replace(/^www\./, '').includes(sourceDomain) || sourceDomain.includes(u.hostname.replace(/^www\./, ''));
          // Filter out noise
          const isNoise = noisePatterns.some(p => p.test(l.href.toLowerCase()));
          return !isNoise && (isSameDomain || l.href.startsWith('http'));
        } catch { return false; }
      })
      .slice(0, 50);
  } catch { return links.slice(0, 50); }
}

module.exports = { scrape, extractYouTubeId };
