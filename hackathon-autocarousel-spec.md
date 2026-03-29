# HACKATHON SCRAPES.AI x HOSTINGER — Spec Technique

## Projet : AutoCarousel — URL → Images Tutorielles Annotées

**Auteur :** Manny / Glorics
**Deadline :** 5 avril 2026 (23:59:59 UTC)
**Hébergement obligatoire :** Hostinger VPS — Debian 13

---

## 1. ANALYSE DU BRIEF

### 1.1 Le problème

Créer des images tutorielles annotées (numéros d'étape, flèches, highlights, callouts) est un processus manuel qui prend 30-60 minutes par carousel dans Canva/Figma. Ça ne scale pas pour les créateurs de contenu qui en produisent des dizaines par semaine.

### 1.2 L'objectif

Un système qui prend **une URL en entrée** et produit **une série d'images verticales annotées** prêtes à poster en carousel sur LinkedIn/Instagram/blog. Zéro intervention manuelle.

### 1.3 Ce que Scrapes.ai veut récupérer

Simon Coton (fondateur) veut un outil réutilisable pour sa propre production de contenu et celle de sa communauté (700+ membres payants). La clause de droits partagés confirme que le meilleur build sera intégré ou showcasé. Ça veut dire : l'outil doit être **production-ready**, pas un prototype.

### 1.4 Critères de jugement (par ordre de poids estimé)

| Critère | Ce qu'ils cherchent (mots exacts du brief) | Notre réponse |
|---|---|---|
| **Output quality** | *"Does the final image look intentional and clean? Is it repeatable on any URL?"* | Templates HTML/CSS pixel-perfect calqués sur le style de Simon + rendu Puppeteer |
| **Relevant image searching** | *"grabs relevant and recent images (screenshots, logos, youtube videos, browser snapshots)"* + *"Focus on relevant image searching"* | Module image search multi-source : Clearbit logos, ScreenshotOne, YouTube thumbs, SerpAPI Google Images |
| **Image processing** | *"Focus on [...] processing and output quality"* | Sharp pour recadrage, redimensionnement, ombres portées. Multi-format 3:4, 4:5, 9:16 |
| **Documentation & Clarity** | *"Can a member replicate your build from your notes or simple install commands?"* | README propre, install.sh one-liner, architecture modulaire documentée |
| **Workflow efficiency** | *"How many steps, how much friction?"* | Un seul endpoint POST, une URL en entrée, images en sortie. SSE pour le suivi temps réel |
| **Implementation cost** | *"What does it cost per run?"* | ~$0.05-0.15 par run documenté. Sonnet (pas Opus), APIs gratuites privilégiées |

---

## 2. TYPES DE SLIDES IDENTIFIÉS

En analysant les 3 images de référence fournies par Simon, deux types de slides distincts émergent :

### Type A — Slide "Tuto Step-by-Step"
*Réf : images "1. Add connectors" et "3. Search Gamma"*

Structure :
- Fond noir
- Zone titre (haut) : numéro + titre de l'étape en gras blanc
- Zone instructions (sous le titre) : 2-4 lignes avec flèches → et mots-clés en gras
- Zone screenshot (bas) : capture d'écran de l'interface
- Annotations sur le screenshot : cercles roses numérotés, flèches roses, encadrés roses autour des éléments clés
- Séparateur entre titre et instructions (ligne rouge/rose)

### Type B — Slide "Ressource / Contenu"
*Réf : image "08 - Prompt to write thesis"*

Structure :
- Fond noir/gris foncé
- Badge numéroté (coin supérieur gauche, fond rose/magenta)
- Titre principal en gros (blanc, gras)
- Zone description (cadre arrondi, fond sombre) : texte descriptif avec mots-clés en gras
- Zone média (bas) : embed YouTube ou capture de page avec metadata (vues, date)

### Type C — Slide de couverture (à prévoir)

Structure :
- Fond noir
- Titre du carousel
- Sous-titre / accroche
- Logo ou branding

---

## 3. ARCHITECTURE DU PIPELINE

### 3.1 Vue d'ensemble

Le pipeline comporte **10 étapes** et utilise **6 agents Claude** (appels API distincts avec des rôles spécialisés). L'innovation clé est le **système d'annotations DOM-based** qui garantit un placement pixel-perfect des annotations sur les screenshots.

```
┌──────────────┐
│  URL Input    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  1. SCRAPER       │  Steel.dev (cloud browser) → Jina Reader → Cheerio
│  Extraction du    │  YouTube → oEmbed API
│  contenu texte    │  Timeout 15s par méthode, fallback automatique
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  2a. AGENT 1      │  Claude Sonnet (texte) — "Stratégiste"
│  Plan structure    │  Planifie le nombre de slides, les topics,
│                   │  les URLs de screenshot, le flow logique
│                   │  Input: contenu + navigation_links du site
│                   │  Output: JSON stratégie (topics, URLs, flow)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  2b. AGENT 2      │  Claude Sonnet (texte) — "Rédacteur"
│  Écriture contenu │  Écrit les titres, instructions, descriptions
│                   │  Input: stratégie + contenu source
│                   │  Output: JSON complet des slides (texte)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  2c. AGENT 3      │  Claude Sonnet (texte) — "Explorateur URL"
│  Validation URLs  │  Vérifie les URLs de screenshot contre les
│                   │  vrais liens du site (navigation_links)
│                   │  Remplace les URLs inventées par des vraies
│                   │  Output: slides avec URLs corrigées
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  3. IMAGE SEARCH  │  Google Favicon → DuckDuckGo → logo.dev (logos)
│  Logos, thumbs,   │  YouTube thumbnails (gratuit, direct)
│  visuels          │  SerpAPI Google Images (si clé configurée)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  4. CAPTURE +     │  ScreenshotOne API (primaire) + Puppeteer local
│  ENUMERATION DOM  │  → Screenshot PNG de chaque URL
│                   │  → getBoundingClientRect() de tous les éléments
│                   │    interactifs (boutons, liens, inputs, etc.)
│                   │  Output: { screenshot.png, elements[] }
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  5. AGENT 4       │  Claude Sonnet (vision) — "Validateur"
│  Validation       │  Analyse chaque screenshot : page valide ?
│                   │  Rejette: 404, CAPTCHA, pages vides, login walls
│                   │  Output: { valid, page_type, quality_score }
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  6. AGENT 5 — "Annotateur DOM"                    │
│  OU                                               │
│  6bis. AGENT 6 — "Annotateur Vision" (fallback)   │
│                                                    │
│  AGENT 5 (DOM-based, préféré) :                    │
│  → Reçoit la LISTE TEXTUELLE des éléments DOM     │
│    avec leurs coordonnées exactes (getBoundingRect)│
│  → Claude choisit 3 éléments pertinents            │
│  → Coordonnées calculées mathématiquement          │
│  → Résultat : annotations pixel-perfect            │
│                                                    │
│  AGENT 6 (Vision fallback, si < 3 éléments DOM) : │
│  → Reçoit le screenshot en base64                  │
│  → Claude Vision estime les positions visuellement │
│  → Moins précis mais fonctionne sans DOM           │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│  7. RENDERER      │  Templates HTML/CSS (step, cover, resource)
│  Composition      │  Screenshot + annotations overlay + légende
│  des slides       │  Puppeteer → PNG
│                   │  3 formats : 3:4, 4:5, 9:16
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  8. OUTPUT        │  Série d'images PNG
│  Images finales   │  Servies via Apache (reverse proxy)
│                   │  ZIP downloadable
└──────────────────┘
```

### 3.2 Les 6 agents Claude — Rôles détaillés

| Agent | Nom | Type d'appel | Input | Output | Coût estimé |
|-------|-----|-------------|-------|--------|-------------|
| **Agent 1** | Stratégiste | Texte (Sonnet) | Contenu markdown + navigation_links | JSON stratégie (topics, URLs, flow) | ~$0.01 |
| **Agent 2** | Rédacteur | Texte (Sonnet) | Stratégie + contenu source | JSON complet des slides (titres, instructions, descriptions) | ~$0.02 |
| **Agent 3** | Explorateur URL | Texte (Sonnet) | Slides JSON + navigation_links | Corrections d'URLs (inventées → réelles) | ~$0.01 |
| **Agent 4** | Validateur | Vision (Sonnet) | Screenshot PNG (base64) | `{ valid, reason, page_type, quality_score }` | ~$0.01/slide |
| **Agent 5** | Annotateur DOM | Texte (Sonnet) | Liste d'éléments DOM + contexte slide | `{ instructions[], target_indices[] }` | ~$0.01/slide |
| **Agent 6** | Annotateur Vision | Vision (Sonnet) | Screenshot PNG + contexte slide | `{ instructions[], annotations[] }` | ~$0.02/slide |

**Avantage de l'architecture 6 agents** : Chaque agent est spécialisé dans un rôle précis, ce qui permet des prompts plus courts, des réponses plus fiables, et la possibilité de remplacer/améliorer un agent sans affecter les autres.

**Nombre total d'appels Claude par run** (pour 6 slides) :
- 1 appel Agent 1 (stratégie)
- 1 appel Agent 2 (rédaction)
- 1 appel Agent 3 (validation URLs)
- 6 appels Agent 4 (validation screenshots × 6)
- 6 appels Agent 5 ou 6 (annotation × 6 slides)
- **Total : ~15 appels, coût estimé $0.12-0.18 par carousel**

### 3.3 Le système d'annotations DOM-based (innovation clé)

**Problème résolu** : L'approche classique (Vision estime les positions des éléments UI sur un screenshot) donne des annotations imprécises (±5-20% d'erreur). Les cercles numérotés ne tombent pas exactement sur les boutons.

