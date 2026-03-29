# AutoCarousel — Specification Fonctionnelle Complete

**Date :** 7 mars 2026
**Version :** 1.0
**Projet :** AutoCarousel — URL to Annotated Tutorial Images
**Contexte :** Hackathon Scrapes.ai x Hostinger ($2,000 de prix)
**Deadline :** 5 avril 2026
**Production :** https://autocarousel.glorics.com

---

## 1. VISION PRODUIT

AutoCarousel transforme **n'importe quelle URL** (article, documentation, video YouTube) en un **carousel de slides annotees** pret a publier sur LinkedIn, Instagram ou TikTok. Le pipeline est entierement automatise : l'utilisateur colle une URL, choisit la langue et le format, et recoit un ZIP de slides PNG en moins de 2 minutes.

**Proposition de valeur :** Creer manuellement un carousel de 7 slides annotees prend 30-60 minutes dans Canva. AutoCarousel le fait en ~90 secondes pour ~$0.05-0.15.

---

## 2. PIPELINE TECHNIQUE

```
URL
 │
 ▼
[1] SCRAPER ─────────── Steel.dev (cloud browser) → Jina Reader → Cheerio
 │                       YouTube → oEmbed API directement
 ▼
[2] AGENT IA (texte) ── Claude Sonnet 4 (claude-sonnet-4-20250514)
 │                       System prompt multi-langue (EN/FR/ES/DE)
 │                       Retourne JSON structure : slides, annotations, image_searches
 ▼
[3] IMAGE SEARCH ────── Logos : Google Favicon → DuckDuckGo → logo.dev
 │                       YouTube thumbnails : img.youtube.com directement
 │                       Images generiques : SerpAPI Google Images (si configure)
 ▼
[4] CAPTURE ─────────── YouTube → thumbnail directe (maxresdefault/hqdefault)
 │                       ScreenshotOne API (cookie banners, Cloudflare, cache)
 │                       Steel.dev cloud browser (fallback)
 │                       Puppeteer local (dernier recours)
 ▼
[5] AGENT IA (Vision) ─ Claude Sonnet 4 Vision
 │                       Recoit screenshot + descriptions d'annotations
 │                       Retourne coordonnees precises (x_percent, y_percent)
 ▼
[6] RENDERER ────────── Templates HTML/CSS → Puppeteer → PNG
 │                       3 formats : 3:4 (1080x1440), 4:5 (1080x1350), 9:16 (1080x1920)
 ▼
PNG slides + ZIP
```

---

## 3. MODULES DETAILLES

### 3.1 Scraper (`modules/scraper.js`)

**Role :** Extraire le contenu textuel et les metadonnees d'une URL.

**Cascade d'extraction :**

