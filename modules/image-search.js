const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Process all image search requests from the agent.
 *
 * @param {Array} imageSearches - Array of { type, query, entity, purpose }
 * @param {string} workDir - Working directory for downloaded images
 * @returns {Promise<Array>} Results with local file paths
 */
async function searchImages(imageSearches, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const results = [];

  for (let i = 0; i < imageSearches.length; i++) {
    const search = imageSearches[i];
    try {
      const localPath = await searchSingle(search, workDir, i);
      results.push({ ...search, localPath, success: true });
    } catch (err) {
      console.log(`Image search failed for "${search.query}": ${err.message}`);
      results.push({ ...search, localPath: null, success: false, error: err.message });
    }
  }

  return results;
}

/**
 * Search for a single image based on type.
 */
async function searchSingle(search, workDir, index) {
  switch (search.type) {
    case 'logo':
    case 'icon':
      return fetchLogo(search.entity || search.query, workDir, index);
    case 'youtube_thumb':
      return fetchYouTubeThumbnail(search.entity, workDir, index);
    case 'screenshot':
    case 'website':
      // Screenshots handled by capture module
      return null;
    case 'image_search':
    case 'diagram':
    case 'chart':
    case 'code':
    case 'illustration':
      // All generic image types → try SerpAPI or skip gracefully
      if (process.env.SERPAPI_KEY) {
        return fetchGoogleImage(search.query, workDir, index);
      }
      return null;
    default:
      // Unknown type — try as generic image search if API key available
      console.log(`Unknown image search type "${search.type}", treating as generic`);
      if (process.env.SERPAPI_KEY) {
        return fetchGoogleImage(search.query, workDir, index);
      }
      return null;
  }
}

/**
 * Normalize a domain-like string: "anthropic" → "anthropic.com", "bit.ly" → "bit.ly"
 */
function normalizeDomain(input) {
  let d = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim().toLowerCase();
  // If no TLD, append .com
  if (!d.includes('.')) {
    d = `${d}.com`;
  }
  return d;
}

/**
 * Fetch company/tool logo via cascade: Google Favicon → DuckDuckGo → logo.dev.
 */
async function fetchLogo(domain, workDir, index) {
  const cleanDomain = normalizeDomain(domain);

  // 1. Google Favicon (128px — most reliable)
  try {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=128`;
    const buffer = await downloadImage(faviconUrl);
    if (buffer && buffer.length > 200) {
      const outPath = path.join(workDir, `logo_${index}.png`);
      await sharp(buffer).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath);
      return outPath;
    }
  } catch (err) {
    console.log(`Google Favicon failed for ${cleanDomain}: ${err.message}`);
  }

  // 2. DuckDuckGo icons
  try {
    const ddgUrl = `https://icons.duckduckgo.com/ip3/${cleanDomain}.ico`;
    const buffer = await downloadImage(ddgUrl);
    if (buffer && buffer.length > 200) {
      const outPath = path.join(workDir, `logo_${index}.png`);
      await sharp(buffer).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath);
      return outPath;
    }
  } catch (err) {
    console.log(`DuckDuckGo icon failed for ${cleanDomain}: ${err.message}`);
  }

  // 3. logo.dev (may need API key, try anyway)
  try {
    const logoDevUrl = `https://img.logo.dev/${cleanDomain}?token=pk_anonymous&size=128&format=png`;
    const buffer = await downloadImage(logoDevUrl);
    if (buffer && buffer.length > 1000) {
      const outPath = path.join(workDir, `logo_${index}.png`);
      await sharp(buffer).resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath);
      return outPath;
    }
  } catch (err) {
    console.log(`logo.dev failed for ${cleanDomain}: ${err.message}`);
  }

  throw new Error(`No logo found for ${cleanDomain}`);
}

/**
 * Fetch YouTube video thumbnail (free, direct access).
 */
async function fetchYouTubeThumbnail(videoId, workDir, index) {
  // Try maxresdefault first, then hqdefault
  const urls = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];

  for (const url of urls) {
    try {
      const buffer = await downloadImage(url);
      const outPath = path.join(workDir, `yt_thumb_${index}.jpg`);
      await sharp(buffer)
        .resize(960, 540, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toFile(outPath);
      return outPath;
    } catch {}
  }

  throw new Error(`No YouTube thumbnail found for ${videoId}`);
}

/**
 * Fetch image via SerpAPI Google Images search.
 */
async function fetchGoogleImage(query, workDir, index) {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) {
    throw new Error('SERPAPI_KEY not configured');
  }

  const { data } = await axios.get('https://serpapi.com/search.json', {
    params: {
      engine: 'google_images',
      q: query,
      api_key: serpKey,
      num: 3,
    },
    timeout: 10000,
  });

  const images = data.images_results || [];
  if (images.length === 0) throw new Error(`No results for "${query}"`);

  // Try the top results until one downloads successfully
  for (const img of images.slice(0, 3)) {
    try {
      const buffer = await downloadImage(img.original);
      const outPath = path.join(workDir, `search_${index}.png`);
      await sharp(buffer).resize(800, null, { withoutEnlargement: true }).png().toFile(outPath);
      return outPath;
    } catch {}
  }

  throw new Error(`Could not download any image for "${query}"`);
}

/**
 * Download an image from a URL to a buffer.
 */
async function downloadImage(url) {
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  return Buffer.from(data);
}

/**
 * Process a screenshot image: add rounded corners, shadow, resize.
 *
 * @param {string} inputPath - Path to raw screenshot
 * @param {string} outputPath - Path to save processed image
 * @param {object} options - Processing options
 */
async function processScreenshot(inputPath, outputPath, options = {}) {
  const { width = 960, borderRadius = 12, maxAspectRatio = 4 / 3 } = options;

  const img = sharp(inputPath);
  const metadata = await img.metadata();

  // Crop if image is taller than max aspect ratio (keep top, cut bottom)
  const currentRatio = metadata.height / metadata.width;
  let cropHeight = metadata.height;
  if (currentRatio > maxAspectRatio) {
    cropHeight = Math.round(metadata.width * maxAspectRatio);
    console.log(`[CROP] Screenshot ${metadata.width}x${metadata.height} cropped to ${metadata.width}x${cropHeight} (max ratio ${maxAspectRatio})`);
  }

  // Resize proportionally after crop
  const ratio = width / metadata.width;
  const height = Math.round(cropHeight * ratio);

  // Create rounded corners mask
  const roundedMask = Buffer.from(
    `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}"/></svg>`
  );

  await sharp(inputPath)
    .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
    .resize(width, height)
    .composite([{
      input: roundedMask,
      blend: 'dest-in',
    }])
    .png()
    .toFile(outputPath);
}

module.exports = { searchImages, processScreenshot, downloadImage, fetchLogo };