**Solution implémentée** :

```
                  CAPTURE PHASE                          ANNOTATION PHASE
            ┌─────────────────────┐               ┌──────────────────────────┐
            │  Page web ouverte   │               │  Claude reçoit la LISTE   │
            │  dans Puppeteer     │               │  TEXTUELLE des éléments : │
            │                     │               │                           │
            │  1. Screenshot PNG  │               │  [0] <button> "Sign up"   │
            │     (image propre)  │               │      pos:(340,520)        │
            │                     │               │      size: 200×48         │
            │  2. Enumération DOM │───────────────│  [1] <input> "Work email" │
            │     getBoundingRect │               │      pos:(300,400)        │
            │     de CHAQUE       │               │      size: 280×42         │
            │     élément         │               │  [2] <a> "Pricing"       │
            │     interactif      │               │      pos:(180,30)         │
            │                     │               │      size: 80×24          │
            └─────────────────────┘               │                           │
                                                  │  Claude répond :           │
                                                  │  target_indices: [1, 0, 2] │
                                                  └────────────┬──────────────┘
                                                               │
                                                               ▼
                                                  ┌──────────────────────────┐
                                                  │  CALCUL MATHÉMATIQUE     │
                                                  │  (pas d'estimation)      │
                                                  │                          │
                                                  │  Cercle ① :              │
                                                  │  x = (300+280/2)/1080    │
                                                  │    = 40.7%               │
                                                  │  y = (400+42/2)/1080     │
                                                  │    = 38.9%               │
                                                  │                          │
                                                  │  → Position EXACTE       │
                                                  └──────────────────────────┘
```

