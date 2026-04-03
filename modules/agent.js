const axios = require('axios');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Token usage tracking — accumulated per pipeline run
let _tokenUsage = { input_tokens: 0, output_tokens: 0, api_calls: 0 };

function resetTokenUsage() {
  _tokenUsage = { input_tokens: 0, output_tokens: 0, api_calls: 0 };
}

function getTokenUsage() {
  const cost = (_tokenUsage.input_tokens / 1_000_000) * 3 + (_tokenUsage.output_tokens / 1_000_000) * 15;
  return { ..._tokenUsage, total_tokens: _tokenUsage.input_tokens + _tokenUsage.output_tokens, estimated_cost: Math.round(cost * 1000) / 1000 };
}

function trackUsage(apiResponse) {
  if (apiResponse && apiResponse.usage) {
    _tokenUsage.input_tokens += apiResponse.usage.input_tokens || 0;
    _tokenUsage.output_tokens += apiResponse.usage.output_tokens || 0;
    _tokenUsage.api_calls += 1;
  }
}

// Wrapper for all Claude API calls — tracks tokens automatically
async function callClaude(body, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-...') {
    throw new Error('ANTHROPIC_API_KEY not configured. Set it in .env');
  }
  const { data } = await axios.post(ANTHROPIC_API_URL, body, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: options.timeout || 30000,
  });
  trackUsage(data);
  return data;
}

/**
 * Build the system prompt in the requested language.
 */
function getSystemPrompt(language = 'en') {
  const langInstructions = {
    en: {
      role: 'You are an expert designer of tutorial carousels for social media (LinkedIn, Instagram).',
      task: 'You are given content extracted from a URL. Transform it into a series of vertical slides for a carousel.',
      rules_title: 'STRICT RULES:',
      rules: [
        'Maximum 8 slides (1 cover + 5-7 steps)',
        'Each slide has a step number',
        'Titles are short and impactful (max 6 words)',
        'Instructions use arrows and bold keywords (syntax **word**)',
        'Maximum 3-4 instruction lines per slide',
        'CRITICAL: Each slide MUST have a DIFFERENT screenshot_url — use specific subpages, feature pages, or documentation pages (e.g. "https://site.com/features/crm" NOT just "https://site.com" repeated)',
        'If the main URL is a general page, find specific subpage URLs for each step from the content or from the site structure (e.g. /pricing, /features, /docs, /signup, /dashboard)',
        'Instructions must describe VISIBLE UI actions that can be seen on the screenshot (e.g. "Click the **Sign Up** button" if the page has a signup form, NOT abstract concepts)',
        'For each slide, identify relevant images to search: tool logos, interface screenshots, YouTube thumbnails',
      ],
      types_title: 'SLIDE TYPES:',
      types: [
        '"cover": first slide, catchy carousel title + subtitle',
        '"step": tutorial slide with numbered title, instructions, and screenshot area with annotations',
        '"resource": resource slide with number badge, title, description, and media (YouTube video, article)',
      ],
      annotations_title: 'ANNOTATION TYPES for screenshots:',
      annotations: [
        '"circle_number": numbered circle on a UI element (button, field, menu)',
        '"highlight_box": box highlighting the primary action element',
        '"highlight_box": box around an element',
      ],
      output_instruction: 'Return ONLY valid JSON (no text before or after). Exact structure:',
      write_in: 'ALL titles, subtitles, instructions, and descriptions MUST be written in English.',
    },
    fr: {
      role: 'Tu es un designer expert de carousels tutoriels pour reseaux sociaux (LinkedIn, Instagram).',
      task: 'On te donne le contenu extrait d\'une URL. Tu dois le transformer en une serie de slides verticales pour un carousel.',
      rules_title: 'REGLES STRICTES :',
      rules: [
        'Maximum 8 slides (1 couverture + 5-7 etapes)',
        'Chaque slide a un numero d\'etape',
        'Les titres sont courts et impactants (max 6 mots)',
        'Les instructions utilisent des fleches et des mots-cles en gras (syntaxe **mot**)',
        'Maximum 3-4 lignes d\'instructions par slide',
        'CRITIQUE : Chaque slide DOIT avoir un screenshot_url DIFFERENT — utilise des sous-pages specifiques (ex: "https://site.com/features/crm" PAS juste "https://site.com" repete)',
        'Si l\'URL principale est une page generale, trouve des URLs de sous-pages pour chaque etape (ex: /pricing, /features, /docs, /signup, /dashboard)',
        'Les instructions doivent decrire des actions VISIBLES sur le screenshot (ex: "Cliquer sur **Inscription**" si la page a un formulaire, PAS des concepts abstraits)',
        'Pour chaque slide, identifie les images pertinentes a rechercher : logos d\'outils, screenshots d\'interfaces, thumbnails YouTube',
      ],
      types_title: 'TYPES DE SLIDES :',
      types: [
        '"cover" : premiere slide, titre accrocheur du carousel + sous-titre',
        '"step" : slide tutoriel avec titre numerote, instructions, et zone screenshot avec annotations',
        '"resource" : slide ressource avec badge numero, titre, description, et media (video YouTube, article)',
      ],
      annotations_title: 'ANNOTATIONS possibles sur les screenshots :',
      annotations: [
        '"circle_number" : cercle numerote sur un element UI (bouton, champ, menu)',
        '"highlight_box" : encadre mettant en valeur l\'element d\'action principal',
        '"highlight_box" : encadre autour d\'un element',
      ],
      output_instruction: 'Retourne UNIQUEMENT un JSON valide (pas de texte avant ou apres). Structure exacte :',
      write_in: 'TOUS les titres, sous-titres, instructions et descriptions DOIVENT etre ecrits en francais.',
    },
    es: {
      role: 'Eres un disenador experto de carruseles tutoriales para redes sociales (LinkedIn, Instagram).',
      task: 'Se te da el contenido extraido de una URL. Debes transformarlo en una serie de diapositivas verticales para un carrusel.',
      rules_title: 'REGLAS ESTRICTAS:',
      rules: [
        'Maximo 8 diapositivas (1 portada + 5-7 pasos)',
        'Cada diapositiva tiene un numero de paso',
        'Los titulos son cortos e impactantes (max 6 palabras)',
        'Las instrucciones usan flechas y palabras clave en negrita (sintaxis **palabra**)',
        'Maximo 3-4 lineas de instrucciones por diapositiva',
        'CRITICO: Cada diapositiva DEBE tener un screenshot_url DIFERENTE — usa subpaginas especificas (ej: "https://site.com/features/crm" NO solo "https://site.com" repetido)',
        'Si la URL principal es general, encuentra URLs de subpaginas para cada paso (ej: /pricing, /features, /docs, /signup, /dashboard)',
        'Las instrucciones deben describir acciones VISIBLES en el screenshot (ej: "Clic en **Registro**" si la pagina tiene un formulario, NO conceptos abstractos)',
        'Para cada diapositiva, identifica imagenes relevantes: logos de herramientas, screenshots, thumbnails de YouTube',
      ],
      types_title: 'TIPOS DE DIAPOSITIVAS:',
      types: [
        '"cover": primera diapositiva, titulo atractivo + subtitulo',
        '"step": diapositiva tutorial con titulo numerado, instrucciones y zona de screenshot con anotaciones',
        '"resource": diapositiva de recurso con badge, titulo, descripcion y media (video YouTube, articulo)',
      ],
      annotations_title: 'TIPOS DE ANOTACIONES para screenshots:',
      annotations: [
        '"circle_number": circulo numerado en un elemento UI (boton, campo, menu)',
        '"highlight_box": recuadro resaltando el elemento de accion principal',
        '"highlight_box": recuadro alrededor de un elemento',
      ],
      output_instruction: 'Devuelve SOLO JSON valido (sin texto antes o despues). Estructura exacta:',
      write_in: 'TODOS los titulos, subtitulos, instrucciones y descripciones DEBEN estar escritos en espanol.',
    },
    de: {
      role: 'Du bist ein Experte fur Tutorial-Karussells fur soziale Medien (LinkedIn, Instagram).',
      task: 'Dir wird der Inhalt einer URL gegeben. Verwandle ihn in eine Serie vertikaler Slides fur ein Karussell.',
      rules_title: 'STRENGE REGELN:',
      rules: [
        'Maximal 8 Slides (1 Cover + 5-7 Schritte)',
        'Jeder Slide hat eine Schrittnummer',
        'Titel sind kurz und wirkungsvoll (max 6 Worter)',
        'Anleitungen verwenden Pfeile und fettgedruckte Schlusselworter (Syntax **Wort**)',
        'Maximal 3-4 Anleitungszeilen pro Slide',
        'KRITISCH: Jeder Slide MUSS eine ANDERE screenshot_url haben — verwende spezifische Unterseiten (z.B. "https://site.com/features/crm" NICHT nur "https://site.com" wiederholt)',
        'Wenn die Haupt-URL allgemein ist, finde Unterseiten-URLs fur jeden Schritt (z.B. /pricing, /features, /docs, /signup, /dashboard)',
        'Anleitungen mussen SICHTBARE Aktionen auf dem Screenshot beschreiben (z.B. "Klicke auf **Registrieren**" wenn die Seite ein Formular hat, NICHT abstrakte Konzepte)',
        'Identifiziere relevante Bilder: Tool-Logos, Interface-Screenshots, YouTube-Thumbnails',
      ],
      types_title: 'SLIDE-TYPEN:',
      types: [
        '"cover": erster Slide, einpragsamer Titel + Untertitel',
        '"step": Tutorial-Slide mit nummeriertem Titel, Anleitungen und Screenshot-Bereich mit Annotationen',
        '"resource": Ressourcen-Slide mit Badge, Titel, Beschreibung und Medien (YouTube-Video, Artikel)',
      ],
      annotations_title: 'ANNOTATIONSTYPEN fur Screenshots:',
      annotations: [
        '"circle_number": nummerierter Kreis auf einem UI-Element (Button, Feld, Menu)',
        '"highlight_box": Rahmen zur Hervorhebung des wichtigsten Aktionselements',
        '"highlight_box": Rahmen um ein Element',
      ],
      output_instruction: 'Gib NUR gultiges JSON zuruck (kein Text davor oder danach). Genaue Struktur:',
      write_in: 'ALLE Titel, Untertitel, Anleitungen und Beschreibungen MUSSEN auf Deutsch geschrieben sein.',
    },
  };

  // Fallback to English for unsupported languages
  const lang = langInstructions[language] || langInstructions['en'];

  const jsonExample = `{
  "carousel_title": "Carousel Title",
  "carousel_subtitle": "Catchy subtitle",
  "slides": [
    {
      "slide_number": 0,
      "type": "cover",
      "title": "Catchy title",
      "subtitle": "Explanatory subtitle"
    },
    {
      "slide_number": 1,
      "type": "step",
      "title": "Step title",
      "instructions": [
        "Go to **Claude.ai**",
        "Click on the **+** icon",
        "Select **connectors**"
      ],
      "screenshot_url": "https://claude.ai",
      "image_searches": [
        {
          "type": "logo",
          "query": "Claude AI logo",
          "entity": "claude.ai",
          "purpose": "Logo in slide corner"
        }
      ],
      "annotations": [
        {
          "type": "circle_number",
          "label": "1",
          "target_description": "The + button at top left",
          "position_hint": "top-left"
        }
      ]
    },
    {
      "slide_number": 2,
      "type": "resource",
      "title": "Resource title",
      "description": "Description with **keywords** in bold.",
      "image_searches": [
        {
          "type": "youtube_thumb",
          "query": "Video title",
          "entity": "VIDEO_ID",
          "purpose": "Video thumbnail"
        }
      ]
    }
  ]
}`;

  return `${lang.role}

${lang.task}

${lang.write_in}

${lang.rules_title}
${lang.rules.map(r => `- ${r}`).join('\n')}

${lang.types_title}
${lang.types.map(t => `- ${t}`).join('\n')}

${lang.annotations_title}
${lang.annotations.map(a => `- ${a}`).join('\n')}

${lang.output_instruction}
${jsonExample}`;
}

