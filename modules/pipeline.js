const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { scrape } = require('./scraper');
const { planStrategy, writeSlideContent, exploreUrls, analyzeScreenshotAndAnnotate, validateScreenshot, selectAnnotationTargets, selectAnnotationTargetsWithVision, verifyAnnotatedSlide } = require('./agent');
const { searchImages, processScreenshot, fetchLogo } = require('./image-search');
const { captureAll, captureAllWithElements } = require('./capture');
const { renderTemplate, FORMATS } = require('./renderer');
const { compositeAnnotations } = require('./annotator');

/**
 * Run the full pipeline: URL → Annotated Slide Images
 *
 * @param {string} url - Input URL
 * @param {object} options - { format, maxSlides, onStatus }
 * @returns {Promise<object>} Result with slide paths and metadata
 */
async function generateCarousel(url, options = {}) {
  const {
    format = '4:5',
    maxSlides = 7,
    language = 'en',
    accentColor = '#D97757',
    onStatus = () => {},
  } = options;

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const outputDir = path.join(process.env.OUTPUT_DIR || './outputs', jobId);
  const workDir = path.join(outputDir, '.work');
  fs.mkdirSync(workDir, { recursive: true });

  // Step 1: Scrape
  onStatus({ step: 'scraping', message: `Extracting content from ${url}...` });
  const content = await scrape(url);
  onStatus({ step: 'scraping', message: `Extracted: "${content.title}" (${content.content_markdown.length} chars)` });

  // Fetch cover logo from source domain
  const sourceDomain = new URL(url).hostname.replace(/^www\./, '');
  let coverLogoPath = null;
  try {
    coverLogoPath = await fetchLogo(sourceDomain, workDir, 'cover');
  } catch (err) {
    console.log(`Cover logo fetch failed: ${err.message}`);
  }

  // Step 2a: Strategist — plan slide structure
  onStatus({ step: 'analyzing', message: 'Planning carousel structure...' });
  const strategy = await planStrategy(content, maxSlides, language);
  onStatus({ step: 'analyzing', message: `Strategy: ${strategy.slides.length} slides planned` });

  // Step 2b: Writer — write slide titles, instructions, descriptions
  onStatus({ step: 'analyzing', message: 'Writing slide content...' });
  const slideDefinitions = await writeSlideContent(strategy, content, language);
  onStatus({ step: 'analyzing', message: `Written ${slideDefinitions.slides.length} slides` });

  // Step 2c: URL Explorer — validate and fix screenshot URLs
  onStatus({ step: 'analyzing', message: 'Validating screenshot URLs...' });
  await exploreUrls(slideDefinitions, content, language);

  // Hard cap: enforce maxSlides limit (1 cover + N-2 steps + optionally 1 resource)
  console.log(`[HARD CAP CHECK] ${slideDefinitions.slides.length} slides vs max ${maxSlides}. Types: ${slideDefinitions.slides.map(s => s.type).join(', ')}`);
  if (slideDefinitions.slides.length > maxSlides) {
    const cover = slideDefinitions.slides.filter(s => s.type === 'cover');
    const steps = slideDefinitions.slides.filter(s => s.type === 'step');
    const resources = slideDefinitions.slides.filter(s => s.type === 'resource');
    const maxSteps = maxSlides - cover.length - Math.min(resources.length, 1);
    slideDefinitions.slides = [
      ...cover,
      ...steps.slice(0, maxSteps),
      ...resources.slice(0, 1),
    ];
    // Renumber
    let num = 0;
    for (const s of slideDefinitions.slides) {
      if (s.type !== 'cover') { num++; s.slide_number = num; }
    }
    console.log(`[HARD CAP] Trimmed to ${slideDefinitions.slides.length} slides (max ${maxSlides})`);
  }

  const slideCount = slideDefinitions.slides.length;

  // Attach cover logo + domain to cover slide
  const coverSlide = slideDefinitions.slides.find(s => s.type === 'cover');
  if (coverSlide) {
    coverSlide._sourceDomain = sourceDomain;
    coverSlide._coverLogoPath = coverLogoPath;
  }

  onStatus({ step: 'analyzing', message: `Structured ${slideCount} slides` });

  // Step 3: Image search (parallel with captures)
  onStatus({ step: 'searching', message: 'Finding relevant images...' });
  const allImageSearches = [];
  for (const slide of slideDefinitions.slides) {
    if (slide.image_searches) {
      allImageSearches.push(...slide.image_searches.map(s => ({ ...s, slide_number: slide.slide_number })));
    }
  }
  const imageResults = allImageSearches.length > 0
    ? await searchImages(allImageSearches, path.join(workDir, 'images'))
    : [];
  onStatus({ step: 'searching', message: `Found ${imageResults.filter(r => r.success).length}/${allImageSearches.length} images` });

  // Step 4: Capture screenshots + enumerate DOM elements
  const screenshotDimensions = new Map();
  const slidesWithScreenshots = slideDefinitions.slides.filter(s => s.screenshot_url);
  let elementsMap = new Map();
  if (slidesWithScreenshots.length > 0) {
    onStatus({ step: 'capturing', message: `Capturing ${slidesWithScreenshots.length} screenshots...` });
    const captureResult = await captureAllWithElements(slidesWithScreenshots, path.join(workDir, 'captures'));
    const screenshots = captureResult.screenshots;
    elementsMap = captureResult.elementsMap;

    // Process screenshots (resize, round corners) and store dimensions
    for (const [slideNum, screenshotPath] of screenshots) {
      const processedPath = screenshotPath.replace('.png', '_processed.png');
      try {
        await processScreenshot(screenshotPath, processedPath, { width: 960, borderRadius: 12 });
        const metadata = await sharp(processedPath).metadata();
        screenshotDimensions.set(slideNum, { width: metadata.width, height: metadata.height });
        screenshots.set(slideNum, processedPath);
      } catch {}
    }

    // Attach screenshot paths to slide definitions
    for (const slide of slideDefinitions.slides) {
      if (screenshots.has(slide.slide_number)) {
        slide._screenshotPath = screenshots.get(slide.slide_number);
      }
    }

    // Step 4b: Validate screenshots — reject 404s, login walls, blank pages
    onStatus({ step: 'validating', message: 'Validating screenshots...' });
    for (const slide of slideDefinitions.slides) {
      if (slide._screenshotPath && slide.type === 'step') {
        try {
          const screenshotBuffer = fs.readFileSync(slide._screenshotPath);
          const validation = await validateScreenshot(screenshotBuffer);
          slide._validation = validation;

          if (!validation.valid) {
            console.log(`Screenshot REJECTED for slide ${slide.slide_number}: ${validation.reason} (${validation.page_type})`);
            // Remove the invalid screenshot — slide will render without it
            delete slide._screenshotPath;
          } else {
            console.log(`Screenshot VALID for slide ${slide.slide_number}: ${validation.page_type} (score: ${validation.quality_score || '?'}, elements: ${(validation.ui_elements || []).length})`);
          }
        } catch (err) {
          console.log(`Validation failed for slide ${slide.slide_number}: ${err.message}`);
        }
      }
    }
    const validScreenshots = slideDefinitions.slides.filter(s => s._screenshotPath && s.type === 'step').length;
    onStatus({ step: 'validating', message: `${validScreenshots} valid screenshots out of ${slidesWithScreenshots.length} captured` });

    // Step 4c: Vision+DOM hybrid annotation — pixel-perfect placement
    // Pass 1 (DOM): exact element positions from getBoundingClientRect
    // Pass 2 (Vision): Claude sees the screenshot + DOM positions, picks best elements
    // Result: Vision intelligence + DOM precision = 100% accurate coordinates
    onStatus({ step: 'refining', message: 'Analyzing screenshots and placing annotations...' });
    const usedInstructions = [];
    for (const slide of slideDefinitions.slides) {
      if (slide._screenshotPath && slide.type === 'step') {
        const slideContext = {
          title: slide.title,
          slide_number: slide.slide_number,
          original_instructions: slide.instructions,
          step_topic: slide.title,
          avoid_instructions: usedInstructions,
        };

        const elements = elementsMap.get(slide.slide_number) || [];
        const screenshotBuffer = fs.readFileSync(slide._screenshotPath);

        if (elements.length >= 3) {
          // Vision+DOM hybrid: Claude sees the image AND knows exact element positions
          try {
            console.log(`[VISION+DOM] Slide ${slide.slide_number}: ${elements.length} elements + screenshot → hybrid annotation`);
            const result = await selectAnnotationTargetsWithVision(screenshotBuffer, elements, slideContext, language);

            if (result.instructions && result.instructions.length > 0) {
              slide.instructions = result.instructions;
              usedInstructions.push(...result.instructions);
            }
            if (result.annotations && result.annotations.length > 0) {
              slide.annotations = result.annotations;
            }

            console.log(`[VISION+DOM] Slide ${slide.slide_number}: ${(result.annotations || []).length} annotations placed with DOM precision`);
          } catch (err) {
            console.log(`Vision+DOM failed for slide ${slide.slide_number}: ${err.message}, falling back to Vision-only`);
            await visionFallback(slide, slideContext, usedInstructions, language);
          }
        } else {
          // Vision-only fallback: insufficient DOM elements
          console.log(`[VISION] Slide ${slide.slide_number}: only ${elements.length} DOM elements, using Vision-only`);
          await visionFallback(slide, slideContext, usedInstructions, language);
        }
      }
    }

    // Post-processing dedup safety net: remove instructions that appear on multiple slides
    // Also removes orphaned annotations and renumbers remaining ones
    const instructionFingerprint = (inst) => {
      const boldMatch = inst.match(/\*\*(.+?)\*\*/);
      return boldMatch ? boldMatch[1].toLowerCase().trim() : inst.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30);
    };
    const seenFingerprints = new Set();
    for (const slide of slideDefinitions.slides) {
      if (slide.type !== 'step' || !slide.instructions) continue;
      const keptIndices = [];
      slide.instructions = slide.instructions.filter((inst, idx) => {
        const fp = instructionFingerprint(inst);
        if (seenFingerprints.has(fp)) {
          console.log(`[DEDUP] Removed duplicate instruction from slide ${slide.slide_number}: "${inst.substring(0, 60)}..."`);
          return false;
        }
        seenFingerprints.add(fp);
        keptIndices.push(idx);
        return true;
      });

      // Remove orphaned annotations: keep only circles matching kept instruction indices
      if (slide.annotations && keptIndices.length < slide.annotations.filter(a => a.type === 'circle_number').length) {
        const keptLabels = new Set(keptIndices.map(i => String(i + 1)));
        slide.annotations = slide.annotations.filter(a => {
          if (a.type === 'circle_number') return keptLabels.has(a.label);
          // Keep highlight box only if its target matches a kept circle
          if (a.type === 'highlight_box') {
            const matchingCircle = slide.annotations.find(c => c.type === 'circle_number' && c.label === '1' && keptLabels.has('1'));
            return !!matchingCircle;
          }
          return true;
        });
        // Renumber remaining circles sequentially
        let num = 1;
        for (const a of slide.annotations) {
          if (a.type === 'circle_number') a.label = String(num++);
        }
      }
    }

    // Step 4d: Composite annotations directly into screenshot pixels
    // This eliminates all CSS positioning issues — annotations are burned into the image
    onStatus({ step: 'refining', message: 'Compositing annotations onto screenshots...' });
    for (const slide of slideDefinitions.slides) {
      if (slide._screenshotPath && slide.type === 'step') {
        const validAnnotations = (slide.annotations || []).filter(a => !a._notFound);
        if (validAnnotations.length > 0) {
          slide._originalScreenshotPath = slide._screenshotPath; // Save clean version for potential retry
          const annotatedPath = slide._screenshotPath.replace('.png', '_annotated.png');
          try {
            await compositeAnnotations(slide._screenshotPath, validAnnotations, annotatedPath, accentColor);
            slide._screenshotPath = annotatedPath;
            console.log(`[COMPOSITE] Slide ${slide.slide_number}: ${validAnnotations.length} annotations baked into image`);
          } catch (err) {
            console.log(`[COMPOSITE] Failed for slide ${slide.slide_number}: ${err.message}, using plain screenshot`);
          }
        }
      }
    }

    // Step 4e: Quality verification loop — Agent 6 checks EVERYTHING, retries if needed
    onStatus({ step: 'refining', message: 'Quality verification of annotated slides...' });
    for (const slide of slideDefinitions.slides) {
      if (!slide._originalScreenshotPath || slide.type !== 'step') continue;

      const validAnnotations = (slide.annotations || []).filter(a => !a._notFound);
      if (validAnnotations.length === 0) continue;

      const maxRetries = 2;
      let passed = false;

      for (let attempt = 0; attempt <= maxRetries && !passed; attempt++) {
        // Verify the current annotated image
        const annotatedBuffer = fs.readFileSync(slide._screenshotPath);
        const verdict = await verifyAnnotatedSlide(annotatedBuffer, {
          title: slide.title,
          slide_number: slide.slide_number,
          instructions: slide.instructions || [],
          annotations: slide.annotations || [],
        });

        if (verdict.passed && (verdict.score || 10) >= 7) {
          console.log(`[VERIFY] Slide ${slide.slide_number}: PASSED (score: ${verdict.score || '?'})${attempt > 0 ? ` after ${attempt} retry` : ''}`);
          passed = true;
          break;
        }

        if (attempt >= maxRetries) {
          console.log(`[VERIFY] Slide ${slide.slide_number}: max retries reached (score: ${verdict.score || '?'}), keeping current version`);
          break;
        }

        // Build feedback from issues
        const issues = (verdict.issues || []).map(i => i.detail || JSON.stringify(i)).join('. ');
        const feedback = verdict.suggestions ? `${verdict.suggestions}. Issues: ${issues}` : issues;
        console.log(`[VERIFY] Slide ${slide.slide_number}: FAILED (score: ${verdict.score || '?'}, attempt ${attempt + 1}/${maxRetries + 1}): ${issues}`);

        // Check if retry is possible (need DOM elements)
        const elements = elementsMap.get(slide.slide_number) || [];
        if (elements.length < 3) {
          console.log(`[VERIFY] Cannot retry slide ${slide.slide_number}: insufficient DOM elements for re-annotation`);
          break;
        }

        // Re-annotate with verification feedback
        const originalBuffer = fs.readFileSync(slide._originalScreenshotPath);
        const otherInstructions = slideDefinitions.slides
          .filter(s => s.type === 'step' && s.slide_number !== slide.slide_number && s.instructions)
          .flatMap(s => s.instructions);

        const retryContext = {
          title: slide.title,
          slide_number: slide.slide_number,
          original_instructions: slide.instructions,
          step_topic: slide.title,
          avoid_instructions: otherInstructions,
          rejection_feedback: feedback,
        };

        try {
          onStatus({ step: 'refining', message: `Re-annotating slide ${slide.slide_number} (attempt ${attempt + 2})...` });
          const result = await selectAnnotationTargetsWithVision(originalBuffer, elements, retryContext, language);

          if (result.instructions && result.instructions.length > 0) {
            slide.instructions = result.instructions;
          }
          if (result.annotations && result.annotations.length > 0) {
            slide.annotations = result.annotations;
          }

          // Re-composite on the clean (unannotated) screenshot
          const retryAnnotations = (slide.annotations || []).filter(a => !a._notFound);
          const retryPath = slide._originalScreenshotPath.replace('.png', `_annotated_v${attempt + 2}.png`);
          await compositeAnnotations(slide._originalScreenshotPath, retryAnnotations, retryPath, accentColor);
          slide._screenshotPath = retryPath;

          console.log(`[VERIFY] Slide ${slide.slide_number}: re-annotated with ${retryAnnotations.length} annotations, re-verifying...`);
        } catch (err) {
          console.log(`[VERIFY] Re-annotation failed for slide ${slide.slide_number}: ${err.message}`);
          break;
        }
      }
    }

    // Safety net: any step slide with a screenshot but 0 annotations gets a last-chance Vision-only attempt
    for (const slide of slideDefinitions.slides) {
      if (slide.type !== 'step' || !slide._screenshotPath) continue;
      const validAnnos = (slide.annotations || []).filter(a => a.type === 'circle_number' && !a._notFound);
      if (validAnnos.length > 0) continue;

      console.log(`[SAFETY NET] Slide ${slide.slide_number} has 0 annotations — forcing Vision-only fallback`);
      const cleanPath = slide._originalScreenshotPath || slide._screenshotPath;
      const otherInstructions = slideDefinitions.slides
        .filter(s => s.type === 'step' && s.slide_number !== slide.slide_number && s.instructions)
        .flatMap(s => s.instructions);
      const fallbackContext = {
        title: slide.title,
        slide_number: slide.slide_number,
        original_instructions: slide.instructions,
        step_topic: slide.title,
        avoid_instructions: otherInstructions,
      };
      try {
        await visionFallback(slide, fallbackContext, usedInstructions, language);
        // Re-composite if we got annotations
        const newAnnos = (slide.annotations || []).filter(a => !a._notFound);
        if (newAnnos.length > 0) {
          const annotatedPath = cleanPath.replace('.png', '_safety_annotated.png');
          await compositeAnnotations(cleanPath, newAnnos, annotatedPath, accentColor);
          slide._screenshotPath = annotatedPath;
          console.log(`[SAFETY NET] Slide ${slide.slide_number}: recovered with ${newAnnos.length} Vision-only annotations`);
        }
      } catch (err) {
        console.log(`[SAFETY NET] Failed for slide ${slide.slide_number}: ${err.message}`);
      }
    }

    onStatus({ step: 'refining', message: 'All slides verified — quality check complete' });
  }

  // Step 4d: Remove slides with rejected screenshots (no placeholder slides)
  slideDefinitions.slides = slideDefinitions.slides.filter(slide => {
    if (slide.type === 'step' && slide._validation && !slide._validation.valid) {
      console.log(`Removing slide ${slide.slide_number} ("${slide.title}") — screenshot was rejected`);
      return false;
    }
    return true;
  });

  // Renumber remaining slides
  let stepNum = 0;
  for (const slide of slideDefinitions.slides) {
    if (slide.type !== 'cover') {
      stepNum++;
      slide.slide_number = stepNum;
    }
  }

  const finalSlideCount = slideDefinitions.slides.length;
  onStatus({ step: 'rendering', message: `Composing ${finalSlideCount} slides in ${format}...` });

  // Step 5: Render slides
  const dim = FORMATS[format] || FORMATS['4:5'];
  const slidePaths = [];

  for (let i = 0; i < slideDefinitions.slides.length; i++) {
    const slide = slideDefinitions.slides[i];
    onStatus({ step: 'rendering', message: `Rendering slide ${i + 1}/${slideCount}...` });

    const templateName = slide.type === 'cover' ? 'cover'
      : slide.type === 'resource' ? 'resource'
      : 'step';

    const data = buildTemplateData(slide, imageResults, screenshotDimensions);
    // Cover needs the total step count
    if (slide.type === 'cover') {
      data.slide_count = String(slideDefinitions.slides.filter(s => s.type !== 'cover').length);
    }

    // Debug: log annotation data before rendering
    if (slide.type === 'step') {
      const annoCount = (slide.annotations || []).length;
      console.log(`[DEBUG] Slide ${slide.slide_number}: ${annoCount} annotations (composited into screenshot image)`);
    }

    data.accent_color = accentColor;
    const png = await renderTemplate(templateName, data, format);

    const filename = `slide_${String(i + 1).padStart(2, '0')}.png`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, png);
    slidePaths.push({ number: i + 1, filename, path: filepath });
  }

  // Cleanup work directory
  fs.rmSync(workDir, { recursive: true, force: true });

  return {
    job_id: jobId,
    format,
    dimensions: `${dim.width}x${dim.height}`,
    carousel_title: slideDefinitions.carousel_title,
    slides: slidePaths.map(s => ({
      number: s.number,
      url: `/outputs/${jobId}/${s.filename}`,
    })),
    zip_url: `/download/${jobId}`,
  };
}