**Éléments énumérés** : `a[href]`, `button`, `input`, `select`, `textarea`, `[role="button"]`, `[role="link"]`, `[role="tab"]`, `[role="menuitem"]`, `[onclick]`, `.btn`, `[class*="button"]`, `[class*="cta"]`

**Filtres appliqués** :
- Éléments trop petits (< 20×12 px) exclus
- Éléments hors viewport exclus
- Éléments cachés (`display:none`, `visibility:hidden`, `opacity:0`) exclus
- Éléments sans texte lisible exclus

**Fallback** : Si < 3 éléments DOM trouvés (ex: page statique sans interactivité), l'Agent 6 (Vision) prend le relais avec estimation visuelle.

### 3.4 Déduplication des instructions

Le pipeline inclut un système anti-répétition :
1. **En amont** : L'Agent 5/6 reçoit la liste des instructions déjà utilisées sur les slides précédentes (`avoid_instructions`) et doit choisir des éléments différents
2. **En aval** : Un fingerprinting par mot-clé en gras détecte les doublons restants et les supprime
3. **Nettoyage** : Quand une instruction est supprimée par dédup, l'annotation correspondante (cercle numéroté) est aussi retirée et les numéros restants sont renumérotés

---

## 4. STACK TECHNIQUE

### 4.1 Infrastructure (VPS Hostinger Debian 13)

| Composant | Choix | Justification |
|---|---|---|
| OS | Debian 13 (Trixie), 8GB RAM, 99GB disk | VPS Hostinger KVM 2 |
| Runtime | Node.js 22 LTS | Écosystème riche, Puppeteer natif |
| Web server | **Apache 2.4.66** | Reverse proxy vers :3000, SSE avec `flushpackets=on` |
| SSL | Let's Encrypt (auto-renew) | HTTPS sur autocarousel.glorics.com |
| Process manager | systemd | Service `autocarousel.service`, auto-restart on failure |
| Auth | HMAC-SHA256 signed cookie | Login/password depuis .env, pas de DB |

### 4.2 APIs externes

| Service | Usage | Rôle | Coût estimé |
|---|---|---|---|
| **Claude Sonnet** (`claude-sonnet-4-20250514`) | 4 agents distincts | Structuration, validation, annotation DOM, annotation Vision | ~$0.10-0.15 / run |
| **Steel.dev** | Cloud browser (Puppeteer via WebSocket) | Scraping (pages JS/Cloudflare) + capture fallback | ~$0.02 / session |
| **ScreenshotOne** | Cloud screenshot API | Capture primaire des URLs (gère Cloudflare, cookie banners) | ~$0.01 / screenshot |
| **Jina Reader** (`r.jina.ai/{url}`) | Extraction markdown | Fallback scraping si Steel échoue | Gratuit |
| **Google Favicon API** | Favicons 128px | Logos primaire (fiable, gratuit) | Gratuit |
| **DuckDuckGo Icons** | Favicons ICO | Logos fallback | Gratuit |
| **logo.dev** | Logos SVG/PNG | Logos fallback (qualité supérieure) | Gratuit (token anonymous) |
| **SerpAPI Google Images** | Recherche d'images | Illustrations si clé configurée | ~$0.01 / requête |
| **YouTube oEmbed** | Metadata vidéo | Titre + thumbnail HD | Gratuit |

**Coût total par run estimé : $0.10-0.20** (13 appels Claude + screenshots + scraping)

### 4.3 Librairies Node.js

```json
{
  "dependencies": {
    "express": "^4.18",
    "puppeteer": "^22",
    "sharp": "^0.33",
    "cheerio": "^1.0",
    "axios": "^1.7",
    "archiver": "^7.0"
  }
}
```

---

## 5. DÉTAIL DE CHAQUE MODULE

### 5.1 Module SCRAPER (`modules/scraper.js`)

**Input :** URL brute
**Output :** Contenu markdown + metadata

**Cascade de scraping (avec timeouts) :**

| Priorité | Méthode | Cas d'usage | Timeout |
|----------|---------|-------------|---------|
| 1 | YouTube oEmbed | URLs youtube.com / youtu.be | 10s |
| 2 | Steel.dev (cloud Puppeteer) | Pages JS-heavy, Cloudflare | 15s connect + 30s page |
| 3 | Jina Reader (`r.jina.ai`) | Pages statiques, articles | 15s |
| 4 | Cheerio (fetch + parse) | Dernier recours | 10s |

```json
{
  "url": "https://notion.so",
  "type": "article",
  "title": "Notion – Your AI workspace",
  "content_markdown": "## Your 24/7 AI team...",
  "images": [{ "src": "...", "alt": "..." }],
  "navigation_links": [
    { "text": "Product", "href": "https://notion.so/product" },
    { "text": "Pricing", "href": "https://notion.so/pricing" }
  ],
  "metadata": { "source": "jina" }
}
```

Les `navigation_links` sont extraits par les 3 méthodes de scraping (Steel, Jina, Cheerio) et filtrés (same-domain, dédup, suppression noise social/auth). Ils sont utilisés par l'Agent 1 (Stratégiste) pour proposer des URLs réelles, et par l'Agent 3 (Explorateur URL) pour valider les URLs choisies.

### 5.2 Module AGENT (`modules/agent.js`) — 6 agents Claude

Ce module contient les **6 agents IA** du pipeline, chacun avec un prompt spécialisé. L'architecture sépare les responsabilités pour des prompts plus courts et des résultats plus fiables.