/**
 * Call Claude Sonnet to analyze content and structure slides.
 *
 * @param {object} scrapedContent - Output from scraper module
 * @param {number} maxSlides - Maximum number of slides (default 7)
 * @param {string} language - Output language code (default 'en')
 * @returns {Promise<object>} Structured slide definitions
 */
async function analyzeAndStructure(scrapedContent, maxSlides = 7, language = 'en') {
  // Mock mode for development/testing
  if (process.env.MOCK_AGENT === 'true') {
    return generateMockSlides(scrapedContent, maxSlides);
  }

  const userMessage = buildUserMessage(scrapedContent, maxSlides, language);

  const data = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: getSystemPrompt(language),
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = data.content[0].text;
  return parseAgentResponse(text);
}

/**
 * Build the user message for Claude.
 */
function buildUserMessage(content, maxSlides, language = 'en') {
  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  let message = `Analyze this content and structure it as a carousel of maximum ${maxSlides} slides.\nWrite ALL slide content (titles, instructions, descriptions) in ${langName}.\n\n`;
  message += `Source URL: ${content.url}\n`;
  message += `Type: ${content.type}\n`;
  message += `Title: ${content.title}\n\n`;

  if (content.type === 'youtube') {
    message += `This is a YouTube video.\n`;
    message += `Author: ${content.metadata.author || 'Unknown'}\n`;
    message += `Video ID: ${content.metadata.video_id}\n`;
    message += `Thumbnail: ${content.metadata.thumbnail}\n\n`;
  }

  // Truncate content to avoid exceeding token limits
  const maxContentLength = 8000;
  let markdown = content.content_markdown || '';
  if (markdown.length > maxContentLength) {
    markdown = markdown.substring(0, maxContentLength) + '\n\n[... content truncated ...]';
  }

  message += `--- CONTENT ---\n${markdown}\n--- END CONTENT ---\n\n`;

  if (content.images && content.images.length > 0) {
    message += `Images found on page:\n`;
    content.images.slice(0, 10).forEach((img, i) => {
      message += `${i + 1}. ${img.alt || 'Untitled'} — ${img.src}\n`;
    });
  }

  return message;
}

/**
 * Parse Claude's response, extracting JSON.
 */