| Priorite | Methode | Condition | Detail |
|----------|---------|-----------|--------|
| 1 | YouTube oEmbed | URL youtube.com ou youtu.be | Retourne titre, auteur, video_id, thumbnail URLs. Pas de scraping web |
| 2 | Steel.dev | `STEEL_API_KEY` configure | Navigateur cloud via WebSocket Puppeteer (`wss://connect.steel.dev?apiKey=...`). Gere Cloudflare, CAPTCHAs, JS-heavy SPAs. Extraction : titre (og:title → document.title → h1), contenu markdown (h1-h6, p, li, blockquote, pre, code, table), images, metadonnees. Cleanup des elements parasites (nav, footer, ads, cookie banners, popups) |
| 3 | Jina Reader | Toujours disponible (gratuit) | `https://r.jina.ai/{url}` avec Accept: text/markdown. Parse le markdown retourne pour extraire titre (premier #), images (regex `![alt](url)`) |
| 4 | Cheerio | Fallback | Fetch HTML brut + parse avec cheerio. Suppression du bruit (script, style, nav, footer, ads). Extraction via selectors semantiques (article, main, .content). Conversion HTML → markdown simplifie |

**Validation :** Chaque methode doit retourner au minimum 100 caracteres de `content_markdown`, sinon fallback a la methode suivante.

**Structure de sortie :**
```json
{
  "url": "https://...",
  "type": "article|youtube",
  "title": "Page title",
  "content_markdown": "# Heading\n\nContent...",
  "images": [{"src": "https://...", "alt": "description"}],
  "metadata": {"author": "", "description": "", "source": "steel|jina|cheerio"}
}
```

---

### 3.2 Agent IA — Analyse textuelle (`modules/agent.js` → `analyzeAndStructure`)

**Role :** Transformer le contenu scrape en une structure JSON de slides carousel.

**Modele :** `claude-sonnet-4-20250514`
**Max tokens :** 4096
**Timeout :** 30 secondes

**System prompt dynamique :** Fonction `getSystemPrompt(language)` qui genere le prompt complet dans la langue cible. 4 langues supportees :

| Langue | Code | Instructions |
|--------|------|-------------|
| Anglais | `en` | "ALL titles, subtitles, instructions, and descriptions MUST be written in English" |
| Francais | `fr` | "TOUS les titres, sous-titres, instructions et descriptions DOIVENT etre ecrits en francais" |
| Espagnol | `es` | "TODOS los titulos, subtitulos, instrucciones y descripciones DEBEN estar escritos en espanol" |
| Allemand | `de` | "ALLE Titel, Untertitel, Anleitungen und Beschreibungen MUSSEN auf Deutsch geschrieben sein" |

**Regles imposees a Claude :**
- Maximum 8 slides (1 cover + 5-7 steps)
- Titres courts et impactants (max 6 mots)
- Instructions avec fleches et **mots-cles en gras** (syntaxe `**mot**`)
- Maximum 3-4 instructions par slide
- Identification des URLs a capturer en screenshot
- Identification des images a rechercher (logos, thumbnails, diagrams)

**3 types de slides :**

| Type | Role | Contenu |
|------|------|---------|
| `cover` | Premiere slide | `carousel_title`, `subtitle`, badge "X steps" |
| `step` | Slide tutoriel | Numero, titre, instructions, `screenshot_url`, `annotations[]`, `image_searches[]` |
| `resource` | Slide ressource | Numero, titre, description, media (YouTube embed), `image_searches[]` |

**3 types d'annotations :**

| Type | Rendu | Description |
|------|-------|-------------|
| `circle_number` | Cercle numerote accent | Sur un element UI (bouton, champ, menu) |
| `arrow` | Fleche courbe SVG | Pointant vers un element |
| `highlight_box` | Rectangle translucide | Autour d'un element a mettre en avant |

**Parsing JSON :** 3 strategies en cascade — JSON direct → extraction `\`\`\`json\`\`\`` → extraction `{...}` dans le texte.

**Mode mock :** Si `MOCK_AGENT=true`, genere des slides a partir des headings h2/h3 du contenu scrape sans appel API.

**User message :** Construit en anglais quel que soit la langue cible. Contient l'URL source, le type, le titre, le contenu (tronque a 8000 chars), les images trouvees. Rappelle la langue de sortie.

---

### 3.3 Agent IA — Vision (`modules/agent.js` → `refineAnnotationsWithVision`)

**Role :** Obtenir des coordonnees precises pour les annotations en analysant visuellement le screenshot.

**Modele :** `claude-sonnet-4-20250514` (mode Vision)
**Max tokens :** 2048
**Input :** Screenshot PNG encode en base64 + descriptions textuelles des annotations

**Prompt Vision :** Demande pour chaque element :
- `x_percent` : position horizontale du centre (0-100)
- `y_percent` : position verticale du centre (0-100)
- `width_percent` : largeur en % de l'image
- `height_percent` : hauteur en % de l'image
- `arrow_from` / `arrow_to` : pour les fleches

**Enrichissement :** Chaque annotation recoit `_precise: true` + coordonnees exactes. Si l'appel echoue, les annotations originales avec `position_hint` sont conservees (fallback gracieux).

**Cout :** ~$0.01-0.03 par screenshot.

---

### 3.4 Image Search (`modules/image-search.js`)

**Role :** Telecharger les images necessaires (logos, thumbnails, illustrations).

**Types geres :**

| Type | Methode |
|------|---------|
| `logo`, `icon` | Cascade `fetchLogo()` |
| `youtube_thumb` | Fetch directe img.youtube.com |
| `screenshot`, `website` | Gere par module capture |
| `image_search`, `diagram`, `chart`, `code`, `illustration` | SerpAPI Google Images (si `SERPAPI_KEY` configure) |

**Cascade logo (`fetchLogo`) :**

1. **Google Favicon** (128px) — `https://www.google.com/s2/favicons?domain={domain}&sz=128` — le plus fiable, validation >500 bytes
2. **DuckDuckGo Icons** — `https://icons.duckduckgo.com/ip3/{domain}.ico` — validation >500 bytes
3. **logo.dev** — `https://img.logo.dev/{domain}?token=pk_anonymous&size=128&format=png` — validation >1000 bytes

**Normalisation de domaine :** `normalizeDomain()` transforme "anthropic" → "anthropic.com", "claude.ai" → "claude.ai". Ajoute `.com` si aucun TLD present.

**Traitement images :** Sharp resize 128x128 pour logos, 960x540 pour thumbnails. PNG avec fond transparent.

---

### 3.5 Capture (`modules/capture.js`)

**Role :** Capturer des screenshots des URLs identifiees par l'agent.

**Cascade de capture :**

| Priorite | Methode | Condition | Detail |
|----------|---------|-----------|--------|
| 1 | YouTube thumbnail | URL youtube.com / youtu.be | Fetch directe `maxresdefault.jpg` → `hqdefault.jpg`. Aucun navigateur lance |
| 2 | ScreenshotOne API | `SCREENSHOTONE_API_KEY` configure | `api.screenshotone.com/take` avec `block_cookie_banners=true`, `block_ads=true`, `delay=3`, `cache=true`. Validation >5000 bytes |
| 3 | Steel.dev | `STEEL_API_KEY` configure | Puppeteer connecte via WebSocket `wss://connect.steel.dev`. Viewport 1280x800. Attend 3s + dismiss popups. Validation >5000 bytes |
| 4 | Puppeteer local | Toujours disponible | Navigateur Chromium local singleton. Viewport 1280x800. Cookies CONSENT pour YouTube/Google. Attend le delay + dismiss popups (10 selectors CSS pour cookie banners) |

**Dismiss popups :** 10 selectors CSS ciblent les banners cookie classiques — `[class*="cookie"]`, `#onetrust-accept-btn-handler`, `button[aria-label="Accept all"]`, etc.

**Post-traitement :** `processScreenshot()` via Sharp — resize proportionnel a 960px de large + coins arrondis 12px via masque SVG.

---

### 3.6 Pipeline (`modules/pipeline.js`)

**Role :** Orchestrer les 6 etapes du pipeline, de l'URL au ZIP de slides PNG.

**Etapes :**

| # | Etape | SSE step | Detail |
|---|-------|----------|--------|
| 1 | Scrape | `scraping` | Appelle `scraper.scrape(url)` |
| 2 | Analyse | `analyzing` | Appelle `agent.analyzeAndStructure(content, maxSlides, language)` |
| 3 | Image search | `searching` | Appelle `image-search.searchImages(allImageSearches, workDir)` |
| 4 | Capture | `capturing` | Appelle `capture.captureAll(slides, workDir)` + processScreenshot |
| 4b | Vision | `refining` | Pour chaque slide avec screenshot + annotations : `agent.refineAnnotationsWithVision(buffer, annotations)` |
| 5 | Rendu | `rendering` | Boucle sur chaque slide : `renderer.renderTemplate(templateName, data, format)` → PNG |

**Construction des donnees template (`buildTemplateData`) :**

Pour chaque slide, genere un objet de variables a injecter dans le template :

- `title` : titre sans prefixe numerique (regex strip `^\d+[\.\)\-]\s*`)
- `subtitle` : sous-titre (cover)
- `slide_number` : numero de la slide
- `slide_count` : nombre d'etapes (cover uniquement)
- `instructions_html` : instructions converties en HTML (fleches `→`, `**bold**` → `<strong>`)
- `description_html` : description (resource)
- `screenshot_content` : `<img src="data:image/png;base64,...">` inline
- `annotations_html` : HTML des annotations (cercles, highlights, fleches, spotlight)
- `logo_html` : logo inline base64 (step slides)
- `media_html` : embed YouTube avec vraie thumbnail + play overlay (resource slides)

**Annotations precises vs fallback :**
- Si `anno._precise === true` : coordonnees `left:${x_percent}%`, `top:${y_percent}%`
- Spotlight dimming pour highlight_box : `box-shadow: 0 0 0 9999px rgba(0,0,0,0.4)`
- Fleches SVG : bounding box calculee + courbe Bezier + pointe polygon
- Sinon : fallback `positionFromHint()` avec 9 positions predefinies (top-left → bottom-right)

**Job ID :** `job_{timestamp}_{random6chars}` — valide par regex `^job_\d+_[a-z0-9]+$` pour anti-path-traversal.

**Cleanup :** Le dossier `.work/` (captures, images intermediaires) est supprime apres le rendu.

---

### 3.7 Renderer (`modules/renderer.js`)

**Role :** Convertir les templates HTML remplis en images PNG.

**Navigateur :** Puppeteer singleton Chromium headless. Pages ouvertes/fermees pour chaque rendu.

**3 formats supportes :**

| Format | Dimensions | Utilisation |
|--------|-----------|-------------|
| 3:4 | 1080 x 1440 px | LinkedIn portrait |
| 4:5 | 1080 x 1350 px | Instagram feed (defaut) |
| 9:16 | 1080 x 1920 px | Stories / Reels / TikTok |

**Processus de rendu :**
1. Charge le template HTML depuis `templates/{name}.html`
2. Met a jour les CSS variables `--slide-w` et `--slide-h` selon le format
3. Remplace les `{{variables}}` par les valeurs du data object
4. Nettoie les `{{variables}}` non remplacees (regex `\{\{[a-z_]+\}\}`)
5. Injecte le HTML dans une page Puppeteer au viewport exact
6. Attend le chargement des fonts (`document.fonts.ready`)
7. Screenshot clip `{x:0, y:0, width, height}` → Buffer PNG

---

## 4. TEMPLATES

### 4.1 Cover (`templates/cover.html`) — Type C

**Design :**
- Fond #0D0D0D avec gradients radiaux terra cotta subtils (coins haut-droit et bas-gauche)
- Badge pill "X steps" (fond accent 15%, border accent, texte accent)
- Barre horizontale accent 56x4px
- Titre 64px / weight 900 / line-height 1.1 / tracking -0.02em / max-width 800px
- Sous-titre 24px / weight 400 / couleur #CCC / max-width 600px
- Footer : "AutoCarousel" + URL en gris centre en bas

**Variables :** `{{title}}`, `{{subtitle}}`, `{{slide_count}}`

### 4.2 Step (`templates/step.html`) — Type A

**Design :**
- Header flex : zone titre (flex:1) + logo (56x56px, border-radius 14px, fond rgba blanc 8%, ombre)
- Titre 52px / weight 900 / format "N. Titre"
- Separateur horizontal terra cotta 3px pleine largeur
- Instructions 22px / weight 500 / line-height 1.7 / fleches `→` + `<strong>` pour les mots-cles
- Zone screenshot flex:1 (remplit l'espace restant) — border-radius 12px, ombre 24px, fond #F5F5F5
- Screenshot en `object-fit: cover; object-position: top center`

**Annotations CSS :**
- `.anno-circle` : 44x44px, fond accent, border 2.5px white 35%, double shadow (drop + glow), z-index 10, transform translate(-50%,-50%)
- `.anno-highlight` : border 2.5px accent, border-radius 12px, glow 4px, fond transparent, z-index 5
- `.anno-spotlight` : box-shadow 9999px rgba(0,0,0,0.4), border-radius 12px, z-index 4
- `.anno-arrow` : SVG avec stroke 3.5px accent, round linecap/linejoin, polygon arrowhead

**Variables :** `{{slide_number}}`, `{{title}}`, `{{logo_html}}`, `{{instructions_html}}`, `{{screenshot_content}}`, `{{annotations_html}}`

### 4.3 Resource (`templates/resource.html`) — Type B

**Design :**
- Border 2px accent autour de la slide
- Badge numero (fond accent, 22px bold, padding 8x22, border-radius 8px)
- Titre 42px / weight 900
- Description dans un card #1A1A1A (border-radius 12px, padding 28px), texte 19px #CCC avec `<strong>` en blanc
- Zone media flex:1 — embed YouTube avec :
  - Viewport (thumbnail + play overlay rouge)
  - Barre YouTube (logo SVG rouge, titre, meta)
  - Pour les vraies thumbnails : image pleine + `.youtube-play-overlay`
  - Pour les generiques : gradient bleu + bouton play

**Variables :** `{{slide_number}}`, `{{title}}`, `{{description_html}}`, `{{media_html}}`

---

## 5. SERVEUR ET ENDPOINTS

### 5.1 Stack serveur

| Composant | Detail |
|-----------|--------|
| Runtime | Node.js v20.20.1 |
| Framework | Express 4.21 |
| Middlewares | `express.json()`, `express.urlencoded()` |
| Port | 3000 (configurable via `PORT` dans .env) |

### 5.2 Endpoints

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/login` | Non | Page de connexion HTML (dark mode, meme design que l'app) |
| POST | `/login` | Non | Authentification. Body : `username` + `password`. Succes → cookie `auth` + redirect `/`. Echec → 401 + page avec erreur |
| GET | `/logout` | Non | Efface le cookie auth, redirect `/login` |
| GET | `/health` | Non | `{"status":"ok","timestamp":"..."}` — monitoring public |
| POST | `/generate` | Oui | Genere un carousel. Body JSON : `{url, format, language, max_slides}`. Response : SSE stream |
| GET | `/download/:jobId` | Oui | Telecharge le ZIP des slides PNG. Validation regex anti-path-traversal |
| GET | `/render/:template` | Oui | Preview de template (dev). Query param `format` |
| GET | `/*` | Oui | Fichiers statiques : `/public/`, `/templates/`, `/outputs/`, `/assets/` |

### 5.3 Server-Sent Events (SSE)

Le endpoint `/generate` retourne un flux SSE avec des evenements :

| Event | Data | Description |
|-------|------|-------------|
| `status` | `{step, message}` | Progression du pipeline |
| `complete` | `{job_id, format, dimensions, carousel_title, slides[], zip_url}` | Resultat final |
| `error` | `{message}` | Erreur |

**Steps SSE :** `scraping` → `analyzing` → `searching` → `capturing` → `refining` → `rendering` → `complete`

### 5.4 Authentification

**Systeme :** Cookie signe HMAC-SHA256, sans dependance externe.

| Element | Detail |
|---------|--------|
| Variables .env | `AUTH_USER`, `AUTH_PASS` |
| Activation | Automatique si les deux variables sont non-vides |
| Token | `base64(user:timestamp).hmac_sha256(payload)` |
| Secret | SHA256 de `autocarousel:{password}` (derive, pas de variable supplementaire) |
| Cookie | `auth={token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax` |
| Duree | 7 jours |
| Securite | `crypto.timingSafeEqual` contre les timing attacks |
| Middleware | Protege tout sauf `/health`, `/login`, `/logout` |
| Navigateurs | Redirect vers `/login` si non authentifie |
| API calls | 401 JSON si non authentifie |
| Sans auth | Si `AUTH_USER`/`AUTH_PASS` vides → auth desactivee (zero config dev) |

---

## 6. INTERFACE WEB (`public/index.html`)

### 6.1 Design

- **Theme :** Dark mode exclusif
- **Police :** Inter (Google Fonts) — weights 400 a 900
- **Couleurs :** fond #0A0A0A, surfaces #141414/#1E1E1E, borders #2A2A2A, accent #D97757
- **Border-radius :** 12px partout

### 6.2 Elements

| Element | Detail |
|---------|--------|
| **Header** | Logo "Auto**Carousel**" + liens "API Status" (/health) et "Logout" (/logout) |
| **Hero** | "URL → Carousel" en 40px/900 + sous-titre |
| **Champ URL** | Input avec placeholder, autofocus, Enter pour soumettre |
| **Selecteur langue** | 4 boutons : EN (defaut), FR, ES, DE. Affiche le code + nom complet |
| **Selecteur format** | 3 boutons : 3:4 (1080x1440), 4:5 (1080x1350, defaut), 9:16 (1080x1920) |
| **Bouton generate** | "Generate Carousel", pleine largeur, accent, disabled pendant la generation |
| **Barre de progression** | 4px accent, anime selon les steps (15% → 40% → 60% → 75% → 90% → 100%) |
| **Log SSE** | Conteneur monospace avec step en accent + message. Scroll auto |
| **Galerie resultats** | Grid responsive (minmax 200px), cards avec image cliquable + label "Slide N" |
| **Bouton download** | "Download ZIP" → `/download/{jobId}` |
| **Messages d'erreur** | Bandeau rouge translucide |

### 6.3 JavaScript

- `selectedFormat` : format actif (defaut `4:5`)
- `selectedLang` : langue active (defaut `en`)
- `selectFormat(btn)` / `selectLang(btn)` : toggle .active sur le bon groupe (scope `parentElement`)
- `generate()` : POST `/generate` avec `{url, format, language}`, lecture SSE via ReadableStream + TextDecoder
- `addLog(step, message)` : ajoute une ligne au log SSE
- `showResults(data)` : affiche la galerie + lien download

---

## 7. APIS ET SERVICES EXTERNES

| Service | Usage | Cout | Cle .env |
|---------|-------|------|----------|
| **Claude Sonnet 4** | Analyse de contenu + Vision annotations | ~$0.01-0.05 / run | `ANTHROPIC_API_KEY` |
| **Steel.dev** | Scraping cloud browser + capture fallback | ~100h gratuites | `STEEL_API_KEY` |
| **ScreenshotOne** | Captures d'ecran (methode principale) | ~100 captures gratuites | `SCREENSHOTONE_API_KEY` |
| **Jina Reader** | Scraping fallback (gratuit) | Gratuit | Aucune |
| **Google Favicon** | Logos (cascade #1) | Gratuit | Aucune |
| **DuckDuckGo Icons** | Logos (cascade #2) | Gratuit | Aucune |
| **logo.dev** | Logos (cascade #3) | Gratuit (token anonyme) | Aucune |
| **YouTube oEmbed** | Metadonnees video | Gratuit | Aucune |
| **YouTube Thumbnails** | Images video directes | Gratuit | Aucune |
| **SerpAPI** | Google Images (optionnel) | ~$0.01/req | `SERPAPI_KEY` |

**Cout par run :** ~$0.05-0.15 (tout inclus)

---

## 8. INFRASTRUCTURE PRODUCTION

| Element | Detail |
|---------|--------|
| **VPS** | Hostinger KVM 2, Debian 13 (trixie), kernel 6.12 |
| **Ressources** | 8 GB RAM, 99 GB disque |
| **IP** | 89.116.110.171 |
| **Domaine** | autocarousel.glorics.com (DNS A record) |
| **SSH** | Clef ed25519 `~/.ssh/id_autocarousel`, connexion sans mot de passe |
| **Node.js** | v20.20.1 via NodeSource |
| **Chromium** | 145.0.7632.159 (pour Puppeteer) |
| **Web server** | Apache 2.4.66 |
| **Apache modules** | proxy, proxy_http, proxy_wstunnel, rewrite, headers, ssl |
| **Reverse proxy** | Apache → localhost:3000 |
| **SSE** | `flushpackets=on` dans la config Apache |
| **SSL** | Let's Encrypt via certbot, expire 5 juin 2026, renouvellement auto |
| **HTTP→HTTPS** | Redirect permanent |
| **Service** | systemd `autocarousel.service`, auto-restart on failure |
| **App path** | `/opt/autocarousel/` |
| **Auth prod** | admin / Scr4pes2026! |

### 8.1 Scripts

| Script | Role |
|--------|------|
| `scripts/install.sh` | Setup complet Debian 13 : Apache, Node 20, Chromium, npm install, systemd |
| `scripts/cleanup.sh` | Supprime les outputs > 24h (cron) |

### 8.2 Deploiement

```bash
rsync -avz --exclude='node_modules' --exclude='outputs' --exclude='.env' \
  -e "ssh -i ~/.ssh/id_autocarousel" ./ root@89.116.110.171:/opt/autocarousel/
ssh -i ~/.ssh/id_autocarousel root@89.116.110.171 "systemctl restart autocarousel"
```

---

## 9. CONFIGURATION (`.env`)

| Variable | Requis | Description |
|----------|--------|-------------|
| `PORT` | Non | Port du serveur Express (defaut: 3000) |
| `ANTHROPIC_API_KEY` | **Oui** | Cle API Claude (sk-ant-...) |
| `SCREENSHOTONE_API_KEY` | Non | Cle API ScreenshotOne (active la capture cloud) |
| `STEEL_API_KEY` | Non | Cle API Steel.dev (active le scraping/capture cloud) |
| `SERPAPI_KEY` | Non | Cle SerpAPI pour Google Images |
| `OUTPUT_DIR` | Non | Dossier de sortie (defaut: `./outputs`) |
| `NODE_ENV` | Non | `development` ou `production` |
| `MOCK_AGENT` | Non | `true` pour bypasser les appels Claude (dev) |
| `AUTH_USER` | Non | Login (desactive l'auth si vide) |
| `AUTH_PASS` | Non | Mot de passe (desactive l'auth si vide) |

---

## 10. DEPENDANCES NPM

| Package | Version | Role |
|---------|---------|------|
| express | ^4.21 | Serveur HTTP + routing |
| puppeteer | ^23 | Navigateur headless (captures + rendu PNG) |
| sharp | ^0.33 | Traitement d'images (resize, format, masques SVG) |
| cheerio | ^1.0 | Parser HTML (fallback scraping) |
| axios | ^1.7 | Client HTTP (APIs, fetch images) |
| archiver | ^7.0 | Generation de fichiers ZIP |
| dotenv | ^16.4 | Chargement des variables .env |

**Aucune dependance d'auth externe.** Le systeme de login utilise uniquement `crypto` natif de Node.js.

---

## 11. STRUCTURE DU PROJET

```
/opt/autocarousel/
├── server.js                 # Express + auth + SSE + endpoints
├── package.json              # 7 dependances
├── .env                      # Secrets (non committe)
├── .env.example              # Template sans secrets
│
├── modules/
│   ├── scraper.js            # Steel.dev → Jina → cheerio → YouTube oEmbed
│   ├── agent.js              # Claude Sonnet (texte + Vision) + multi-langue
│   ├── image-search.js       # Google Favicon → DuckDuckGo → logo.dev + SerpAPI
│   ├── capture.js            # YouTube thumb → ScreenshotOne → Steel.dev → Puppeteer
│   ├── pipeline.js           # Orchestration 6 etapes + buildTemplateData
│   └── renderer.js           # Template HTML → Puppeteer → PNG
│
├── templates/
│   ├── cover.html            # Type C : badge, titre 64px, gradients terra cotta
│   ├── step.html             # Type A : header+logo, separator, instructions, screenshot+annotations
│   ├── resource.html         # Type B : badge, description card, YouTube embed
│   └── styles/               # CSS variables (non importes, renderer modifie directement)
│
├── public/
│   └── index.html            # UI : login → URL → langue → format → generate → galerie → download
│
├── scripts/
│   ├── install.sh            # Setup Debian 13 complet
│   └── cleanup.sh            # Cron outputs > 24h
│
├── outputs/                  # Dossiers job_* generes
│
├── CLAUDE.md                 # Instructions projet
├── hackathon-autocarousel-spec.md  # Spec originale
├── SPEC-FONCTIONNELLE.md     # Ce document
├── KEDecharge.md             # Bilan technique
├── DIRECTIVE-QUALITE.md      # Directive originale
├── DIRECTIVE-QUALITE-2.md    # Bilan implementation qualite
└── image-1/2/3.png           # References visuelles Simon
```

---

## 12. SECURITE

| Mesure | Detail |
|--------|--------|
| Auth cookie | HMAC-SHA256, HttpOnly, SameSite=Lax |
| Timing attacks | `crypto.timingSafeEqual` sur la signature |
| Path traversal | Regex validation sur jobId (`^job_\d+_[a-z0-9]+$`) |
| XSS | Pas d'injection utilisateur directe dans les templates (contenu genere par Claude) |
| HTTPS | Let's Encrypt, redirect HTTP→HTTPS |
| Secrets | `.env` exclu du rsync et du git |
| API keys | Cotes serveur uniquement, jamais exposees au client |

---

## 13. TESTS EFFECTUES EN PRODUCTION

| URL | Type | Langue | Format | Scraper | Capture | Resultat |
|-----|------|--------|--------|---------|---------|----------|
| docs.anthropic.com/.../prompt-caching | Article | FR | 4:5 | Jina | Puppeteer | 6 slides, Vision 3/4, logo Anthropic |
| docs.anthropic.com/.../prompt-caching | Article | EN | 4:5 | Jina | Puppeteer | 5 slides anglais |
| docs.anthropic.com/.../prompt-caching | Article | FR | 9:16 | Jina | Puppeteer | 6 slides Stories |
| youtube.com/watch?v=dQw4w9WgXcQ | YouTube | FR | 4:5 | oEmbed | Thumbnail | 5 slides, play overlay |
| docs.anthropic.com/.../prompt-caching | Article | EN | 4:5 | **Steel.dev** | **ScreenshotOne** | **7 slides, 32820 chars, 6 captures cloud** |

---

## 14. PROCHAINES ETAPES

| Etape | Statut |
|-------|--------|
| Pipeline complet fonctionnel | FAIT |
| Deploiement production | FAIT |
| Steel.dev integre | FAIT |
| ScreenshotOne integre | FAIT |
| Multi-langue (EN/FR/ES/DE) | FAIT |
| Authentification | FAIT |
| SSL/HTTPS | FAIT |
| Enregistrer la demo video | A FAIRE |
| Rediger le writeup (100-300 mots) | A FAIRE |
| Soumettre via le formulaire | A FAIRE |