#### Agent 1 — Stratégiste (`planStrategy`)

**Type :** Texte (pas de vision)
**Input :** Contenu markdown + navigation_links du site
**Output :** JSON stratégie `{ carousel_topic, flow_description, slides[{ topic, screenshot_url, focus_area }] }`

Le stratégiste **ne rédige pas** — il planifie uniquement la structure :
- Combien de slides (1 cover + 4-7 steps + 0-1 resource)
- Quel sujet pour chaque slide
- Quelle URL screenshotter (en priorité depuis les `navigation_links` réels du site)
- Le flow logique du tutorial (ex: inscription → configuration → première feature → résultat)

**Innovation :** Reçoit la liste des vrais liens trouvés sur le site (`navigation_links` du scraper), ce qui évite d'inventer des URLs fictives.

#### Agent 2 — Rédacteur (`writeSlideContent`)

**Type :** Texte (pas de vision)
**Input :** Stratégie (Agent 1) + contenu source
**Output :** JSON complet des slides (titres, instructions, descriptions, image_searches, annotations)

Le rédacteur écrit le contenu de chaque slide selon la stratégie :
- Titres courts et percutants (max 6 mots)
- Instructions actionnables avec **mots-clés en gras** (format `→ Action the **keyword** context`)
- Maximum 3 instructions par slide step
- Instructions DIFFÉRENTES d'une slide à l'autre
- Prompt multilingue (EN/FR/ES/DE)

#### Agent 3 — Explorateur URL (`exploreUrls`)

**Type :** Texte (pas de vision)
**Input :** Slides JSON (Agent 2) + navigation_links du scraper
**Output :** Corrections d'URLs `[{ slide_number, original_url, corrected_url, reason }]`

Valide chaque `screenshot_url` contre les vrais liens trouvés sur le site :
- Détecte les URLs inventées qui mèneraient à des 404
- Remplace par les URLs réelles les plus proches sémantiquement
- S'assure que chaque slide a une URL différente
- Si toutes les URLs sont bonnes, retourne un tableau vide (pas de corrections)

#### Agent 4 — Validateur (`validateScreenshot`)

**Type :** Vision (screenshot en base64)
**Input :** Screenshot PNG capturé
**Output :** `{ valid, reason, page_type, quality_score, ui_elements[] }`

Rejette automatiquement :
- Pages 404, pages blanches, CAPTCHAs
- Murs de login, paywalls, cookie walls plein écran
- Rectangles noirs/solides > 30% de l'image (vidéos non chargées)

#### Agent 5 — Annotateur DOM (`selectAnnotationTargets`) ⭐ INNOVATION

**Type :** Texte (PAS de vision — c'est la clé de la précision)
**Input :** Liste des éléments DOM interactifs avec coordonnées exactes + contexte slide
**Output :** `{ instructions[], target_indices[] }`

C'est le cœur de l'innovation. Claude ne regarde pas l'image — il reçoit une **liste textuelle** des éléments du DOM avec leurs positions exactes (`getBoundingClientRect()`), et choisit les 3 éléments les plus pertinents pour le sujet de la slide.

Les coordonnées des annotations sont ensuite **calculées mathématiquement** depuis les rects DOM :
```
centerX = (rect.x + rect.width / 2) / viewport.width × 100
centerY = (rect.y + rect.height / 2) / viewport.height × 100
```

**Règles de sélection :**
- Éléments spread across the page (pas clustered)
- Préférer : CTA buttons, navigation, input fields, feature-specific elements
- Éviter : footer links, social icons, cookie buttons, "close" buttons
- Respecter la liste `avoid_instructions` (dédup cross-slides)

#### Agent 6 — Annotateur Vision (`analyzeScreenshotAndAnnotate`) (fallback)

**Type :** Vision (screenshot en base64)
**Input :** Screenshot PNG + contexte slide
**Output :** `{ page_description, instructions[], annotations[] }`

Utilisé uniquement quand < 3 éléments DOM sont disponibles (pages très statiques). Moins précis que l'Agent 5 (±5-20% d'erreur) mais fonctionne sur n'importe quelle image.

### 5.3 Module IMAGE SEARCH (`modules/image-search.js`)

**Input :** Requêtes de recherche d'images (depuis le JSON de l'Agent 2 — Rédacteur)
**Output :** Images téléchargées en local + metadata

**Cascade de recherche de logos :**

| Priorité | Source | URL | Seuil |
|----------|--------|-----|-------|
| 1 | Google Favicon | `google.com/s2/favicons?domain={d}&sz=128` | > 200 bytes |
| 2 | DuckDuckGo Icons | `icons.duckduckgo.com/ip3/{d}.ico` | > 200 bytes |
| 3 | logo.dev | `img.logo.dev/{d}?token=pk_anonymous&size=128` | > 1000 bytes |

**Autres types :**
- `youtube_thumb` → `img.youtube.com/vi/{id}/maxresdefault.jpg` (gratuit, direct)
- `image_search` → SerpAPI Google Images (si clé configurée)
- `screenshot` / `website` → délégué au module capture

**Post-processing (Sharp) :**
- Logos : resize 128×128, fond transparent, PNG
- Thumbnails : resize 960×540, cover crop, JPEG quality 90
- Screenshots : resize 960px width, coins arrondis 12px, crop max ratio 4:3

### 5.4 Module CAPTURE (`modules/capture.js`)

**Input :** URLs à capturer + slides
**Output :** Screenshots PNG + éléments DOM interactifs par slide

Ce module a une double responsabilité : capturer le screenshot ET énumérer les éléments interactifs du DOM pour le système d'annotation.