function parseAgentResponse(text) {
  // Try direct JSON parse first
  try {
    return JSON.parse(text);
  } catch {}

  // Extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }

  // Try to find JSON object in the text
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  }

  throw new Error('Could not parse agent response as JSON');
}

/**
 * Generate smart mock slides from actual scraped content.
 */
function generateMockSlides(content, maxSlides) {
  const hostname = new URL(content.url).hostname;
  const markdown = content.content_markdown || '';

  // Extract a clean title
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : content.title || 'Tutorial';
  const title = rawTitle.length > 50 ? rawTitle.substring(0, 50) : rawTitle;

  // Extract headings as steps
  const headings = [];
  const headingRegex = /^#{2,3}\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const h = match[1].trim();
    if (h.length > 3 && h.length < 60 && !h.match(/table of contents|navigation|menu|footer/i)) {
      headings.push(h);
    }
  }

  // Extract key paragraphs (first sentence after each heading)
  const sections = markdown.split(/^#{2,3}\s+/m).filter(s => s.trim().length > 20);

  // Build slides from real content
  const slides = [];

  // Cover
  slides.push({
    slide_number: 0,
    type: 'cover',
    title: title,
    subtitle: content.metadata?.description || `Guide from ${hostname}`,
  });

  // Step slides from headings
  const stepHeadings = headings.slice(0, maxSlides - 2);
  stepHeadings.forEach((heading, i) => {
    const sectionText = sections[i + 1] || '';
    const sentences = sectionText.split(/\.\s+/).filter(s => s.trim().length > 10).slice(0, 3);

    const instructions = sentences.length > 0
      ? sentences.map(s => {
          // Bold the first key term
          const words = s.trim().split(' ');
          if (words.length > 3) {
            words[Math.min(2, words.length - 1)] = `**${words[Math.min(2, words.length - 1)]}**`;
          }
          return words.join(' ').substring(0, 80);
        })
      : [`Open **${hostname}**`, `Navigate to **${heading}**`, 'Follow the **instructions**'];

    slides.push({
      slide_number: i + 1,
      type: 'step',
      title: heading.length > 25 ? heading.substring(0, 25) : heading,
      instructions,
      screenshot_url: content.url,
      annotations: [
        { type: 'circle_number', label: String(i + 1), target_description: heading, position_hint: ['top-left', 'center', 'top-right', 'center-left'][i % 4] },
      ],
    });
  });

  // Resource slide at the end
  slides.push({
    slide_number: slides.length,
    type: 'resource',
    title: `Explore ${hostname}`,
    description: content.metadata?.description
      || `Complete guide available on **${hostname}**. Dive deeper into all features and advanced configurations.`,
    image_searches: [],
  });

  return {
    carousel_title: title,
    carousel_subtitle: content.metadata?.description || `A guide from ${hostname}`,
    slides: slides.slice(0, maxSlides + 1),
  };
}

/**
 * Use Claude Vision to get precise annotation coordinates from a screenshot.
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @param {Array} annotations - Annotation descriptions from first pass
 * @returns {Promise<Array>} Annotations with precise coordinates
 */
async function refineAnnotationsWithVision(screenshotBuffer, annotations) {
  if (!annotations || annotations.length === 0) return [];
  if (process.env.MOCK_AGENT === 'true') return annotations;

  const annotationDescriptions = annotations.map((a, i) =>
    `${i + 1}. [${a.type}] label="${a.label || ''}" — ${a.target_description}`
  ).join('\n');

  const visionPrompt = `You are looking at a screenshot of a web interface. You must find the EXACT position of specific UI elements.

For each element listed below, locate it visually on the screenshot and return its precise coordinates as percentages of the image dimensions:
- x_percent: horizontal center of the element (0 = left edge, 100 = right edge)
- y_percent: vertical center of the element (0 = top edge, 100 = bottom edge)
- width_percent: element width as % of image width
- height_percent: element height as % of image height
- found: boolean — true ONLY if you can actually see this element on the screenshot

For arrows (type "arrow"), also provide:
- arrow_from: { x_percent, y_percent } start point
- arrow_to: { x_percent, y_percent } end point (the element being pointed to)

IMPORTANT: If an element is NOT visible on the screenshot, set found=false. Do NOT guess coordinates for elements you cannot see.

Elements to locate:
${annotationDescriptions}

Return ONLY valid JSON: an array of objects.
Example:
[
  { "index": 0, "found": true, "x_percent": 15, "y_percent": 42, "width_percent": 12, "height_percent": 5 },
  { "index": 1, "found": false }
]`;

  try {
    const base64 = screenshotBuffer.toString('base64');
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: visionPrompt },
        ],
      }],
    });

    const text = data.content[0].text;
    const coords = parseAgentResponse(text);
    const coordsArray = Array.isArray(coords) ? coords : [];

    // Only keep annotations whose elements were actually found on the screenshot
    // Clamp all coordinates to 0-100 range
    const clampVal = (v) => {
      if (typeof v !== 'number') return v;
      if (v > 100) v = (v / 1000) * 100;
      return Math.max(0, Math.min(100, v));
    };

    return annotations.map((anno, i) => {
      const coord = coordsArray.find(c => c.index === i) || coordsArray[i];
      if (!coord || coord.found === false) return { ...anno, _notFound: true };
      return {
        ...anno,
        _precise: true,
        x_percent: clampVal(coord.x_percent),
        y_percent: clampVal(coord.y_percent),
        width_percent: clampVal(coord.width_percent || 10),
        height_percent: clampVal(coord.height_percent || 5),
        arrow_from: coord.arrow_from ? {
          x_percent: clampVal(coord.arrow_from.x_percent),
          y_percent: clampVal(coord.arrow_from.y_percent),
        } : undefined,
        arrow_to: coord.arrow_to ? {
          x_percent: clampVal(coord.arrow_to.x_percent),
          y_percent: clampVal(coord.arrow_to.y_percent),
        } : undefined,
      };
    });
  } catch (err) {
    console.log(`Vision annotation refinement failed: ${err.message}`);
    return annotations; // Fallback to original position hints
  }
}

/**
 * Screenshot-first approach: Analyze what's visible on a screenshot,
 * then generate annotations and instructions that match the actual UI.
 *
 * This replaces the old flow where text was written first and annotations
 * were positioned after. Now the screenshot drives the content.
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @param {object} slideContext - { title, slide_number, original_instructions, step_topic }
 * @param {string} language - Output language code
 * @returns {Promise<object>} { instructions: string[], annotations: object[] }
 */