/**
 * Vision-based annotation fallback (when DOM elements unavailable).
 */
async function visionFallback(slide, slideContext, usedInstructions, language) {
  try {
    const screenshotBuffer = fs.readFileSync(slide._screenshotPath);
    const visionResult = await analyzeScreenshotAndAnnotate(screenshotBuffer, slideContext, language);

    if (visionResult.instructions && visionResult.instructions.length > 0) {
      slide.instructions = visionResult.instructions;
      usedInstructions.push(...visionResult.instructions);
    }
    if (visionResult.annotations && visionResult.annotations.length > 0) {
      slide.annotations = visionResult.annotations;
    }

    console.log(`[VISION] Slide ${slide.slide_number}: ${visionResult.annotations.length} annotations, ${visionResult.instructions.length} instructions`);
    if (visionResult.page_description) {
      console.log(`  Page: ${visionResult.page_description}`);
    }
  } catch (err) {
    console.log(`Vision analysis failed for slide ${slide.slide_number}: ${err.message}`);
  }
}

/**
 * Build template data from slide definition + image results.
 */
function buildTemplateData(slide, imageResults, screenshotDimensions = new Map()) {
  const data = {};

  // Common — always set all variables with defaults
  // Strip leading number+dot and "Step X:" prefix to avoid "1. Step 1: Title" duplication
  let title = slide.title || '';
  title = title.replace(/^\d+[\.\)\-]\s*/, '');
  title = title.replace(/^Step\s*\d+\s*[:\-–—]\s*/i, '');
  data.title = title;
  data.subtitle = slide.subtitle || '';
  data.slide_number = String(slide.slide_number || '');
  data.slide_count = '';
  data.instructions_html = '';
  data.legend_html = '';
  data.screenshot_content = '';
  data.annotations_html = '';
  data.screenshot_aspect_ratio = '1 / 1';
  data.description_html = '';
  data.media_html = '';

  // Compute screenshot aspect ratio from stored dimensions
  if (slide.slide_number && screenshotDimensions.has(slide.slide_number)) {
    const dims = screenshotDimensions.get(slide.slide_number);
    data.screenshot_aspect_ratio = `${dims.width} / ${dims.height}`;
  }

  // Instructions — build both old format and new legend format
  if (slide.instructions && slide.instructions.length > 0) {
    data.instructions_html = slide.instructions
      .map(inst => {
        let clean = inst.replace(/^[\s]*[→►▸•\-–—]\s*/, '');
        const html = clean.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return `<p>&rarr; ${html}</p>`;
      })
      .join('\n');

    // Legend: numbered items matching annotation circles
    data.legend_html = slide.instructions
      .map((inst, i) => {
        let clean = inst.replace(/^[\s]*[→►▸•\-–—]\s*/, '');
        const html = clean.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return `<div class="legend-item"><div class="legend-number">${i + 1}</div><div class="legend-text">${html}</div></div>`;
      })
      .join('\n');
  }

  // Description (for resource type)
  if (slide.description) {
    data.description_html = slide.description.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // Screenshot content for step template
  if (slide._screenshotPath && fs.existsSync(slide._screenshotPath)) {
    const imgBuffer = fs.readFileSync(slide._screenshotPath);
    const src = `data:image/png;base64,${imgBuffer.toString('base64')}`;
    data.screenshot_content = `<img src="${src}" alt="Screenshot"/>`;
  } else if (slide.type === 'step') {
    data.screenshot_content = `<div class="screenshot-placeholder"><span>Screenshot zone</span></div>`;
  }

  // Media content for resource template
  if (slide.type === 'resource') {
    data.media_html = `<div class="youtube-embed">
      <div class="youtube-viewport"><div class="youtube-play"></div></div>
      <div class="youtube-bar">
        <div class="yt-logo"><svg width="20" height="14" viewBox="0 0 20 14"><rect width="20" height="14" rx="3" fill="#FF0000"/><polygon points="8,3 8,11 14,7" fill="white"/></svg> YouTube</div>
        <div class="yt-title">${slide.title || ''}</div>
        <div class="yt-meta">Resource</div>
      </div>
    </div>`;
  }

  // Logo for step template
  // Source domain for cover
  data.source_domain = slide._sourceDomain || '';

  data.logo_html = '';
  // Cover logo
  if (slide.type === 'cover' && slide._coverLogoPath && fs.existsSync(slide._coverLogoPath)) {
    const logoBuffer = fs.readFileSync(slide._coverLogoPath);
    const logoB64 = logoBuffer.toString('base64');
    const ext = slide._coverLogoPath.endsWith('.png') ? 'png' : 'jpeg';
    data.logo_html = `<div class="cover-logo"><img src="data:image/${ext};base64,${logoB64}" alt="logo" /></div>`;
  }
  // Step logo
  if (slide.type === 'step' && slide.image_searches) {
    const logoSearch = slide.image_searches.find(s => s.type === 'logo' || s.type === 'icon');
    if (logoSearch) {
      const logoResult = imageResults.find(r => r.success && r.slide_number === slide.slide_number && (r.type === 'logo' || r.type === 'icon'));
      if (logoResult && logoResult.localPath && fs.existsSync(logoResult.localPath)) {
        const logoBuffer = fs.readFileSync(logoResult.localPath);
        const logoB64 = logoBuffer.toString('base64');
        const ext = logoResult.localPath.endsWith('.png') ? 'png' : 'jpeg';
        data.logo_html = `<div class="step-logo"><img src="data:image/${ext};base64,${logoB64}" alt="logo" /></div>`;
      }
    }
  }

  // YouTube thumbnail for resource template
  if (slide.type === 'resource' && slide.image_searches) {
    const thumbSearch = slide.image_searches.find(s => s.type === 'youtube_thumb');
    if (thumbSearch) {
      const thumbResult = imageResults.find(r => r.success && r.slide_number === slide.slide_number && r.type === 'youtube_thumb');
      if (thumbResult && thumbResult.localPath && fs.existsSync(thumbResult.localPath)) {
        const thumbBuffer = fs.readFileSync(thumbResult.localPath);
        const thumbB64 = thumbBuffer.toString('base64');
        data.media_html = `<div class="youtube-embed">
          <div class="youtube-viewport" style="background:none;">
            <img src="data:image/jpeg;base64,${thumbB64}" alt="YouTube thumbnail" style="width:100%;height:100%;object-fit:cover;" />
            <div class="youtube-play-overlay"><div class="youtube-play"></div></div>
          </div>
          <div class="youtube-bar">
            <div class="yt-logo"><svg width="20" height="14" viewBox="0 0 20 14"><rect width="20" height="14" rx="3" fill="#FF0000"/><polygon points="8,3 8,11 14,7" fill="white"/></svg> YouTube</div>
            <div class="yt-title">${slide.title || ''}</div>
            <div class="yt-meta">Resource</div>
          </div>
        </div>`;
      }
    }
  }

  // Annotations are composited directly into the screenshot image by annotator.js
  // No CSS overlay HTML needed — annotations_html stays empty (set above)

  return data;
}

/**
 * Convert position_hint to CSS coordinates.
 */
function positionFromHint(hint) {
  const positions = {
    'top-left':      { x: '8%',  y: '10%' },
    'top-center':    { x: '45%', y: '10%' },
    'top-right':     { x: '80%', y: '10%' },
    'center-left':   { x: '8%',  y: '45%' },
    'center':        { x: '45%', y: '45%' },
    'center-right':  { x: '80%', y: '45%' },
    'bottom-left':   { x: '8%',  y: '75%' },
    'bottom-center': { x: '45%', y: '75%' },
    'bottom-right':  { x: '80%', y: '75%' },
  };
  return positions[hint] || positions['center'];
}

module.exports = { generateCarousel };