**Fonction principale : `captureAllWithElements(slides, workDir)`**
→ Retourne `{ screenshots: Map, elementsMap: Map }`

**Cascade de capture (avec timeouts) :**

| Priorité | Méthode | DOM elements ? | Timeout |
|----------|---------|---------------|---------|
| 0 | YouTube thumbnail | Non (pas de page) | 10s |
| 1 | ScreenshotOne API | Oui (via Puppeteer local en parallèle) | 35s |
| 2 | Steel.dev + Puppeteer | Oui (dans la même session) | 45s |
| 3 | Puppeteer local | Oui (dans la même session) | 30s |

**Paramètres ScreenshotOne :**
```
viewport: 1080×1080, format: png, full_page: false
block_cookie_banners: true, block_ads: true, delay: 3s
styles: video, iframe[src*="youtube/vimeo/wistia"] { visibility:hidden }
cache: true, cache_ttl: 14400 (4h)
```

**Énumération des éléments DOM (`enumerateInteractiveElements`) :**
```javascript
// Sélecteurs ciblés
'a[href]', 'button', 'input', 'select', 'textarea',
'[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
'[onclick]', '.btn', '[class*="button"]', '[class*="cta"]'

// Pour chaque élément visible dans le viewport :
{ index, tag, type, text, rect: { x, y, width, height } }
```

**Sécurité : vidéos masquées**
- CSS injecté : `video`, `iframe[src*="youtube"]`, etc. → `visibility: hidden`
- Préserve le layout (pas `display:none`) pour éviter le décalage des éléments

### 5.5 Module PIPELINE (`modules/pipeline.js`) — Orchestration

**Fonction principale : `generateCarousel(url, options)`**

Orchestre les 10 étapes du pipeline dans l'ordre, avec SSE streaming pour le suivi temps réel :

1. **Scrape** → contenu markdown + navigation_links
2. **Fetch cover logo** → `fetchLogo(sourceDomain)` pour la slide couverture
3. **Agent 1 (Stratégiste)** → plan de structure (topics, URLs, flow)
4. **Agent 2 (Rédacteur)** → contenu des slides (titres, instructions, descriptions)
5. **Agent 3 (Explorateur URL)** → validation et correction des URLs de screenshots
6. **Image search** → logos, thumbnails
7. **Capture + DOM** → screenshots + éléments interactifs (`getBoundingClientRect`)
8. **Agent 4 (Validateur)** → validation screenshots (rejette 404, blancs, captchas)
9. **Agent 5/6 (Annotateur DOM/Vision)** → annotations pixel-perfect + instructions adaptées
10. **Dedup + Render** → dédup instructions, suppression annotations orphelines, templates HTML → PNG

**Post-processing des slides rejetées :**
- Les slides dont le screenshot est rejeté par l'Agent 4 sont supprimées
- Les slides restantes sont renumérotées séquentiellement

### 5.6 Module RENDERER (`modules/renderer.js`)

**Input :** Template name + data + format
**Output :** PNG buffer

**Formats supportés :**

| Ratio | Dimensions | Usage |
|---|---|---|
| 3:4 | 1080 × 1440 px | Instagram carousel |
| 4:5 | 1080 × 1350 px | LinkedIn / Instagram (défaut) |
| 9:16 | 1080 × 1920 px | Stories / Reels / TikTok |

**Templates HTML (`templates/`) :**

| Template | Description | Layout |
|----------|-------------|--------|
| `cover.html` | Slide de couverture | Logo source + badge "N steps" + titre + sous-titre + domaine |
| `step.html` | Slide tutoriel | Titre → Screenshot annoté → Légende numérotée ①②③ |
| `resource.html` | Slide ressource | Badge + titre + description + embed YouTube/thumbnail |

**Layout de la slide step (current) :**
```
┌─────────────────────────┐
│ 1. Titre         [logo] │
│─────────────────────────│
│ ┌─────────────────────┐ │
│ │                     │ │
│ │    Screenshot       │ │
│ │    avec annotations │ │
│ │    ①  ②  ③         │ │
│ │                     │ │
│ └─────────────────────┘ │
│                         │
│ ① Explication action 1  │
│ ② Explication action 2  │
│ ③ Explication action 3  │
└─────────────────────────┘
```

Le screenshot est dans un `.screenshot-wrapper` avec `aspect-ratio: var(--screenshot-ar)` calculé dynamiquement depuis les dimensions réelles de l'image (via Sharp metadata). Les annotations sont positionnées en `%` à l'intérieur du wrapper — ce qui garantit l'alignement avec l'image quelle que soit sa taille de rendu.

**Palette de couleurs :**
```css
:root {
  --bg: #0D0D0D;        /* Fond noir */
  --text: #FFFFFF;       /* Texte principal */
  --text-muted: #CCCCCC; /* Texte secondaire */
  --accent: #D97757;     /* Terra cotta — annotations, séparateurs, badges */
}
```

**Annotations CSS (overlay sur le screenshot) :**
- `.anno-circle` : cercle 44px, fond accent, border blanche semi-transparente, ombre
- `.anno-highlight` : bordure accent 2.5px, border-radius 12px, glow extérieur
- `.anno-spotlight` : box-shadow 9999px pour effet dimming autour de l'élément focus
- `.anno-arrow` : SVG avec path courbe, arrowhead filled

### 5.7 Module OUTPUT — Livraison

- Images PNG dans `outputs/{job_id}/`
- Servies par Express (static files) derrière Apache reverse proxy
- ZIP téléchargeable : `GET /download/{job_id}` (archiver)
- Nettoyage du workdir (`.work/`) automatique après rendu

---

## 6. API ENDPOINT