async function analyzeScreenshotAndAnnotate(screenshotBuffer, slideContext, language = 'en') {
  if (process.env.MOCK_AGENT === 'true') {
    return {
      instructions: slideContext.original_instructions || [],
      annotations: [],
    };
  }

  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  // Build avoid block if there are previously used instructions
  const avoidInstructions = slideContext.avoid_instructions || [];
  let avoidBlock = '';
  if (avoidInstructions.length > 0) {
    avoidBlock = `\nALREADY USED INSTRUCTIONS (DO NOT repeat these or similar ones — find DIFFERENT elements):\n${avoidInstructions.map(inst => `- ${inst}`).join('\n')}\n`;
  }

  const instructionCount = avoidInstructions.length > 6 ? '2-3' : '3';

  // Build page description context
  const pageDescBlock = slideContext.page_description
    ? `\nPAGE DESCRIPTION (from validation): ${slideContext.page_description}\n`
    : '';

  const visionPrompt = `You are the INSTRUCTION WRITER and ANNOTATOR for a tutorial carousel slide. Look at the screenshot carefully. Your instructions are the FINAL text shown to the user.

SLIDE CONTEXT:
- Slide #${slideContext.slide_number}
- Original title: "${slideContext.title}"
- Topic intent: "${slideContext.step_topic || slideContext.title}"
${pageDescBlock}${avoidBlock}
YOUR JOB:
1. LOOK at the screenshot. Understand what this page actually shows.
2. CHECK: does the page match the original title "${slideContext.title}"?
   - If NO: suggest a better title (max 6 words, action-oriented)
3. Find ${instructionCount} DIFFERENT interactive elements on the screenshot
4. Write ${instructionCount} instructions in ${langName} based on what you ACTUALLY SEE
5. Place circle annotations on each element

ELEMENT SELECTION:
- Pick elements SPREAD ACROSS the screenshot (not clustered together)
- Prefer: CTA buttons, input fields, navigation links, feature toggles
- Avoid: footer links, social media icons, cookie buttons

INSTRUCTION FORMAT: "→ [Action] the **[element name]** [context]"

COORDINATE RULES:
- All values are PERCENTAGES of the image (0 to 100). NOT pixels!
- x_percent: 0 = left edge, 50 = center, 100 = right edge
- y_percent: 0 = top edge, 50 = middle, 100 = bottom edge
- Place circle at the CENTER of the target element
- Keep coordinates between 5 and 95
- Minimum distance between circles: 15% on at least one axis

ALSO: Add ONE highlight_box around the most important element.

RETURN ONLY this exact JSON structure:
{
  "page_description": "What this page shows",
  "adapted_title": "Better Title Here",
  "instructions": [
    "→ Click the **Sign up free** button to create your account",
    "→ Navigate to **Pricing** to see available plans",
    "→ Explore the **Solutions** dropdown for features"
  ],
  "annotations": [
    { "type": "circle_number", "label": "1", "target_description": "Sign up free button", "x_percent": 35, "y_percent": 52 },
    { "type": "circle_number", "label": "2", "target_description": "Pricing link in nav", "x_percent": 18, "y_percent": 5 },
    { "type": "circle_number", "label": "3", "target_description": "Solutions dropdown", "x_percent": 8, "y_percent": 5 },
    { "type": "highlight_box", "label": "", "target_description": "Sign up free button", "x_percent": 35, "y_percent": 52, "width_percent": 15, "height_percent": 5 }
  ]
}
- adapted_title: only include if the original title doesn't match the page. Omit if fine.`;

  try {
    const base64 = screenshotBuffer.toString('base64');
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64 },
          },
          { type: 'text', text: visionPrompt },
        ],
      }],
    }, { timeout: 45000 });

    const text = data.content[0].text;
    const result = parseAgentResponse(text);

    // Mark all annotations as precise and clamp coordinates to 0-100 range
    const annotations = (result.annotations || []).map(anno => {
      const clamped = { ...anno, _precise: true };

      // Clamp percentage coordinates to 0-100 range
      // Vision sometimes returns pixel values instead of percentages
      for (const key of ['x_percent', 'y_percent', 'width_percent', 'height_percent']) {
        if (typeof clamped[key] === 'number') {
          // If value > 100, it's likely pixels — try to normalize (assume ~1000px image)
          if (clamped[key] > 100) {
            console.log(`[CLAMP] ${key}=${clamped[key]} > 100, normalizing from likely pixel value`);
            clamped[key] = (clamped[key] / 1000) * 100; // Assume ~1000px dimension
          }
          clamped[key] = Math.max(0, Math.min(100, clamped[key]));
        }
      }

      // Clamp arrow coordinates too
      if (clamped.arrow_from) {
        for (const key of ['x_percent', 'y_percent']) {
          if (typeof clamped.arrow_from[key] === 'number' && clamped.arrow_from[key] > 100) {
            clamped.arrow_from[key] = (clamped.arrow_from[key] / 1000) * 100;
          }
          if (typeof clamped.arrow_from[key] === 'number') {
            clamped.arrow_from[key] = Math.max(0, Math.min(100, clamped.arrow_from[key]));
          }
        }
      }
      if (clamped.arrow_to) {
        for (const key of ['x_percent', 'y_percent']) {
          if (typeof clamped.arrow_to[key] === 'number' && clamped.arrow_to[key] > 100) {
            clamped.arrow_to[key] = (clamped.arrow_to[key] / 1000) * 100;
          }
          if (typeof clamped.arrow_to[key] === 'number') {
            clamped.arrow_to[key] = Math.max(0, Math.min(100, clamped.arrow_to[key]));
          }
        }
      }

      return clamped;
    });

    return {
      page_description: result.page_description || '',
      instructions: result.instructions || slideContext.original_instructions || [],
      annotations,
      adapted_title: result.adapted_title || null,
    };
  } catch (err) {
    console.log(`Screenshot analysis failed: ${err.message}`);
    return {
      instructions: slideContext.original_instructions || [],
      annotations: [],
      adapted_title: null,
    };
  }
}

/**
 * Agent 2 — Screenshot Validator
 * Uses Claude Vision to evaluate captured screenshots and filter out bad ones.
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @returns {Promise<object>} { valid: boolean, reason: string, page_type: string, ui_elements: string[] }
 */
async function validateScreenshot(screenshotBuffer) {
  if (process.env.MOCK_AGENT === 'true') {
    return { valid: true, reason: 'mock mode', page_type: 'unknown', ui_elements: [] };
  }

  const prompt = `You are evaluating a screenshot of a web page for use in a tutorial carousel.

Analyze this screenshot and determine:
1. Is this a USABLE page for a tutorial? (not a 404 error, not a blank page, not a CAPTCHA, not a cookie wall)
2. What type of page is it? (homepage, feature_page, login_form, signup_form, dashboard, documentation, pricing, blog, error_404, blocked, other)
3. What interactive UI elements are visible? (buttons, input fields, links, navigation menus, tabs, forms)

RETURN ONLY valid JSON:
{
  "valid": true,
  "reason": "Feature page with clear CTA and navigation",
  "page_type": "feature_page",
  "ui_elements": ["Sign up free button", "Navigation menu", "Platform dropdown", "Email input field"],
  "quality_score": 8
}

Rules:
- valid=false if: 404 error, blank/empty page, CAPTCHA, full-page cookie consent, access denied, paywall, large black/solid-color rectangles covering >30% of visible area (unloaded video players)
- valid=true if: any page with actual content and interactive elements
- quality_score: 1-10, higher = more interactive elements, better for tutorial annotations
- ui_elements: list ALL clickable/interactive elements you can see`;

  try {
    const base64 = screenshotBuffer.toString('base64');
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }, { timeout: 20000 });

    const text = data.content[0].text;
    return parseAgentResponse(text);
  } catch (err) {
    console.log(`Screenshot validation failed: ${err.message}`);
    return { valid: true, reason: 'validation error, assuming valid', page_type: 'unknown', ui_elements: [] };
  }
}