### POST /generate

**Request :**
```json
{
  "url": "https://example.com/how-to-connect-gamma-to-claude",
  "format": "4:5",        // "3:4" | "4:5" | "9:16"
  "max_slides": 7,
  "style": "dark"
}
```

**Response (SSE stream) :**
```
event: status
data: {"step": "scraping", "message": "Extracting content..."}

event: status
data: {"step": "analyzing", "message": "Structuring 6 slides..."}

event: status
data: {"step": "searching", "message": "Finding 8 relevant images..."}

event: status
data: {"step": "capturing", "message": "Screenshot 2/4..."}

event: status
data: {"step": "rendering", "message": "Composing slide 3/6 (4:5 @ 1080×1350)..."}

event: complete
data: {
  "job_id": "abc123",
  "format": "4:5",
  "dimensions": "1080x1350",
  "slides": [
    {"number": 1, "url": "/outputs/abc123/slide_01.png"},
    {"number": 2, "url": "/outputs/abc123/slide_02.png"}
  ],
  "zip_url": "/download/abc123"
}
```

---

## 7. STRUCTURE DU PROJET

```
/opt/autocarousel/
├── server.js                 # Express + auth (login, cookie HMAC) + SSE + endpoints
├── package.json
├── .env                      # API keys + auth credentials (pas versionné)
│
├── modules/
│   ├── scraper.js            # Steel.dev → Jina → Cheerio → YouTube oEmbed
│   ├── agent.js              # 6 agents Claude : stratégiste, rédacteur, explorateur URL,
│   │                         #   annotateur DOM, annotateur Vision
│   ├── image-search.js       # Logos (Favicon→DDG→logo.dev), YT thumbs, SerpAPI
│   ├── capture.js            # ScreenshotOne → Steel → Puppeteer local
│   │                         #   + enumerateInteractiveElements (DOM)
│   ├── pipeline.js           # Orchestration complète des 8 étapes
│   └── renderer.js           # Templates HTML → Puppeteer → PNG (3 formats)
│
├── templates/
│   ├── cover.html            # Slide couverture (logo + badge + titre + domaine)
│   ├── step.html             # Slide tuto (titre → screenshot annoté → légende ①②③)
│   └── resource.html         # Slide ressource (badge + titre + YT embed/thumb)
│
├── public/
│   └── index.html            # Web UI (sélecteur langue EN/FR/ES/DE + format + URL)
│
└── outputs/                  # Images générées ({job_id}/slide_01.png...)
```

---

## 8. SETUP VPS DEBIAN 13

### 8.1 Script d'installation

```bash
#!/bin/bash
# install.sh — AutoCarousel sur Debian 13 (Hostinger VPS)

set -e

# Mise à jour système
apt update && apt upgrade -y
apt install -y curl wget git nginx ufw fail2ban

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Chromium pour Puppeteer
apt install -y chromium chromium-sandbox fonts-liberation \
  fonts-noto-color-emoji fonts-noto-cjk libatk1.0-0 \
  libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libnss3 libxss1 libasound2

# Créer le dossier projet
mkdir -p /opt/autocarousel
cd /opt/autocarousel

# Variables d'environnement
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
SCREENSHOTONE_API_KEY=...
SERPAPI_KEY=...
PORT=3000
OUTPUT_DIR=/var/www/autocarousel/outputs
EOF

# Nginx config
cat > /etc/nginx/sites-available/autocarousel << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }

    location /outputs/ {
        alias /var/www/autocarousel/outputs/;
        expires 24h;
    }
}
EOF

ln -sf /etc/nginx/sites-available/autocarousel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Systemd service
cat > /etc/systemd/system/autocarousel.service << 'EOF'
[Unit]
Description=AutoCarousel - URL to Annotated Tutorial Images
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/autocarousel
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/autocarousel/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable autocarousel

# Cron nettoyage (supprime les outputs > 24h)
echo "0 */6 * * * find /var/www/autocarousel/outputs/ -type d -mmin +1440 -exec rm -rf {} + 2>/dev/null" | crontab -

# Dossier outputs
mkdir -p /var/www/autocarousel/outputs

echo "✅ Installation terminée. Déployer le code dans /opt/autocarousel/"
```

### 8.2 Systemd + monitoring