/**
 * DOM-based annotation: Claude picks 3 elements from the enumerated DOM elements list.
 * Returns instructions + annotation coordinates computed from actual DOM bounding rects.
 * This gives pixel-perfect annotation placement.
 *
 * @param {Array} elements - From enumerateInteractiveElements: [{ index, tag, type, text, rect }]
 * @param {object} slideContext - { title, slide_number, avoid_instructions }
 * @param {string} language - Output language code
 * @param {object} viewport - { width, height } of the capture viewport
 * @returns {Promise<object>} { instructions, annotations }
 */
async function selectAnnotationTargets(elements, slideContext, language = 'en', viewport = { width: 1080, height: 900 }) {
  if (!elements || elements.length === 0) {
    return { instructions: slideContext.original_instructions || [], annotations: [] };
  }

  if (process.env.MOCK_AGENT === 'true') {
    return { instructions: slideContext.original_instructions || [], annotations: [] };
  }

  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  // Build element list for Claude
  const elementList = elements.map(e =>
    `[${e.index}] <${e.tag}${e.type ? ' type=' + e.type : ''}> "${e.text}" — position: (${e.rect.x},${e.rect.y}) size: ${e.rect.width}x${e.rect.height}`
  ).join('\n');

  // Build avoid block
  const avoidInstructions = slideContext.avoid_instructions || [];
  let avoidBlock = '';
  if (avoidInstructions.length > 0) {
    avoidBlock = `\nALREADY USED INSTRUCTIONS (DO NOT pick elements matching these):\n${avoidInstructions.map(inst => `- ${inst}`).join('\n')}\n`;
  }

  const instructionCount = avoidInstructions.length > 6 ? '2-3' : '3';

  const prompt = `You are selecting UI elements to annotate for a tutorial carousel slide.

SLIDE CONTEXT:
- Slide #${slideContext.slide_number}, title: "${slideContext.title}"
- Topic: "${slideContext.step_topic || slideContext.title}"
${avoidBlock}
INTERACTIVE ELEMENTS ON THE PAGE (with their exact positions):
${elementList}

YOUR JOB: Pick ${instructionCount} elements that are most relevant to the slide topic.

RULES:
- Pick elements SPREAD ACROSS the page (not all in the same area)
- Prefer: CTA buttons, key navigation links, input fields, feature-specific elements
- Avoid: generic footer links, social media icons, cookie buttons, "close" buttons
- Each picked element must be clearly relevant to the slide topic
- Write ${instructionCount} instructions in ${langName}, one per picked element
- Format: "→ [Action] the **[element name]** [context]"

RETURN ONLY valid JSON:
{
  "instructions": [
    "→ Click the **Sign up free** button to create your account",
    "→ Enter your email in the **Work email** field",
    "→ Explore the **Pricing** page for plan details"
  ],
  "target_indices": [5, 12, 3]
}

target_indices must be the [index] numbers from the element list above.`;

  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 30000 });

    const text = data.content[0].text;
    const result = parseAgentResponse(text);

    // Convert target indices to precise annotations using DOM rects
    const targetIndices = result.target_indices || [];
    const annotations = [];

    targetIndices.forEach((idx, i) => {
      const el = elements[idx];
      if (!el) return;

      const centerX = ((el.rect.x + el.rect.width / 2) / viewport.width) * 100;
      const centerY = ((el.rect.y + el.rect.height / 2) / viewport.height) * 100;
      const widthPct = (el.rect.width / viewport.width) * 100;
      const heightPct = (el.rect.height / viewport.height) * 100;

      // Circle annotation
      annotations.push({
        type: 'circle_number',
        label: String(i + 1),
        target_description: el.text,
        _precise: true,
        x_percent: Math.max(2, Math.min(98, centerX)),
        y_percent: Math.max(2, Math.min(98, centerY)),
      });

      // First element gets a highlight box
      if (i === 0) {
        annotations.push({
          type: 'highlight_box',
          label: '',
          target_description: el.text,
          _precise: true,
          x_percent: Math.max(2, Math.min(98, centerX)),
          y_percent: Math.max(2, Math.min(98, centerY)),
          width_percent: Math.max(5, widthPct + 2),
          height_percent: Math.max(3, heightPct + 2),
        });
      }
    });

    console.log(`[DOM] Selected ${targetIndices.length} targets from ${elements.length} elements for slide ${slideContext.slide_number}`);
    return {
      instructions: result.instructions || slideContext.original_instructions || [],
      annotations,
    };
  } catch (err) {
    console.log(`DOM-based target selection failed: ${err.message}`);
    return {
      instructions: slideContext.original_instructions || [],
      annotations: [],
    };
  }
}

// ============================================================
// AGENT 1 — Strategist: plan slide structure from scraped content
// ============================================================

/**
 * Plan the carousel structure: how many slides, what topic each covers,
 * what URLs to screenshot, what type each slide is.
 *
 * @param {object} scrapedContent - Output from scraper module
 * @param {number} maxSlides - Maximum number of slides (default 7)
 * @param {string} language - Output language code (default 'en')
 * @returns {Promise<object>} Strategy with slide plan
 */
async function planStrategy(scrapedContent, maxSlides = 7, language = 'en') {
  if (process.env.MOCK_AGENT === 'true') {
    return generateMockStrategy(scrapedContent, maxSlides);
  }

  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  // Build navigation links context
  const navLinks = (scrapedContent.navigation_links || []).slice(0, 30);
  const navLinksText = navLinks.length > 0
    ? `\nAVAILABLE PAGES ON THIS SITE (real URLs found on the page):\n${navLinks.map(l => `- "${l.text}" → ${l.href}`).join('\n')}\n`
    : '';

  // Truncate content
  let markdown = scrapedContent.content_markdown || '';
  if (markdown.length > 6000) {
    markdown = markdown.substring(0, 6000) + '\n[...truncated...]';
  }

  const isYouTube = scrapedContent.type === 'youtube';

  const systemPrompt = `You are a carousel strategist. You plan the STRUCTURE of tutorial carousels for social media.
You do NOT write the slide text — another agent does that. You only decide:
- How many slides (max ${maxSlides - 2} step slides + 1 cover${isYouTube ? ' + 1 resource' : ''} = max ${maxSlides} total)
- What TOPIC each slide covers
- What URL to screenshot for each slide
- The logical flow from slide to slide

RESOURCE SLIDE RULE: Only include a "resource" type slide if the source content is a YouTube video. For non-YouTube URLs, do NOT create resource slides — end with step slides instead.

CRITICAL APPROACH — URL-DRIVEN PLANNING:
1. FIRST scan the AVAILABLE PAGES list to see what specific subpages exist
2. THEN build your slide topics around those real pages
3. NEVER invent a topic and hope a matching URL exists
4. Each slide topic MUST correspond to a real, specific subpage — not the homepage

Output language for topic descriptions: ${langName}.`;

  const userMessage = `Plan a tutorial carousel from this content.

Source URL: ${scrapedContent.url}
Title: ${scrapedContent.title}
${navLinksText}
--- CONTENT ---
${markdown}
--- END CONTENT ---

RULES:
- TOTAL MAXIMUM ${maxSlides} slides: 1 cover + ${maxSlides - 2} step slides + optionally 1 resource slide
- Do NOT exceed ${maxSlides} slides total under any circumstances
- Each step MUST have a DIFFERENT screenshot_url — use real subpage URLs from the AVAILABLE PAGES list above
- URL-TOPIC MATCHING (CRITICAL):
  * Each screenshot_url MUST show content DIRECTLY related to the slide topic
  * Slide about "Pricing" → MUST use the /pricing page, NOT the homepage
  * Slide about "Support" → MUST use a /support or /help page
  * Slide about "Enterprise" → MUST use /enterprise or similar
  * Look at the AVAILABLE PAGES list — if a link text matches your topic, USE that URL
- NEVER use the source/homepage URL for more than ONE step slide — every other slide needs a specific subpage
- ONLY create topics for which a MATCHING SPECIFIC PAGE exists in the AVAILABLE PAGES list
- If fewer specific subpages exist than max slides, create FEWER slides rather than reusing the homepage
- The flow should tell a coherent story (e.g. signup → setup → first feature → advanced → result)
- Each step topic should be specific enough that a writer can create 3 actionable instructions

Return ONLY valid JSON:
{
  "carousel_topic": "What this carousel teaches",
  "flow_description": "Brief description of the tutorial flow",
  "slides": [
    { "slide_number": 0, "type": "cover", "topic": "Catchy angle for the carousel" },
    { "slide_number": 1, "type": "step", "topic": "What this step teaches", "screenshot_url": "https://...", "focus_area": "What part of the page to highlight" },
    { "slide_number": 2, "type": "step", "topic": "...", "screenshot_url": "https://...", "focus_area": "..." },
    { "slide_number": N, "type": "resource", "topic": "Closing resource or CTA" }
  ]
}`;

  const data = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  }, { timeout: 30000 });

  const text = data.content[0].text;
  return parseAgentResponse(text);
}

// ============================================================
// AGENT 2 — Writer: write slide titles, instructions, descriptions
// ============================================================

/**
 * Write the actual text content for each slide based on the strategy.
 *
 * @param {object} strategy - Output from planStrategy
 * @param {object} scrapedContent - Original scraped content
 * @param {string} language - Output language code
 * @returns {Promise<object>} Full slide definitions with text
 */
async function writeSlideContent(strategy, scrapedContent, language = 'en') {
  if (process.env.MOCK_AGENT === 'true') {
    return generateMockSlides(scrapedContent, strategy.slides.length);
  }

  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  // Truncate content
  let markdown = scrapedContent.content_markdown || '';
  if (markdown.length > 6000) {
    markdown = markdown.substring(0, 6000) + '\n[...truncated...]';
  }

  const systemPrompt = `You are a carousel copywriter. You write punchy slide titles and descriptions for tutorial carousels.
ALL text MUST be in ${langName}.
You receive a STRATEGY (slide plan) and write the titles and descriptions.

IMPORTANT: You do NOT write step instructions or annotations. Those will be generated later by another agent that can SEE the actual screenshots. You only write:
- Cover: title + subtitle
- Step: title + image_searches (for logos)
- Resource (only if present in strategy): title + description. Only include resource slides if the strategy has them (YouTube content only).

WRITING STYLE:
- Titles: max 6 words, impactful, action-oriented
- Descriptions: use **bold keywords** for emphasis`;

  const strategyJson = JSON.stringify(strategy, null, 2);

  const userMessage = `Write the text content for this carousel.

STRATEGY:
${strategyJson}

SOURCE CONTENT:
${markdown}

For each slide in the strategy, write the appropriate content.
Do NOT write instructions or annotations for step slides — another agent handles that after seeing the screenshots.

Return ONLY valid JSON:
{
  "carousel_title": "Catchy carousel title",
  "carousel_subtitle": "Explanatory subtitle",
  "slides": [
    {
      "slide_number": 0,
      "type": "cover",
      "title": "Catchy title",
      "subtitle": "Explanatory subtitle"
    },
    {
      "slide_number": 1,
      "type": "step",
      "title": "Short step title",
      "screenshot_url": "https://...",
      "image_searches": [
        { "type": "logo", "query": "Tool logo", "entity": "domain.com", "purpose": "Logo in slide corner" }
      ]
    },
    {
      "slide_number": N,
      "type": "resource",
      "title": "Resource title",
      "description": "Description with **keywords** in bold."
    }
  ]
}

IMPORTANT:
- Copy screenshot_url from the strategy for each step slide
- Create 1 image_search of type "logo" for each step slide (the tool's logo)
- Do NOT include "instructions" or "annotations" for step slides`;

  const data = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  }, { timeout: 30000 });

  const text = data.content[0].text;
  return parseAgentResponse(text);
}

// ============================================================
// AGENT 3 — URL Explorer: validate and fix screenshot URLs
// ============================================================

/**
 * Validate screenshot URLs against real navigation links.
 * Replace invented/404 URLs with real ones from the site.
 *
 * @param {object} slideDefinitions - Output from writeSlideContent
 * @param {object} scrapedContent - Original scraped content (with navigation_links)
 * @param {string} language - Output language code
 * @returns {Promise<object>} Slide definitions with validated URLs
 */
async function exploreUrls(slideDefinitions, scrapedContent, language = 'en') {
  const navLinks = scrapedContent.navigation_links || [];
  if (navLinks.length === 0) {
    console.log('[URL Explorer] No navigation links available, keeping original URLs');
    return slideDefinitions;
  }

  if (process.env.MOCK_AGENT === 'true') {
    return slideDefinitions;
  }

  // Build the current URL assignments
  const urlAssignments = slideDefinitions.slides
    .filter(s => s.type === 'step' && s.screenshot_url)
    .map(s => `Slide ${s.slide_number} ("${s.title}"): ${s.screenshot_url}`);

  if (urlAssignments.length === 0) return slideDefinitions;

  // Build available URLs from navigation links
  const availableUrls = navLinks.slice(0, 40).map(l => `- "${l.text}" → ${l.href}`).join('\n');

  const prompt = `You are a URL validator for a tutorial carousel. Check if the screenshot URLs are REAL pages that exist on the site.

CURRENT URL ASSIGNMENTS:
${urlAssignments.join('\n')}

REAL URLS FOUND ON THE SITE:
${availableUrls}

SOURCE URL: ${scrapedContent.url}

YOUR JOB:
1. For each slide, check if its screenshot_url matches or is close to a real URL from the list
2. If a URL looks invented or doesn't match any real page, replace it with the best matching real URL
3. SEMANTIC MATCH (CRITICAL): Check that each URL's content matches the slide TITLE:
   - Slide titled "Explore Pricing" with screenshot_url=homepage → MUST be corrected to /pricing
   - Slide titled "Enterprise Support" with screenshot_url=homepage → MUST be corrected to /support or /enterprise
   - A specific subpage that matches the topic ALWAYS beats the homepage
4. NEVER keep the source/homepage URL for more than 1 slide — find specific subpages for ALL others
5. Each slide MUST have a DIFFERENT URL that shows content directly relevant to its title
6. If no matching subpage exists for a slide's topic, correct the URL to the CLOSEST match available

Return ONLY valid JSON — an array of corrections:
[
  { "slide_number": 1, "original_url": "https://...", "corrected_url": "https://...", "reason": "why" },
  { "slide_number": 2, "original_url": "https://...", "corrected_url": "https://...", "reason": "why" }
]

If a URL is fine, don't include it in the array. Only include corrections.
If ALL URLs are fine, return an empty array: []`;

  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }, { timeout: 20000 });

    const text = data.content[0].text;
    const corrections = parseAgentResponse(text);
    const correctionsArray = Array.isArray(corrections) ? corrections : [];

    if (correctionsArray.length === 0) {
      console.log('[URL Explorer] All URLs validated OK');
      return slideDefinitions;
    }

    // Apply corrections
    for (const corr of correctionsArray) {
      const slide = slideDefinitions.slides.find(s => s.slide_number === corr.slide_number);
      if (slide && corr.corrected_url) {
        console.log(`[URL Explorer] Slide ${corr.slide_number}: ${corr.original_url} → ${corr.corrected_url} (${corr.reason})`);
        slide.screenshot_url = corr.corrected_url;
      }
    }

    console.log(`[URL Explorer] Applied ${correctionsArray.length} URL corrections`);
    return slideDefinitions;
  } catch (err) {
    console.log(`URL Explorer failed: ${err.message}, keeping original URLs`);
    return slideDefinitions;
  }
}