Alertes Telegram (même pattern qu'Agentics) en cas de crash du service. Health check endpoint `GET /health`.

---

## 9. PLANNING DE DÉVELOPPEMENT

| Semaine | Tâches | Livrable |
|---|---|---|
| **S1 (7-13 mars)** | Commander VPS Hostinger, setup Debian, install stack, Nginx, systemd | VPS opérationnel, endpoint /health qui répond |
| **S2 (14-20 mars)** | Module scraper + module agent (prompt engineering) + module image search | URL → JSON structuré des slides + images pertinentes trouvées |
| **S3 (21-27 mars)** | Module capture + module renderer multi-format (templates HTML/CSS × 3 ratios) | Pipeline end-to-end fonctionnel, premiers PNG dans les 3 formats |
| **S4 (28 mars - 3 avril)** | Polish visuel, edge cases, tests sur URLs variées (blogs, YouTube, docs, produits) | Output quality maximale, robustesse prouvée |
| **S5 (4-5 avril)** | Démo vidéo (1-3 min) + writeup (100-300 mots) | Soumission |

---

## 10. STRATÉGIE POUR GAGNER

### 10.1 Ce que les autres vont probablement faire
- Workflow n8n basique avec captures d'écran brutes
- Script Claude Code rapide sans templates soignés
- Output fonctionnel mais visuellement médiocre

### 10.2 Nos différenciateurs
1. **Recherche d'images intelligente** — Le système ne se contente pas de capturer l'URL. Il va chercher des logos, des screenshots d'interfaces, des thumbnails YouTube, des visuels pertinents. C'est exactement ce que Simon demande : *"grabs relevant and recent images"*.
2. **Qualité visuelle** — Templates HTML/CSS calqués pixel par pixel sur les images de référence de Simon. Le jury reconnaîtra son propre style.
3. **Multi-format** — 3:4, 4:5, 9:16. Les trois formats demandés dans le brief. Pas juste un.
4. **Robustesse** — Fonctionne sur YouTube, articles de blog, pages de doc, pages produit. Pas un one-shot.
5. **Architecture propre** — VPS Debian, systemd, Nginx, code modulaire. Ça montre du sérieux.
6. **Documentation impeccable** — README avec install en une commande, architecture claire, coût par run documenté.
7. **Coût minimal** — ~$0.05-0.15 par run. Imbattable.

### 10.3 Angle secret
Reproduire EXACTEMENT le style visuel des images de référence de Simon. Fond noir, cercles magenta, flèches roses, typo Inter, encadrés arrondis. Le jury (Simon lui-même) verra un outil qui produit les images qu'il fait déjà à la main. C'est du sur-mesure déguisé en générique.

---

## 11. LIVRABLES HACKATHON

| Requis | Notre livrable |
|---|---|
| ✅ Host sur Hostinger | VPS Debian 13, IP dédiée |
| ✅ Soumission via form | À venir |
| ✅ Démo vidéo 1-3 min | Screencast : URL → slides en temps réel |
| ✅ Writeup 100-300 mots | Description technique concise |
| ✅ Droits partagés | Accepté (code reste aussi le nôtre) |

---

## 12. RISQUES ET MITIGATIONS

| Risque | Probabilité | Mitigation |
|---|---|---|
| URLs bloquées (Cloudflare) | Moyenne | ScreenshotOne gère le bypass. Jina Reader en fallback pour le texte |
| Contenu mal structuré (pas de tuto clair) | Haute | Prompt Claude robuste avec fallback : découper en sections logiques même sans étapes explicites |
| Positionnement des annotations imprécis | Haute | Commencer avec position_hint relatifs (top-left, center...) plutôt que coordonnées pixel. Itérer en S4 |
| Images recherchées non pertinentes | Moyenne | L'agent Claude filtre et priorise. Clearbit pour les logos = fiable. SerpAPI Google Images en dernier recours avec filtre par pertinence |
| Logos introuvables (Clearbit ne couvre pas tout) | Moyenne | Fallback : Google Favicon (128px) → SerpAPI Image Search "{brand} logo png" → placeholder générique |
| Rendu différent selon le ratio | Moyenne | Templates adaptatifs testés sur les 3 formats dès la S3. Zones flexibles (pas de positions fixes en px) |
| Rendu Puppeteer lent | Faible | Pool de pages pré-lancées (2-3 instances), cache templates |
| Dépassement budget API | Faible | Sonnet pas Opus, un seul appel par run, rate limiting. SerpAPI : 100 requêtes/mois gratuites |

---

## 13. DISTRIBUTION — DÉPLOIEMENT PAR LES UTILISATEURS

### 13.1 Objectif

Permettre à n'importe quel membre de la communauté Scrapes.ai (ou autre) de déployer sa propre instance d'AutoCarousel sur un VPS en quelques minutes, sans compétences techniques avancées. C'est un argument fort pour le jury : l'outil n'est pas juste un prototype, il est **distribuable**.

### 13.2 Script d'installation one-liner

```bash
curl -fsSL https://autocarousel.glorics.com/install.sh | bash
```

Le script :
1. Détecte l'OS (Debian/Ubuntu)
2. Installe les dépendances système (Node.js 20 LTS, Chromium, fonts)
3. Clone le repo depuis GitHub
4. Installe les dépendances npm
5. Configure systemd (service autocarousel)
6. Configure Apache/Nginx en reverse proxy
7. Optionnel : setup Let's Encrypt si un domaine est fourni
8. Lance le service sur le port 3000
9. Affiche l'URL d'accès au **Setup Wizard**

### 13.3 Setup Wizard (première visite)

Au premier lancement, si aucun fichier `.env` n'existe (ou s'il est incomplet), l'application affiche une **page de configuration** au lieu de l'interface principale.

**Page Setup — champs du formulaire :**

| Champ | Requis | Description |
|---|---|---|
| Clé API Anthropic | Oui | Pour Claude Sonnet (analyse de contenu + Vision) |
| Clé API ScreenshotOne | Oui | Pour la capture de screenshots |
| Clé API Steel.dev | Non | Pour le scraping cloud (fallback sans = Jina + Cheerio) |
| Login admin | Oui | Identifiant pour accéder à l'outil |
| Mot de passe admin | Oui | Mot de passe (min 8 caractères) |
| Langue par défaut | Non | EN / FR / ES / DE (défaut: EN) |