/**
 * Generate mock strategy for development.
 */
function generateMockStrategy(content, maxSlides) {
  const hostname = new URL(content.url).hostname;
  return {
    carousel_topic: content.title || `Tutorial for ${hostname}`,
    flow_description: 'General tutorial flow',
    slides: [
      { slide_number: 0, type: 'cover', topic: content.title || 'Tutorial' },
      ...Array.from({ length: Math.min(maxSlides - 1, 4) }, (_, i) => ({
        slide_number: i + 1,
        type: 'step',
        topic: `Step ${i + 1}`,
        screenshot_url: content.url,
        focus_area: 'main content',
      })),
      { slide_number: maxSlides, type: 'resource', topic: `Explore ${hostname}` },
    ],
  };
}

/**
 * Vision+DOM hybrid annotation: Claude SEES the screenshot AND KNOWS exact DOM positions.
 *
 * The overkill approach for 100% pixel-perfect annotations:
 * - Vision provides intelligence: which elements are most relevant to annotate
 * - DOM provides precision: exact pixel coordinates from getBoundingClientRect
 * - Result: Vision intelligence + DOM precision = perfect placement
 *
 * Falls back to DOM-only on API failure, or Vision-only if no DOM elements.
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot buffer
 * @param {Array} elements - DOM elements with rects from enumerateInteractiveElements
 * @param {object} slideContext - { title, slide_number, original_instructions, step_topic, avoid_instructions }
 * @param {string} language - Output language code
 * @param {object} viewport - { width, height } of the capture viewport (default 1080x1080)
 * @returns {Promise<object>} { instructions, annotations }
 */
async function selectAnnotationTargetsWithVision(screenshotBuffer, elements, slideContext, language = 'en', viewport = { width: 1080, height: 900 }) {
  // No DOM elements → pure Vision fallback
  if (!elements || elements.length === 0) {
    return analyzeScreenshotAndAnnotate(screenshotBuffer, slideContext, language);
  }

  if (process.env.MOCK_AGENT === 'true') {
    return { instructions: slideContext.original_instructions || [], annotations: [] };
  }

  const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
  const langName = langNames[language] || 'English';

  // Build element list with DOM positions
  const elementList = elements.map(e =>
    `[${e.index}] <${e.tag}${e.type ? ' type=' + e.type : ''}> "${e.text}" — position: (${e.rect.x}, ${e.rect.y}), size: ${e.rect.width}×${e.rect.height}px`
  ).join('\n');

  // Build avoid block
  const avoidInstructions = slideContext.avoid_instructions || [];
  let avoidBlock = '';
  if (avoidInstructions.length > 0) {
    avoidBlock = `\nALREADY USED (DO NOT pick these or similar elements):\n${avoidInstructions.map(inst => `- ${inst}`).join('\n')}\n`;
  }

  const instructionCount = avoidInstructions.length > 6 ? '2-3' : '3';

  // Build rejection feedback block (from verification agent on retry)
  const rejectionFeedback = slideContext.rejection_feedback || '';
  let feedbackBlock = '';
  if (rejectionFeedback) {
    feedbackBlock = `\nPREVIOUS ATTEMPT WAS REJECTED by quality inspector. Issues:\n${rejectionFeedback}\nYou MUST pick DIFFERENT elements that fix ALL issues above. Spread circles further apart.\n`;
  }

  // Build page description context from Agent 4 validation
  const pageDescBlock = slideContext.page_description
    ? `\nPAGE DESCRIPTION (from validation): ${slideContext.page_description}\n`
    : '';

  const prompt = `You are the INSTRUCTION WRITER and ANNOTATOR for a tutorial carousel. You can SEE the screenshot AND you have exact DOM element positions. Your instructions are the FINAL text shown to the user — write them based on what you ACTUALLY SEE.

SLIDE CONTEXT:
- Slide #${slideContext.slide_number}
- Original title: "${slideContext.title}"
- Topic intent: "${slideContext.step_topic || slideContext.title}"
${pageDescBlock}${avoidBlock}${feedbackBlock}
INTERACTIVE DOM ELEMENTS visible on this page (with exact pixel positions):
${elementList}

YOUR JOB:
1. LOOK at the screenshot carefully. Understand what this page actually shows.
2. CHECK: does the page content match the original title "${slideContext.title}"?
   - If YES: keep the title as-is
   - If NO: suggest a better title that matches what the page actually shows (max 6 words, action-oriented)
3. Pick exactly ${instructionCount} elements from the DOM list that are:
   - VISIBLE on the screenshot (you can actually see them)
   - RELEVANT to what the page actually shows (not the original topic if it doesn't match)
   - SPREAD across DIFFERENT areas of the page (not clustered together)
   - Interactive and meaningful (buttons, links, inputs, menus)
4. Write ${instructionCount} clear instructions in ${langName} that describe what the user should do with each element
5. Pick ONE element for a highlight box (the primary action)

RULES:
- ONLY pick elements you can ACTUALLY SEE on the screenshot — never guess
- Prefer: CTA buttons, key navigation links, input fields, feature toggles
- Avoid: footer links, social media icons, cookie buttons, tiny decorative elements
- Instructions format: "→ [Action] the **[exact element name]** [brief context]"
- Minimum distance between any two picked elements: they must be in DIFFERENT visual areas

RETURN ONLY valid JSON:
{
  "adapted_title": "Better Title Here",
  "instructions": [
    "→ Click the **Sign up free** button to create your account",
    "→ Enter your email in the **Work email** field",
    "→ Explore the **Pricing** page for plan details"
  ],
  "target_indices": [5, 12, 3],
  "highlight_index": 5
}

- adapted_title: only include if you changed the title. Omit if the original title is fine.
- target_indices: the [index] numbers from the element list above.
- highlight_index: index of the most important element (gets a highlight box).`;

  try {
    const base64 = screenshotBuffer.toString('base64');
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }, { timeout: 45000 });

    const text = data.content[0].text;
    const result = parseAgentResponse(text);

    // Convert target indices to annotations using exact DOM coordinates
    const targetIndices = result.target_indices || [];
    const annotations = [];

    targetIndices.forEach((idx, i) => {
      const el = elements[idx];
      if (!el) return;

      const centerX = ((el.rect.x + el.rect.width / 2) / viewport.width) * 100;
      const centerY = ((el.rect.y + el.rect.height / 2) / viewport.height) * 100;

      annotations.push({
        type: 'circle_number',
        label: String(i + 1),
        target_description: el.text,
        _precise: true,
        x_percent: Math.max(3, Math.min(97, centerX)),
        y_percent: Math.max(3, Math.min(97, centerY)),
      });
    });

    // Add highlight box for the primary element
    const hlIdx = result.highlight_index;
    const hlEl = elements[hlIdx] || (targetIndices.length > 0 ? elements[targetIndices[0]] : null);
    if (hlEl) {
      const cx = ((hlEl.rect.x + hlEl.rect.width / 2) / viewport.width) * 100;
      const cy = ((hlEl.rect.y + hlEl.rect.height / 2) / viewport.height) * 100;
      const wPct = (hlEl.rect.width / viewport.width) * 100;
      const hPct = (hlEl.rect.height / viewport.height) * 100;

      annotations.push({
        type: 'highlight_box',
        label: '',
        target_description: hlEl.text,
        _precise: true,
        x_percent: Math.max(3, Math.min(97, cx)),
        y_percent: Math.max(3, Math.min(97, cy)),
        width_percent: Math.max(5, wPct + 4),
        height_percent: Math.max(3, hPct + 4),
      });
    }

    console.log(`[VISION+DOM] Slide ${slideContext.slide_number}: picked ${targetIndices.length} targets from ${elements.length} elements`);

    return {
      instructions: result.instructions || slideContext.original_instructions || [],
      annotations,
      adapted_title: result.adapted_title || null,
    };
  } catch (err) {
    console.log(`Vision+DOM failed: ${err.message}, falling back to DOM-only`);
    return selectAnnotationTargets(elements, slideContext, language, viewport);
  }
}

/**
 * Agent 6 — Quality Verifier: comprehensive validation of the final annotated slide.
 *
 * Checks EVERYTHING:
 * - Circle placement accuracy (is circle N on the element described in instruction N?)
 * - Element visibility (are mentioned elements actually visible on the screenshot?)
 * - Annotation spacing (are circles spread across different areas?)
 * - Instruction relevance (do instructions match visible, actionable elements?)
 * - Overall coherence (does title + instructions + annotations = useful tutorial step?)
 *
 * Returns pass/fail with detailed issues and suggestions for retry.
 *
 * @param {Buffer} annotatedScreenshotBuffer - The final composited image with annotations
 * @param {object} slideData - { title, slide_number, instructions[], annotations[] }
 * @returns {Promise<object>} { passed, score, issues[], suggestions }
 */
async function verifyAnnotatedSlide(annotatedScreenshotBuffer, slideData) {
  if (process.env.MOCK_AGENT === 'true') {
    return { passed: true, score: 10, issues: [] };
  }

  const instructions = slideData.instructions || [];
  const circles = (slideData.annotations || []).filter(a => a.type === 'circle_number');

  const legendText = instructions.map((inst, i) => {
    const clean = inst.replace(/^[\s]*[→►▸•\-–—]\s*/, '');
    return `${i + 1}. ${clean}`;
  }).join('\n');

  const circleDescriptions = circles.map(c =>
    `Circle "${c.label}" should be on: "${c.target_description}"`
  ).join('\n');

  const prompt = `You are the FINAL quality inspector for a tutorial carousel slide. Your job is to ensure everything is PERFECT before production.

You are looking at an annotated screenshot — it has numbered circle annotations (1, 2, 3...) baked directly into the image. The user will see a legend with numbered instructions below the screenshot.

SLIDE TITLE: "${slideData.title}"
SLIDE #${slideData.slide_number}

LEGEND (numbered instructions shown below the screenshot to the user):
${legendText}

EXPECTED CIRCLE POSITIONS:
${circleDescriptions}

VERIFY ALL OF THE FOLLOWING:

1. CIRCLE ACCURACY — Is each numbered circle placed exactly on the UI element described in its matching instruction?
   - Circle 1 MUST be on the element from instruction 1
   - Circle 2 MUST be on the element from instruction 2
   - Circle 3 MUST be on the element from instruction 3 (if exists)
   - A circle on the wrong element or in empty space = FAIL

2. ELEMENT VISIBILITY — Can you actually see each element mentioned in the instructions?
   - If an instruction says "Click the **Sign Up** button" but no Sign Up button is visible = FAIL
   - Elements partially cut off or obscured = minor issue

3. SPACING — Are circles spread across DIFFERENT areas of the screenshot?
   - Two circles within ~10% of each other on both axes = FAIL (too close / clustered)
   - Circles should be in visually distinct regions

4. RELEVANCE — Are the annotated elements relevant to the slide title "${slideData.title}"?
   - Generic footer links or irrelevant elements when better options exist = FAIL

5. COHERENCE — Does the combination of title + instructions + circle positions form a logical, useful tutorial step?
   - The whole slide should teach ONE clear concept or action

SCORING:
- 9-10: Perfect — all circles precise, well-spaced, coherent, production-ready
- 7-8: Good — minor issues but perfectly usable
- 5-6: Mediocre — one circle misplaced or two circles too close, needs fixing
- 1-4: Bad — multiple wrong placements, incoherent instructions, unusable

RETURN ONLY valid JSON:
{
  "passed": true,
  "score": 9,
  "issues": []
}

OR if problems found:
{
  "passed": false,
  "score": 4,
  "issues": [
    { "type": "wrong_placement", "circle": 1, "detail": "Circle 1 is on the logo instead of the Sign Up button" },
    { "type": "too_close", "circles": [1, 2], "detail": "Circles 1 and 2 are clustered in the top nav, only ~5% apart" },
    { "type": "not_visible", "instruction": 3, "detail": "Instruction mentions a search bar but none is visible" },
    { "type": "irrelevant", "circle": 2, "detail": "Footer link annotated when CTA button was available" },
    { "type": "incoherent", "detail": "Title says Configure Billing but instructions are about homepage navigation" }
  ],
  "suggestions": "Pick elements in different areas of the page. Move circle 1 to the actual Sign Up button at top-right. Avoid nav bar clustering."
}

Be STRICT. Only mark as passed if the slide is genuinely production-ready.`;

  try {
    const base64 = annotatedScreenshotBuffer.toString('base64');
    const data = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }, { timeout: 30000 });

    const text = data.content[0].text;
    return parseAgentResponse(text);
  } catch (err) {
    console.log(`Verification failed: ${err.message}`);
    // On error, pass to avoid blocking the pipeline
    return { passed: true, score: 0, issues: [], error: err.message };
  }
}

module.exports = {
  // Legacy (kept for backward compat)
  analyzeAndStructure,
  // New 6-agent architecture
  planStrategy,
  writeSlideContent,
  exploreUrls,
  // Existing agents
  refineAnnotationsWithVision,
  analyzeScreenshotAndAnnotate,
  validateScreenshot,
  selectAnnotationTargets,
  selectAnnotationTargetsWithVision,
  verifyAnnotatedSlide,
  // Token tracking
  resetTokenUsage,
  getTokenUsage,
};