**Logique :**
1. L'utilisateur remplit le formulaire
2. Le serveur valide les clés (test d'un appel minimal à chaque API)
3. Écrit le `.env` avec les valeurs
4. Redémarre le service automatiquement
5. Redirige vers la page de login → l'outil est prêt

**Sécurité :**
- Le Setup Wizard n'est accessible que si `.env` est absent ou incomplet
- Une fois configuré, la route `/setup` retourne une 404
- Les clés API ne sont jamais ré-affichées après sauvegarde

### 13.4 Alternative Docker

```bash
docker run -d --name autocarousel \
  -p 3000:3000 \
  -v autocarousel_data:/app/outputs \
  glorics/autocarousel:latest
```

- L'image Docker embarque tout (Node.js, Chromium, fonts, app)
- Le Setup Wizard s'affiche au premier accès (même logique que ci-dessus)
- Volume persistant pour les outputs

### 13.5 Documentation d'installation

README avec 3 méthodes, par ordre de simplicité :

1. **One-liner** (recommandé) — `curl ... | bash` puis Setup Wizard
2. **Docker** — `docker run` puis Setup Wizard
3. **Manuel** — Clone + npm install + configuration .env manuelle

Chaque méthode documentée en **5 étapes max**, screenshots inclus.

### 13.6 Planning

Cette section est implémentée en **semaine 4-5**, une fois le pipeline stabilisé :
- Le Setup Wizard = une page HTML + un endpoint POST `/setup` qui écrit le `.env`
- Le script install.sh = adaptation du script existant (section 8.1) rendu idempotent
- Le Dockerfile = basé sur `node:20-slim` + installation Chromium

---

## ANNEXE A — BRIEF ORIGINAL DE SIMON (VERBATIM)

> Ce qui suit est le post exact publié par Simon Scrapes (Simon Coton) sur la communauté Skool "Scrapes.ai - AI Academy" pour lancer le hackathon. C'est la source de vérité. Toute décision technique doit être alignée avec ce texte.

---

We're running a Hackathon in partnership with Hostinger 🚀

Here's the problem we're solving: Creating annotated tutorial images (the kind with arrows, highlights, and section callouts) is slow, manual, and done in Canva or Figma one frame at a time.

The challenge is to build a system that takes a URL, grabs relevant and recent images (screenshots, logos, youtube videos, browser snapshots), and outputs annotated visuals ready for social media carousels and blog articles. No manual editing. No Canva. Just input → annotated image, or series of images out. See attached images for reference.

____________________________

💰 PRIZES — $2,000 TOTAL
🥇 $1,200 - 1st Place
🥈 $500 - 2nd Place
🥉 $300 - 3rd Place

____________________________

Focus on relevant image searching, processing and output quality. The images should be vertical (3:4, 4:5 or 9:16 ratios).

👉 Paid APIs are allowed (e.g. screenshotOne for screenshot capture or steel.dev for autonomous browsing)

How you build it is up to you:
- Agentic tool (Claude Code, Codex, Antigravity, or similar)
- n8n workflow

Hostinger can easily host n8n instances and Node.js projects.

In addition to the scope explained above, submissions will be judged on:
- Output quality - Does the final image look intentional and clean? Is it repeatable on any URL?
- Documentation & Clarity - Can a member replicate your build from your notes or simple install commands?
- Workflow efficiency - How many steps, how much friction?
- Implementation cost - What does it cost per run?

📋 SUBMISSION REQUIREMENTS
✅ Host your build on the Hostinger platform ‼️ (projects hosted elsewhere will NOT be considered)
✅ Submit your project via our form (to be shared later)
✅ Include a 1–3 min demo video showing how it works
✅ Add a short 100–300 word writeup explaining how it works

By submitting, you agree to shared project rights, allowing both you and Scrapes.ai to use and showcase the build freely without limitation.

____________________________

📅 TIMELINE
- Hackathon Launch: Now
- Deadline: April 5, 2026 at 23:59:59 (UTC)
- Winners Announced: April 10, 2026

____________________________

⚡ START CHECKLIST
✅ Create your Hostinger Account ➡️ hostinger.com/scrapesai
10% Coupon code: SCRAPESAI

Over the next few weeks, we'll run a few live sessions showing how to deploy n8n on Hostinger and launch Node.js projects built with Claude Code or other vibe-coding tools.

Happy building — and good luck! Excited to see your projects

---

## ANNEXE B — CONTEXTE COMMUNAUTÉ (COMMENTAIRES DU POST)

**Commentaire de Serge Petryk :**
> @Simon Scrapes I'm in. Where can the live session materials be found? What is their schedule?

**Réponse de Simon Scrapes :**
> @Serge Petryk wooo nice! they'll be announced soon :) and recorded in case you can't make it. For now - feel free to crack on with the builds, you can always change the hosting later on!

**Commentaire de Manny Casalta Petitjean :**
> I'm in.

**Ce qu'on en déduit :**
- Les live sessions n'ont pas encore eu lieu — la majorité des participants vont attendre les tutos de Simon avant de commencer. Nous, on a déjà la spec et on peut commencer immédiatement.
- Simon confirme qu'on peut développer ailleurs et migrer sur Hostinger après ("you can always change the hosting later on"). Ça veut dire : dev en local ou sur un autre serveur, puis déployer sur le VPS Hostinger pour la soumission.
- Le post a seulement 6 likes et 3 commentaires à ce stade — la compétition est encore naissante, peu de participants se sont manifestés.

---

## ANNEXE C — IMAGES DE RÉFÉRENCE

3 images de référence sont jointes par Simon au post original. Elles ne sont pas dans ce document — elles doivent être fournies séparément à Claude Code pour analyse visuelle.

**Les 3 images montrent le style visuel cible :**
- Image 1 : Slide "08 - Prompt to write thesis" — type ressource/contenu avec badge numéroté magenta, capture YouTube, description
- Image 2 : Slide "1. Add connectors" — type tuto step-by-step avec annotations (cercles roses numérotés, texte d'instructions avec flèches)
- Image 3 : Slide "3. Search 'Gamma'" — type tuto step-by-step avec screenshot d'interface annotée (flèche rose, encadré rose)

Ces images définissent le standard de qualité visuelle à atteindre. Le système doit produire des images de ce niveau.
