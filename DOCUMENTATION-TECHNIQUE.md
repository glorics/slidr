# Documentation Technique — AutoCarousel

> **Version** : 1.0 — Mars 2026
> **Auteur** : Equipe AutoCarousel — Hackathon Hostinger x Scrapes.ai
> **URL de production** : https://autocarousel.glorics.com

---

## Table des matieres

1. [Introduction](#1-introduction)
2. [Architecture Generale](#2-architecture-generale)
3. [Pipeline Multi-Agents](#3-pipeline-multi-agents)
4. [Systeme de Capture Multi-Couches](#4-systeme-de-capture-multi-couches)
5. [Systeme d'Annotation Pixel-Perfect](#5-systeme-dannotation-pixel-perfect)
6. [Boucle de Verification Qualite](#6-boucle-de-verification-qualite)
7. [Rendu et Templates](#7-rendu-et-templates)
8. [Scraping Multi-Sources](#8-scraping-multi-sources)
9. [Recherche d'Images](#9-recherche-dimages)
10. [Interface Web](#10-interface-web)
11. [Infrastructure de Production](#11-infrastructure-de-production)
12. [Scope et Cas d'Usage](#12-scope-et-cas-dusage)
13. [Limites Connues](#13-limites-connues)
14. [APIs Externes](#14-apis-externes)
15. [Securite](#15-securite)

---

## 1. Introduction

### 1.1 Qu'est-ce qu'AutoCarousel ?

AutoCarousel est un outil de generation automatique de **carousels tutoriels annotes** pour les reseaux sociaux (LinkedIn, Instagram). A partir d'une simple URL, le systeme produit un ensemble de slides PNG pretes a publier, comprenant :

- Une **slide de couverture** avec le titre du tutoriel et le logo du site source
- Plusieurs **slides d'etapes** avec des captures d'ecran annotees (cercles numerotes, encadres, fleches) et des instructions pas-a-pas
- Une **slide de ressource** optionnelle avec un embed YouTube ou une description

L'ensemble du processus est automatise : scraping du contenu, planification du carousel, capture des screenshots, annotation par IA, composition pixel-perfect, et verification qualite.

### 1.2 Le probleme resolu

Creer des carousels tutoriels de qualite professionnelle est un processus manuel qui prend **2 a 4 heures** par carousel :

1. Identifier les etapes cles du tutoriel
2. Capturer et recadrer les screenshots
3. Annoter chaque screenshot avec des cercles numerotes, des fleches, des encadres
4. Ecrire les instructions correspondantes
5. Designer chaque slide avec une typographie et une palette coherentes
6. Exporter dans les bons formats

AutoCarousel reduit ce processus a **3-8 minutes** en automatisant chaque etape via un pipeline multi-agents IA.

### 1.3 Contexte

Ce projet a ete developpe dans le cadre du **hackathon Hostinger x Scrapes.ai** (communaute de Simon Coton). L'objectif etait de construire un outil utile pour la communaute, heberge sur un VPS Hostinger, utilisant des technologies web modernes.

**Deadline** : 5 avril 2026
**Stack impose** : Node.js, hebergement VPS Hostinger

---

## 2. Architecture Generale

### 2.1 Schema du Pipeline

```
                                    AutoCarousel Pipeline
    ============================================================================

    URL (utilisateur)
         |
         v
    +----------------+     +---------------------------------------------+
    |   SCRAPER      |     |  Sources :                                  |
    |                | --> |  Steel.dev > Jina Reader > Cheerio > YT     |
    +----------------+     +---------------------------------------------+
         |
         | contenu_markdown + navigation_links + images
         v
    +--------------------+
    | AGENT 1: Strategist|  (Claude Sonnet)
    | Planifie la        |  Input: contenu + liens de navigation
    | structure slides   |  Output: plan avec topics + URLs
    +--------------------+
         |
         v
    +--------------------+
    | AGENT 2: Writer    |  (Claude Sonnet)
    | Ecrit titres +     |  Input: plan + contenu source
    | instructions       |  Output: texte complet par slide
    +--------------------+
         |
         v
    +--------------------+
    | AGENT 3: URL       |  (Claude Sonnet)
    | Explorer           |  Input: URLs proposees + vrais liens du site
    | Valide/corrige     |  Output: URLs corrigees
    | les URLs           |
    +--------------------+
         |
         v
    +------------------+     +---------------------------------------------+
    | CAPTURE +        |     |  Sources :                                  |
    | ENUMERATION DOM  | --> |  Steel.dev > Puppeteer > ScreenshotOne     |
    +------------------+     +---------------------------------------------+
         |
         | screenshots PNG + elements[] avec getBoundingClientRect
         v
    +--------------------+
    | AGENT 4: Screenshot|  (Claude Sonnet Vision)
    | Validator          |  Input: screenshot PNG
    | Rejette 404/blank  |  Output: { valid, page_type, quality_score }
    +--------------------+
         |
         v
    +---------------------------+
    | AGENT 5: Annotator        |  (Claude Sonnet Vision + DOM)
    | Vision+DOM hybrid         |  Input: screenshot + elements DOM
    | Choisit elements +        |  Output: annotations avec coordonnees
    | ecrit instructions        |          pixel-perfect
    +---------------------------+
         |
         v
    +--------------------+
    | COMPOSITING        |  (Sharp + SVG)
    | Brule les annota-  |  Cercles, fleches, encadres directement
    | tions dans l'image |  dans les pixels du screenshot
    +--------------------+
         |
         v
    +--------------------+
    | AGENT 6: Quality   |  (Claude Sonnet Vision)
    | Verifier           |  Input: image annotee finale
    | Score 1-10         |  Output: pass/fail + feedback
    | Retry si < 7       |  Boucle max 2 retries
    +--------------------+
         |
         v
    +--------------------+
    | RENDERER           |  (Puppeteer)
    | HTML Templates     |  Templates cover/step/resource
    | --> PNG            |  Formats : 3:4, 4:5, 9:16
    +--------------------+
         |
         v
    +--------------------+
    |   ZIP OUTPUT       |
    | slide_01.png       |
    | slide_02.png       |
    | ...                |
    +--------------------+
```

### 2.2 Stack Technique

| Composant | Technologie | Role |
|-----------|-------------|------|
| **Runtime** | Node.js | Serveur applicatif |
| **Framework HTTP** | Express 4.21 | API REST + SSE + serveur statique |
| **Navigateur headless** | Puppeteer 23 | Capture screenshots + rendu HTML->PNG |
| **Traitement image** | Sharp 0.33 | Resize, crop, compositing SVG, coins arrondis |
| **Scraping HTML** | Cheerio 1.0 | Parsing HTML cote serveur |
| **HTTP client** | Axios 1.7 | Appels API + telechargement images |
| **Archivage** | Archiver 7.0 | Generation ZIP pour telechargement |
| **Variables env** | dotenv 16.4 | Configuration locale |
| **IA** | Claude Sonnet (claude-sonnet-4-20250514) | 6 agents specialises (texte + Vision) |
| **Cloud browser** | Steel.dev | Scraping JS + capture anti-Cloudflare |
| **Capture cloud** | ScreenshotOne | Screenshots avec anti-bot |

### 2.3 Les 6 Agents IA

| # | Agent | Type | Role |
|---|-------|------|------|
| 1 | **Strategist** | Texte | Planifie la structure : nombre de slides, topics, URLs |
| 2 | **Writer** | Texte | Ecrit les titres, instructions, descriptions |
| 3 | **URL Explorer** | Texte | Valide et corrige les URLs contre les vrais liens du site |
| 4 | **Screenshot Validator** | Vision | Rejette les screenshots 404, blank, CAPTCHA |
| 5 | **Annotator** | Vision + DOM | Choisit les elements a annoter, place les coordonnees |
| 6 | **Quality Verifier** | Vision | Verifie l'image annotee finale, scoring 1-10 |

### 2.4 Flux de Donnees Bout-en-Bout

```
URL (string)
  --> scrape() --> { url, title, content_markdown, images, navigation_links, metadata }
  --> planStrategy() --> { carousel_topic, flow_description, slides: [{ topic, screenshot_url }] }
  --> writeSlideContent() --> { carousel_title, slides: [{ title, instructions, annotations }] }
  --> exploreUrls() --> slides avec URLs validees/corrigees
  --> captureAllWithElements() --> Map<slideNum, screenshotPath> + Map<slideNum, elements[]>
  --> validateScreenshot() --> slides filtrees (sans screenshots rejetes)
  --> selectAnnotationTargetsWithVision() --> annotations avec coordonnees pixel-perfect
  --> compositeAnnotations() --> screenshots avec annotations brulees dans l'image
  --> verifyAnnotatedSlide() --> boucle de retry si score < 7
  --> renderTemplate() --> PNG par slide
  --> ZIP --> telechargement
```

### 2.5 Fichiers du Projet

```
autocarousel/
|-- server.js                     # Serveur Express + auth + routes
|-- package.json                  # Dependencies npm
|-- .env                          # Configuration (API keys, auth)
|-- modules/
|   |-- agent.js                  # 6 agents IA (1553 lignes)
|   |-- pipeline.js               # Orchestration du pipeline complet
|   |-- capture.js                # Capture screenshots multi-sources
|   |-- scraper.js                # Extraction contenu web
|   |-- renderer.js               # Rendu HTML --> PNG
|   |-- image-search.js           # Logos + thumbnails + images
|   |-- annotator.js              # Compositing annotations SVG/Sharp
|-- templates/
|   |-- cover.html                # Template slide de couverture (Type C)
|   |-- step.html                 # Template slide d'etape (Type A)
|   |-- resource.html             # Template slide de ressource (Type B)
|-- public/
|   |-- index.html                # Interface web (dark theme)
|-- outputs/                      # Dossier des jobs generes
|-- assets/                       # Assets statiques
```

---

## 3. Pipeline Multi-Agents

Le coeur d'AutoCarousel est un pipeline de **6 agents IA specialises**, chacun ayant un role precis et des entrees/sorties bien definies. Tous utilisent le modele **Claude Sonnet (`claude-sonnet-4-20250514`)** via l'API Anthropic.

### 3.1 Agent 1 — Strategist

**Fichier** : `modules/agent.js`, fonction `planStrategy()`

**Role** : Planifier la structure du carousel. Le Strategist decide du nombre de slides, du sujet de chaque slide, et de l'URL a capturer pour chaque etape.

**Approche URL-Driven** : Le Strategist ne planifie pas des topics pour ensuite chercher des URLs. Il fait l'inverse :
1. Il scanne d'abord la liste des **pages reelles** trouvees sur le site (navigation_links)
2. Il construit ses topics autour des pages qui existent reellement
3. Il ne cree jamais un topic pour lequel aucune sous-page n'existe

**Input** :
```json
{
  "url": "https://stripe.com",
  "title": "Stripe - Payment Processing",
  "content_markdown": "...(contenu extrait, max 6000 chars)...",
  "navigation_links": [
    { "text": "Pricing", "href": "https://stripe.com/pricing" },
    { "text": "Documentation", "href": "https://stripe.com/docs" }
  ]
}
```

**Output** :
```json
{
  "carousel_topic": "How to set up Stripe payments",
  "flow_description": "Signup -> Dashboard -> API Keys -> Integration -> Pricing",
  "slides": [
    { "slide_number": 0, "type": "cover", "topic": "Stripe in 5 Steps" },
    { "slide_number": 1, "type": "step", "topic": "Create Account",
      "screenshot_url": "https://stripe.com/register", "focus_area": "signup form" },
    { "slide_number": 2, "type": "step", "topic": "Explore Pricing",
      "screenshot_url": "https://stripe.com/pricing", "focus_area": "pricing table" }
  ]
}
```

**Modele** : `claude-sonnet-4-20250514`
**Max tokens** : 2048
**Timeout** : 30s

**Resume du prompt systeme** :
> "You are a carousel strategist. You plan the STRUCTURE of tutorial carousels. CRITICAL: URL-DRIVEN PLANNING — first scan the available pages list, then build topics around real pages. NEVER invent a topic and hope a matching URL exists."

**Regles cles** :
- Maximum 1 cover + 5-7 step + 1 resource
- Chaque step slide doit avoir un `screenshot_url` unique
- Jamais plus d'un slide utilisant la page d'accueil
- Preferer creer moins de slides plutot que reutiliser la meme URL

---

### 3.2 Agent 2 — Writer

**Fichier** : `modules/agent.js`, fonction `writeSlideContent()`

**Role** : Ecrire le contenu textuel de chaque slide. Le Writer recoit le plan du Strategist et le contenu source, puis produit les titres, instructions et descriptions.

**Input** :
- La strategie (output de l'Agent 1)
- Le contenu source scrappe (markdown tronque a 6000 chars)
- La langue souhaitee (en/fr/es/de)

**Output** :
```json
{
  "carousel_title": "Master Stripe Payments in 5 Steps",
  "carousel_subtitle": "From signup to first transaction",
  "slides": [
    {
      "slide_number": 0,
      "type": "cover",
      "title": "Master Stripe Payments",
      "subtitle": "From signup to first transaction"
    },
    {
      "slide_number": 1,
      "type": "step",
      "title": "Create Your Account",
      "instructions": [
        "-> Click the **Sign up** button at the top right",
        "-> Enter your **email address** and create a password",
        "-> Verify your **email** to activate your account"
      ],
      "screenshot_url": "https://stripe.com/register",
      "image_searches": [
        { "type": "logo", "query": "Stripe logo", "entity": "stripe.com", "purpose": "Logo in slide corner" }
      ],
      "annotations": [
        { "type": "circle_number", "label": "1", "target_description": "Sign up button", "position_hint": "top-right" }
      ]
    }
  ]
}
```

**Modele** : `claude-sonnet-4-20250514`
**Max tokens** : 4096
**Timeout** : 30s

**Resume du prompt systeme** :
> "You are a carousel copywriter. You write punchy, actionable slide content. Titles: max 6 words, impactful, action-oriented. Instructions: use arrows and **bold keywords**. Each instruction describes a VISIBLE UI action."

**Regles de style** :
- Titres : max 6 mots, orientes action
- Instructions : format `-> [Action] the **[element]** [context]`
- Maximum 3 instructions par slide step
- Instructions toutes differentes entre slides
- Syntaxe Markdown pour le gras : `**mot**`

---

### 3.3 Agent 3 — URL Explorer

**Fichier** : `modules/agent.js`, fonction `exploreUrls()`

**Role** : Valider et corriger les URLs de screenshot proposees par le Writer. L'URL Explorer compare les URLs proposees avec les liens reels trouves sur le site et applique un **matching semantique** entre le titre de chaque slide et le contenu de chaque URL.

**Input** :
- Les definitions de slides avec leurs URLs
- Les liens de navigation extraits du site source (jusqu'a 40 liens)

**Output** :
```json
[
  { "slide_number": 2, "original_url": "https://stripe.com", "corrected_url": "https://stripe.com/pricing", "reason": "Slide about pricing should use pricing page" },
  { "slide_number": 4, "original_url": "https://stripe.com/features", "corrected_url": "https://stripe.com/docs/api", "reason": "Slide about API integration should use docs/api page" }
]
```

**Modele** : `claude-sonnet-4-20250514`
**Max tokens** : 2048
**Timeout** : 20s

**Resume du prompt** :
> "You are a URL validator. Check if screenshot URLs are REAL pages. SEMANTIC MATCH: each URL's content must match the slide TITLE. Slide titled 'Explore Pricing' with homepage URL MUST be corrected to /pricing."

**Regles de matching** :
- Chaque URL doit correspondre semantiquement au titre du slide
- Jamais la page d'accueil pour plus d'1 slide
- Chaque slide doit avoir une URL differente
- Si aucune sous-page ne correspond, corriger vers la plus proche

---

### 3.4 Agent 4 — Screenshot Validator

**Fichier** : `modules/agent.js`, fonction `validateScreenshot()`

**Role** : Evaluer la qualite et la validite des screenshots capturees via Claude Vision. Rejette les pages 404, les pages blanches, les CAPTCHAs, les murs de cookies, et les pages bloquees.

**Input** : Buffer PNG du screenshot capture

**Output** :
```json
{
  "valid": true,
  "reason": "Feature page with clear CTA and navigation",
  "page_type": "feature_page",
  "ui_elements": ["Sign up free button", "Navigation menu", "Email input field"],
  "quality_score": 8
}
```

**Modele** : `claude-sonnet-4-20250514` (mode Vision)
**Max tokens** : 1024
**Timeout** : 20s

**Criteres de rejet** (`valid: false`) :
| Critere | Description |
|---------|-------------|
| Page 404 | Erreur HTTP, page introuvable |
| Page blanche | Contenu vide, page non chargee |
| CAPTCHA | Challenge Cloudflare, reCAPTCHA |
| Mur de cookies | Banniere de consentement plein ecran |
| Acces refuse | Paywall, login wall, page bloquee |
| Rectangles noirs | Videos non chargees couvrant >30% de la page |

**Criteres d'acceptation** (`valid: true`) :
- Tout page avec du contenu reel et des elements interactifs
- `quality_score` de 1 a 10 selon la richesse en elements UI

---

### 3.5 Agent 5 — Annotator (Vision + DOM Hybrid)

**Fichier** : `modules/agent.js`, fonction `selectAnnotationTargetsWithVision()`

**Role** : L'agent le plus complexe du pipeline. Il combine **Vision** (Claude voit le screenshot) et **DOM** (coordonnees exactes des elements via `getBoundingClientRect`) pour placer les annotations avec une precision pixel-perfect.

**Architecture hybride** :
1. **Vision** fournit l'intelligence : quel element est le plus pertinent a annoter
2. **DOM** fournit la precision : coordonnees exactes en pixels depuis le navigateur
3. **Resultat** : intelligence de Vision + precision du DOM = placement parfait

**Input** :
- Buffer PNG du screenshot
- Liste des elements DOM interactifs :
  ```json
  [
    { "index": 0, "tag": "button", "type": "", "text": "Sign up free",
      "rect": { "x": 820, "y": 28, "width": 140, "height": 44 } },
    { "index": 1, "tag": "a", "type": "", "text": "Pricing",
      "rect": { "x": 450, "y": 32, "width": 60, "height": 20 } }
  ]
  ```
- Contexte du slide (titre, topic, instructions deja utilisees sur les autres slides)
- Langue

**Output** :
```json
{
  "instructions": [
    "-> Click the **Sign up free** button to create your account",
    "-> Navigate to **Pricing** to see available plans",
    "-> Explore the **Solutions** dropdown for features"
  ],
  "target_indices": [0, 1, 5],
  "highlight_index": 0
}
```

Les `target_indices` referencent les elements DOM. Les coordonnees finales sont calculees directement a partir des `rect` DOM :

```javascript
const centerX = ((el.rect.x + el.rect.width / 2) / viewport.width) * 100;
const centerY = ((el.rect.y + el.rect.height / 2) / viewport.height) * 100;
```

**Modele** : `claude-sonnet-4-20250514` (mode Vision)
**Max tokens** : 1500
**Timeout** : 45s

**Resume du prompt** :
> "You are annotating a screenshot for a tutorial carousel. You can SEE the screenshot AND you have the exact DOM element positions. Pick exactly 3 elements that are VISIBLE, relevant to the slide topic, and SPREAD across different areas."

**Mecanismes de deduplication** :
- L'agent recoit les instructions deja utilisees sur les slides precedents (`avoid_instructions`)
- Si plus de 6 instructions ont deja ete utilisees, l'agent ne genere que 2-3 annotations au lieu de 3
- Apres generation, un post-traitement par fingerprinting (extraction du texte en gras) elimine les doublons restants

**Fallback** :
- Si < 3 elements DOM disponibles : fallback vers Vision-only (`analyzeScreenshotAndAnnotate()`)
- Si l'appel Vision+DOM echoue : fallback vers DOM-only (`selectAnnotationTargets()`)

---

### 3.6 Agent 6 — Quality Verifier

**Fichier** : `modules/agent.js`, fonction `verifyAnnotatedSlide()`

**Role** : Verification finale exhaustive de chaque slide annotee. L'agent 6 voit l'image composee (screenshot + annotations brulees) et verifie **tout** :

1. **Precision des cercles** : le cercle N est-il sur l'element decrit dans l'instruction N ?
2. **Visibilite des elements** : les elements mentionnes sont-ils reellement visibles ?
3. **Espacement** : les cercles sont-ils repartis sur des zones differentes ?
4. **Pertinence** : les elements annotes sont-ils pertinents par rapport au titre ?
5. **Coherence** : titre + instructions + annotations = un step tutoriel utile ?

**Input** : Buffer PNG de l'image annotee + metadonnees du slide

**Output** :
```json
{
  "passed": false,
  "score": 4,
  "issues": [
    { "type": "wrong_placement", "circle": 1, "detail": "Circle 1 is on the logo instead of Sign Up" },
    { "type": "too_close", "circles": [1, 2], "detail": "Circles 1 and 2 are clustered in top nav" }
  ],
  "suggestions": "Pick elements in different areas. Move circle 1 to the actual Sign Up button."
}
```

**Modele** : `claude-sonnet-4-20250514` (mode Vision)
**Max tokens** : 1500
**Timeout** : 30s

**Scoring** :

| Score | Qualite | Action |
|-------|---------|--------|
| 9-10 | Parfait | Production-ready |
| 7-8 | Bon | Utilisable tel quel |
| 5-6 | Mediocre | Re-annotation avec feedback |
| 1-4 | Mauvais | Re-annotation avec feedback |

**Seuil de passage** : 7
**Retries maximum** : 2

---

## 4. Systeme de Capture Multi-Couches

### 4.1 Architecture Generale

Le module de capture (`modules/capture.js`) gere la prise de screenshots avec une cascade de methodes. La particularite principale est que la capture se fait **en une seule passe** avec l'enumeration DOM, via la fonction `captureAllWithElements()`.

### 4.2 Priorite des Methodes (avec DOM)

Quand le pipeline a besoin des elements DOM (pour l'annotation pixel-perfect), la priorite est :

```
1. Steel.dev (cloud browser) ------> screenshot + elements DOM
   |                                  Timeout: 45s
   | echec
   v
2. Puppeteer local ----------------> screenshot + elements DOM
   |                                  Timeout: 30s
   | echec
   v
3. ScreenshotOne (API) ------------> screenshot SEUL (pas de DOM)
                                      Timeout: 35s
                                      --> Vision-only pour annotations
```

**Pourquoi Steel/Puppeteer en premier ?**

Steel.dev et Puppeteer sont des navigateurs reels qui executent le JavaScript de la page. Cela permet de :
1. **Enumerer les elements DOM** via `getBoundingClientRect()` dans le meme page load que le screenshot
2. Obtenir des **coordonnees pixel-perfect** : la position de chaque element correspond exactement a sa position sur le screenshot
3. ScreenshotOne est une API de capture qui ne donne aucune information DOM — les annotations doivent alors etre positionnees par Vision seule (moins precis)

### 4.3 Priorite des Methodes (sans DOM)

Pour les captures simples (`captureScreenshot()`), la priorite est differente :

```
1. ScreenshotOne API --> capture cloud, cache, anti-bot
2. Steel.dev        --> cloud browser, Cloudflare bypass
3. Puppeteer local  --> fallback
```

### 4.4 Enumeration des Elements Interactifs

La fonction `enumerateInteractiveElements()` s'execute dans le contexte du navigateur (`page.evaluate()`) et retourne tous les elements interactifs visibles :

```javascript
const selectors = [
  'a[href]', 'button', 'input', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
  '[onclick]', '.btn', '[class*="button"]', '[class*="cta"]',
];
```

**Filtrage** :
- Taille minimum : largeur >= 20px, hauteur >= 12px
- Visible dans le viewport (pas en dehors de l'ecran)
- Pas `display: none`, `visibility: hidden`, ou `opacity: 0`
- Doit avoir un texte (textContent, placeholder, ou aria-label) de >= 2 caracteres

**Donnees retournees par element** :
```json
{
  "index": 0,
  "tag": "button",
  "type": "submit",
  "text": "Sign up free",
  "rect": {
    "x": 820,
    "y": 28,
    "width": 140,
    "height": 44
  }
}
```

### 4.5 Gestion YouTube

Les URLs YouTube ne sont jamais capturees via navigateur. A la place :

1. Extraction du `videoId` depuis l'URL (supporte `/watch?v=`, `/youtu.be/`, `/embed/`)
2. Telechargement direct du thumbnail :
   - Priorite 1 : `maxresdefault.jpg` (1920x1080)
   - Priorite 2 : `hqdefault.jpg` (480x360)
3. Le resultat est retourne avec `elements: []` (pas d'enumeration DOM)

### 4.6 Deduplication par URL Normalisee

Quand plusieurs slides partagent la meme URL, le screenshot n'est capture qu'une seule fois :

```javascript
const normalizedUrl = slide.screenshot_url.replace(/\/+$/, '').toLowerCase();
if (urlCache.has(normalizedUrl)) {
  fs.copyFileSync(urlCache.get(normalizedUrl), outputPath);
  // ...reuse les elements DOM aussi
} else {
  const result = await captureScreenshotWithElements(url, outputPath);
  urlCache.set(normalizedUrl, result);
}
```

### 4.7 Gestion des Popups et Videos

Avant chaque capture, deux fonctions de nettoyage s'executent :

**`dismissPopups(page)`** — essaie de fermer les bannieres de cookies et popups :
- YouTube/Google consent : `button[aria-label="Accept all"]`
- Generiques : `[class*="cookie"] button`, `#onetrust-accept-btn-handler`
- Boutons de fermeture : `button[aria-label*="close"]`

**`hideVideoElements(page)`** — masque les videos/iframes (qui rendent comme des rectangles noirs) :
```css
video, iframe[src*="youtube"], iframe[src*="vimeo"] {
  visibility: hidden !important;
  background: #F0F0F0 !important;
}
```

### 4.8 Timeouts et Gestion d'Erreurs

Chaque methode de capture est wrappee dans un timeout :

| Methode | Timeout |
|---------|---------|
| Steel.dev (connect) | 15s |
| Steel.dev (capture) | 45s |
| ScreenshotOne | 35s |
| Puppeteer local | 30s |
| Puppeteer (page goto) | 20s |

Un helper `withTimeout()` utilise `Promise.race()` pour interrompre la capture si le timeout est depasse.

---

## 5. Systeme d'Annotation Pixel-Perfect

### 5.1 Le Probleme du Positionnement CSS

Dans les versions precedentes, les annotations etaient positionnees via CSS (`position: absolute` dans un conteneur relatif contenant le screenshot). Cette approche generait des **problemes systematiques** :

- `object-fit: cover/contain` modifie la taille affichee de l'image
- `aspect-ratio` CSS et les calculs flexbox deplacent le conteneur
- Le ratio reel du screenshot ne correspond pas au ratio du template
- Les coordonnees en pourcentage du conteneur ne correspondent pas aux pourcentages de l'image

**Solution** : Compositer les annotations **directement dans les pixels du screenshot** avant de l'injecter dans le template.

### 5.2 Architecture en 3 Passes

```
PASS 1 — DOM (capture.js)
=============================
Pendant la capture du screenshot, le navigateur enumere tous les
elements interactifs avec getBoundingClientRect().
Resultat : coordonnees pixel-exact dans le referentiel du viewport.

         |
         v

PASS 2 — Vision + DOM (agent.js)
=============================
Claude voit le screenshot ET connait les positions DOM exactes.
Vision choisit les meilleurs elements a annoter.
Le pipeline convertit les indices DOM en coordonnees pourcentage :
  centerX = ((el.rect.x + el.rect.width / 2) / viewport.width) * 100

         |
         v

PASS 3 — Sharp Compositing (annotator.js)
=============================
Les annotations (cercles, encadres, fleches) sont generees en SVG
puis compositees directement sur les pixels du screenshot via Sharp.
Resultat : image PNG avec annotations brulees. Plus de CSS overlay.
```

### 5.3 Module Annotator (`modules/annotator.js`)

Le module `annotator.js` genere des SVG pour chaque type d'annotation et les composite sur l'image screenshot via Sharp.

**Design System** :

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `ACCENT` | `#D97757` | Couleur terra cotta (accentuation) |
| `ACCENT_RGBA` | `rgba(217,119,87,0.3)` | Couleur accent avec transparence |
| `CIRCLE_R` | 22px | Rayon du cercle d'annotation |
| `CIRCLE_CANVAS` | 60px | Taille du canvas SVG du cercle |
| `HL_BORDER` | 3px | Epaisseur de la bordure highlight box |
| `HL_RADIUS` | 12px | Rayon des coins arrondis highlight box |
| `HL_GLOW` | 8px | Padding pour le halo lumineux |

**Types d'annotations** :

#### Cercle Numerote (`circle_number`)

```svg
<circle cx="30" cy="30" r="24" fill="none" stroke="rgba(217,119,87,0.3)" stroke-width="2"/>
<circle cx="30" cy="30" r="22" fill="#D97757"
        stroke="rgba(255,255,255,0.35)" stroke-width="2.5" filter="url(#ds)"/>
<text x="30" y="30" text-anchor="middle" dominant-baseline="central"
      font-family="Liberation Sans" font-size="20" font-weight="bold" fill="white">1</text>
```

Caracteristiques visuelles :
- Cercle plein terra cotta (#D97757)
- Bordure blanche semi-transparente
- Halo exterieur semi-transparent
- Ombre portee (drop-shadow)
- Chiffre blanc centre, Inter/Liberation Sans, 20px, bold

#### Encadre Highlight (`highlight_box`)

```svg
<rect x="4" y="4" width="w+8" height="h+8"
      fill="none" stroke="rgba(217,119,87,0.3)" stroke-width="4" rx="14"/>
<rect x="8" y="8" width="w" height="h"
      fill="none" stroke="#D97757" stroke-width="3" rx="12"/>
```

Caracteristiques :
- Bordure terra cotta, 3px
- Coins arrondis 12px
- Halo exterieur pour meilleure visibilite
- Pas de remplissage (transparent)

#### Fleche Courbe (`arrow`)

Generee via un path SVG Bezier quadratique :
```svg
<path d="M x1 y1 Q ctrlX ctrlY, x2 y2" stroke="#D97757" stroke-width="3.5"/>
<polygon points="..." fill="#D97757"/>
```

Caracteristiques :
- Courbe Bezier avec point de controle au-dessus du milieu
- Pointe de fleche triangulaire
- Epaisseur 3.5px, couleur accent

### 5.4 Ordre de Compositing (Z-Index)

```
Couche 1 (fond)  : Screenshot original
Couche 2 (z=5)   : Highlight boxes
Couche 3 (z=8)   : Fleches courbes
Couche 4 (z=10)  : Cercles numerotes (toujours au-dessus)
```

### 5.5 Calcul des Coordonnees

Les coordonnees sont exprimees en **pourcentage de l'image** (0-100) :

```javascript
// Conversion DOM → pourcentage
const cx = Math.round((circle.x_percent / 100) * imgW);
const cy = Math.round((circle.y_percent / 100) * imgH);
```

**Clamping** : toutes les coordonnees sont bornees pour eviter que les annotations sortent de l'image :
```javascript
left: Math.max(0, Math.min(imgW - CIRCLE_CANVAS, cx - CIRCLE_CENTER))
top:  Math.max(0, Math.min(imgH - CIRCLE_CANVAS, cy - CIRCLE_CENTER))
```

### 5.6 Avantages de l'Approche Directe

| Ancienne approche (CSS) | Nouvelle approche (Sharp) |
|--------------------------|---------------------------|
| `position: absolute` dans un div | Composite directement sur les pixels |
| Affecte par `object-fit`, flexbox | Independant du layout CSS |
| Coordonnees relatives au conteneur | Coordonnees relatives a l'image |
| Visible uniquement dans le navigateur | Grave dans le PNG final |
| Bugs de positionnement frequents | Zero bug de positionnement |

---

## 6. Boucle de Verification Qualite

### 6.1 Fonctionnement

Apres le compositing des annotations, l'Agent 6 (Quality Verifier) examine **chaque slide annotee** :

```
Pour chaque slide step avec annotations :
  |
  |-- tentative = 0
  |
  +-> Verifier l'image annotee (Agent 6 Vision)
      |
      |-- score >= 7 ? --> PASSE. Fin.
      |
      |-- score < 7 ET tentative < max_retries (2) ?
      |   |
      |   +-> Extraire le feedback des issues
      |   +-> Re-annoter avec le feedback (Agent 5 Vision+DOM)
      |   +-> Re-compositer sur le screenshot ORIGINAL (clean)
      |   +-> tentative++
      |   +-> Retour a la verification
      |
      |-- score < 7 ET tentative >= max_retries ?
          |
          +-> Garder la version actuelle. Fin.
```

### 6.2 Types de Problemes Detectes

| Type | Description | Exemple |
|------|-------------|---------|
| `wrong_placement` | Cercle place sur le mauvais element | "Circle 1 is on the logo instead of Sign Up button" |
| `too_close` | Cercles trop proches (<10% sur les 2 axes) | "Circles 1 and 2 are clustered in the top nav" |
| `not_visible` | Element mentionne mais invisible | "Instruction mentions a search bar but none is visible" |
| `irrelevant` | Element annote non pertinent | "Footer link annotated when CTA button was available" |
| `incoherent` | Titre et instructions ne correspondent pas | "Title says Configure Billing but instructions are about homepage" |

### 6.3 Boucle de Retry

Quand le score est < 7, le systeme :

1. **Extrait le feedback** : les `issues` et `suggestions` du verifier sont convertis en texte
2. **Re-annote avec feedback** : l'Agent 5 recoit le feedback dans `rejection_feedback`
   ```
   PREVIOUS ATTEMPT WAS REJECTED by quality inspector. Issues:
   Circle 1 is on the logo instead of Sign Up button. Circles 1 and 2 are clustered.
   You MUST pick DIFFERENT elements that fix ALL issues above. Spread circles further apart.
   ```
3. **Re-composite** sur le screenshot **original** (non annote) — pas sur la version annotee precedente
4. **Re-verifie** avec l'Agent 6

**Important** : le screenshot original est conserve (`slide._originalScreenshotPath`) pour que chaque retry parte d'une image propre.

### 6.4 Limites des Retries

- Maximum **2 retries** par slide (soit 3 tentatives au total)
- Si les elements DOM sont insuffisants (< 3), pas de retry possible
- En cas d'echec de l'appel API, la boucle s'arrete immediatement
- Si le max retries est atteint, la derniere version est conservee

---

## 7. Rendu et Templates

### 7.1 Systeme de Templates

Le rendu est gere par `modules/renderer.js`. Le processus est simple :
1. Lire le fichier HTML du template
2. Remplacer les variables `{{variable}}` par les donnees
3. Ajuster les dimensions CSS pour le format choisi
4. Rendre le HTML en PNG via Puppeteer

### 7.2 Les 3 Types de Slides

#### Type C — Cover (`templates/cover.html`)

La slide de couverture. Layout centre, pas de screenshot.

**Structure** :
```
+---------------------------+
|                           |
|         [Logo]            |  <- Logo du site source (72x72px)
|                           |
|     [ 5 steps ]           |  <- Badge avec nombre d'etapes
|     ___________           |  <- Ligne accent terra cotta
|                           |
|   TITRE DU CAROUSEL       |  <- 64px, font-weight 900
|                           |
|   Sous-titre explicatif   |  <- 24px, gris clair
|                           |
|      site.com             |  <- Domaine source
|                           |
|     AutoCarousel           |  <- Branding footer
|  autocarousel.glorics.com |
+---------------------------+
```

**Variables** :
| Variable | Description |
|----------|-------------|
| `{{title}}` | Titre du carousel |
| `{{subtitle}}` | Sous-titre |
| `{{slide_count}}` | Nombre d'etapes |
| `{{logo_html}}` | HTML du logo (image base64) |
| `{{source_domain}}` | Domaine du site source |

**Elements visuels** :
- Gradient radial subtle en arriere-plan (accent a 10% et 7% d'opacite)
- Badge avec bordure accent, fond semi-transparent
- Ligne decorative accent (56px x 4px)

#### Type A — Step (`templates/step.html`)

La slide d'etape tutoriel. C'est le type principal.

**Structure** :
```
+---------------------------+
| 1. Titre de l'etape  [Logo]|
| __________________________ |  <- Separateur accent
|                            |
|  +----------------------+  |
|  |                      |  |
|  |    SCREENSHOT        |  |  <- Image annotee (avec
|  |    (avec annotations |  |     cercles brules)
|  |     brulees)         |  |
|  |                      |  |
|  +----------------------+  |
|                            |
|  (1) Instruction un        |  <- Legende numerotee
|  (2) Instruction deux      |
|  (3) Instruction trois     |
+---------------------------+
```

**Variables** :
| Variable | Description |
|----------|-------------|
| `{{slide_number}}` | Numero de l'etape |
| `{{title}}` | Titre de l'etape |
| `{{logo_html}}` | Logo de l'outil (56x56px) |
| `{{screenshot_content}}` | `<img>` du screenshot annote (base64) |
| `{{screenshot_aspect_ratio}}` | Ratio du screenshot (ex: `960 / 720`) |
| `{{legend_html}}` | Items de legende numerotes |

**Mise en page** :
- Header flex : titre (flex:1) + logo (flex-shrink:0)
- Separateur accent 3px
- Zone screenshot (flex:1) avec coins arrondis 12px et ombre
- Legende en bas (flex-shrink:0)

**Legende** : chaque item comporte un cercle numerote (32x32px, accent) et le texte de l'instruction correspondante. Les mots entre `**` sont rendus en `<strong>`.

#### Type B — Resource (`templates/resource.html`)

La slide de ressource. Affiche un contenu media (YouTube, article).

**Structure** :
```
+---------------------------+
| [07]                      |  <- Badge numero accent
|                           |
| Titre de la ressource     |  <- 42px, bold
|                           |
| +-------------------------+|
| | Description avec des    ||  <- Fond #1A1A1A, padding 28px
| | **mots en gras**        ||
| +-------------------------+|
|                           |
| +-------------------------+|
| |                         ||
| |   [Youtube thumbnail]   ||  <- Embed YouTube mock
| |      [PLAY]             ||
| |                         ||
| |  YT | Titre video       ||
| +-------------------------+|
+---------------------------+
```

**Variables** :
| Variable | Description |
|----------|-------------|
| `{{slide_number}}` | Numero du badge |
| `{{title}}` | Titre de la ressource |
| `{{description_html}}` | Description avec bold |
| `{{media_html}}` | HTML de l'embed media |

### 7.3 Les 3 Formats

| Format | Dimensions | Usage principal |
|--------|-----------|-----------------|
| **3:4** | 1080 x 1440 px | LinkedIn |
| **4:5** | 1080 x 1350 px | Instagram (defaut) |
| **9:16** | 1080 x 1920 px | Stories, Reels |

Le format est ajuste dynamiquement via CSS custom properties :
```css
:root {
  --slide-w: 1080px;
  --slide-h: 1350px;  /* modifie selon le format */
}
```

### 7.4 Design System

**Palette de couleurs** :

| Variable | Couleur | Usage |
|----------|---------|-------|
| `--bg` | `#0D0D0D` | Fond des slides |
| `--text` | `#FFFFFF` | Texte principal |
| `--text-muted` | `#CCCCCC` | Texte secondaire |
| `--accent` | `#D97757` | Terra cotta — accent principal |
| `--separator` | `#D97757` | Separateurs |
| `--card-bg` | `#1A1A1A` | Fond des cartes (resource) |

**Typographie** :
- Police : **Inter** (Google Fonts)
- Fallbacks : -apple-system, BlinkMacSystemFont, sans-serif
- Titres step : 52px, font-weight 900, line-height 1.15
- Titres cover : 64px, font-weight 900, letter-spacing -0.02em
- Legende : 21px, font-weight 500, line-height 1.5
- Badge : 22px, font-weight 800

**Coins arrondis** :
- Screenshot : 12px
- Logo : 14px (step), 18px (cover)
- Badge : 8px (resource), 100px (cover)
- Carte description : 12px

### 7.5 Processus de Rendu

```javascript
async function renderTemplate(templateName, data, format) {
  // 1. Lire le fichier HTML
  let html = fs.readFileSync(templatePath, 'utf-8');

  // 2. Ajuster les dimensions
  html = html.replace(/--slide-w:\s*\d+px/, `--slide-w: ${dim.width}px`);
  html = html.replace(/--slide-h:\s*\d+px/, `--slide-h: ${dim.height}px`);

  // 3. Remplacer les variables {{key}}
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(/\{\{key\}\}/g, () => value);
  }

  // 4. Nettoyer les variables non remplacees
  html = html.replace(/\{\{[a-z_]+\}\}/g, '');

  // 5. Rendre en PNG via Puppeteer
  return renderHtmlToPng(html, format);
}
```

Le rendu Puppeteer :
- Viewport configure a la taille exacte du format
- `waitUntil: 'networkidle0'` pour attendre le chargement complet
- `document.fonts.ready` pour attendre le chargement d'Inter
- Screenshot clippe aux dimensions exactes
- Les styles de preview (background #333) sont retires automatiquement

---

## 8. Scraping Multi-Sources

### 8.1 Architecture de Scraping

Le module `modules/scraper.js` extrait le contenu d'une URL avec une cascade de methodes.

**Priorite** :
```
1. Detection YouTube --> scrapeYouTube() via oEmbed
   |
   | si ce n'est pas YouTube
   v
2. Steel.dev (cloud browser) --> scrapeWithSteel()
   |                              Timeout: 30s, contenu > 100 chars
   | echec ou contenu insuffisant
   v
3. Jina Reader (API gratuite) --> scrapeWithJina()
   |                               Timeout: 15s, contenu > 100 chars
   | echec
   v
4. Cheerio (fetch + parse HTML) --> scrapeWithCheerio()
                                     Timeout: 15s
```

### 8.2 Steel.dev — Cloud Browser

Steel.dev est un service de navigateur cloud accessible via WebSocket. Puppeteer se connecte a l'endpoint Steel pour naviguer vers la page.

```javascript
const wsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
```

**Extraction du contenu** :
1. Navigation vers l'URL avec `networkidle2`
2. Attente de 2 secondes pour le contenu dynamique
3. Extraction via `page.evaluate()` :
   - Liens de navigation (avant suppression du bruit)
   - Suppression du bruit (`script, style, nav, footer, header, iframe, ads, sidebar, cookie, banner, popup`)
   - Titre (og:title > document.title > h1)
   - Contenu principal (article > main > [role=main] > .content > body)
   - Conversion en markdown (headings, paragraphes, listes, blockquotes, code)
   - Images (og:image + images du contenu)
   - Metadata (author, description)

**Avantages** : Execute le JavaScript, bypass Cloudflare/CAPTCHAs, rend les SPA.

### 8.3 Jina Reader — API Markdown Gratuite

```javascript
const jinaUrl = `https://r.jina.ai/${url}`;
const { data } = await axios.get(jinaUrl, {
  headers: { 'Accept': 'text/markdown' }
});
```

Jina Reader retourne directement du Markdown propre. Le module extrait :
- Titre (premier heading `# ...`)
- Images (regex `![alt](url)`)
- Liens (regex `[text](url)`)

**Avantages** : Gratuit, pas d'API key, retourne du Markdown propre.
**Inconvenients** : Ne gere pas les sites proteges par Cloudflare.

### 8.4 Cheerio — Parsing HTML Statique

Dernier recours : telechargement HTTP direct + parsing avec Cheerio.

```javascript
const { data: html } = await axios.get(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...' }
});
const $ = cheerio.load(html);
```

**Extraction** :
- Navigation links (avant suppression du bruit)
- Contenu principal (memes selecteurs que Steel.dev)
- Conversion HTML vers markdown simplifie (`htmlToSimpleMarkdown`)
- Images et metadata

**Inconvenients** : Pas de JavaScript, pas de SPA, pas de Cloudflare bypass.

### 8.5 YouTube oEmbed

Pour les URLs YouTube, le scraping utilise l'API oEmbed :

```javascript
const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
```

**Donnees extraites** :
- `title` : titre de la video
- `author_name` : nom de la chaine
- `thumbnail` : URL du thumbnail maxresdefault
- `video_id` : identifiant de la video

### 8.6 Extraction et Filtrage des Liens de Navigation

Tous les scrapers extraient les liens de navigation **avant** de supprimer les elements de bruit. Ces liens sont essentiels pour l'Agent 3 (URL Explorer).

**Filtrage** (`filterNavigationLinks()`) :
- Garde les liens du meme domaine en priorite
- Supprime les patterns de bruit : login, signup, privacy, terms, cookie, legal
- Supprime les liens vers les reseaux sociaux (facebook, twitter, linkedin, instagram)
- Maximum 50 liens apres filtrage

### 8.7 Structure de Sortie

```json
{
  "url": "https://stripe.com",
  "type": "article",
  "title": "Stripe | Financial Infrastructure",
  "content_markdown": "# Stripe\n\nFinancial infrastructure...",
  "images": [
    { "src": "https://stripe.com/og-image.png", "alt": "OG Image" }
  ],
  "navigation_links": [
    { "text": "Products", "href": "https://stripe.com/products" },
    { "text": "Pricing", "href": "https://stripe.com/pricing" }
  ],
  "metadata": {
    "author": "",
    "description": "Financial infrastructure for the internet",
    "source": "steel"
  }
}
```

---

## 9. Recherche d'Images

### 9.1 Architecture

Le module `modules/image-search.js` gere la recherche et le telechargement d'images pour les slides. Il supporte plusieurs types d'images.

### 9.2 Types d'Images Supportes

| Type | Source | Usage |
|------|--------|-------|
| `logo` / `icon` | Google Favicon > DuckDuckGo > logo.dev | Logo d'outil dans les slides step |
| `youtube_thumb` | YouTube direct (maxres > hq) | Thumbnail de video pour slides resource |
| `image_search` | SerpAPI Google Images (optionnel) | Images generiques |
| `screenshot` | Module capture (redirection) | Gere separement |

### 9.3 Cascade de Logos

La recherche de logos utilise une cascade de 3 sources :

```
1. Google Favicon (le plus fiable)
   URL : https://www.google.com/s2/favicons?domain={domain}&sz=128
   |
   | echec ou < 200 bytes
   v
2. DuckDuckGo Icons
   URL : https://icons.duckduckgo.com/ip3/{domain}.ico
   |
   | echec ou < 200 bytes
   v
3. logo.dev (token anonyme)
   URL : https://img.logo.dev/{domain}?token=pk_anonymous&size=128&format=png
   |
   | echec ou < 1000 bytes
   v
   ERREUR : "No logo found for {domain}"
```

**Normalisation du domaine** (`normalizeDomain()`) :
- Supprime le protocole et le chemin
- Ajoute `.com` si pas de TLD
- Exemples : `anthropic` -> `anthropic.com`, `bit.ly` -> `bit.ly`

**Traitement** : tous les logos sont redimensionnes a 128x128px (ou 200x200px pour logo.dev) via Sharp, avec fond transparent et format PNG.

### 9.4 YouTube Thumbnails

```javascript
const urls = [
  `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,  // 1920x1080
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,      // 480x360
];
```

Les thumbnails sont redimensionnes a 960x540px (ratio 16:9) en mode `cover`, format JPEG qualite 90.

### 9.5 Google Images via SerpAPI

Optionnel (necessite `SERPAPI_KEY`). Cherche des images generiques via l'API Google Images de SerpAPI :

```javascript
const { data } = await axios.get('https://serpapi.com/search.json', {
  params: {
    engine: 'google_images',
    q: query,
    api_key: serpKey,
    num: 3,
  }
});
```

Essaie les 3 premiers resultats. Redimensionnement a max 800px de large.

### 9.6 Traitement des Screenshots

La fonction `processScreenshot()` transforme un screenshot brut :

1. **Crop** si trop tall (max ratio 4:3, garde le haut, coupe le bas)
2. **Resize** proportionnel a 960px de large
3. **Coins arrondis** via un masque SVG :
   ```javascript
   const roundedMask = Buffer.from(
     `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="12" ry="12"/></svg>`
   );
   await sharp(inputPath)
     .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
     .resize(width, height)
     .composite([{ input: roundedMask, blend: 'dest-in' }])
     .png().toFile(outputPath);
   ```

---

## 10. Interface Web

### 10.1 Apercu General

L'interface web (`public/index.html`) est une application **single-page en vanilla JavaScript** avec un theme sombre.

### 10.2 Layout et Composants

```
+-------------------------------------------------------+
| Auto[Carousel]                   API Status | Logout   |
+-------------------------------------------------------+
|                                                       |
|          URL -> Carousel                              |
|          Paste any URL. Get annotated tutorial slides. |
|                                                       |
|   URL                                                 |
|   [ https://docs.anthropic.com/...              ]     |
|                                                       |
|   LANGUAGE                                            |
|   [ EN ] [ FR ] [ ES ] [ DE ]                         |
|                                                       |
|   FORMAT                                              |
|   [ 3:4 ] [ 4:5 ] [ 9:16 ]                           |
|                                                       |
|   [ Generate Carousel ]                               |
|                                                       |
|   === PROGRESS (SSE) ===                              |
|   [============================------] 75%            |
|   scraping   Extracting content from URL...           |
|   analyzing  Planning carousel structure...           |
|   capturing  Capturing 5 screenshots...               |
|                                                       |
|   === RESULTS ===                                     |
|   Carousel Title                    [Download ZIP]    |
|   +------+ +------+ +------+ +------+               |
|   |Slide1| |Slide2| |Slide3| |Slide4|               |
|   +------+ +------+ +------+ +------+               |
+-------------------------------------------------------+
```

### 10.3 Selecteurs

**Langue** : 4 options (EN, FR, ES, DE). La selection transmet le code langue au backend qui le passe a tous les agents IA.

**Format** : 3 options (3:4, 4:5, 9:16). La selection transmet le ratio au backend qui ajuste les dimensions des templates.

### 10.4 SSE (Server-Sent Events)

Le suivi en temps reel utilise SSE. Le frontend ouvre une connexion POST et lit le stream via `ReadableStream`.

**Cote serveur** :
```javascript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
});

const sendEvent = (event, data) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
```

**Types d'evenements** :

| Event | Donnees | Description |
|-------|---------|-------------|
| `status` | `{ step, message }` | Progression du pipeline |
| `complete` | `{ job_id, slides, zip_url }` | Resultat final |
| `error` | `{ message }` | Erreur |

**Etapes de progression** :

| Step | Progression | Description |
|------|-------------|-------------|
| `scraping` | 15% | Extraction du contenu |
| `analyzing` | 40% | Agents 1-3 (strategie + ecriture + URL) |
| `searching` | 60% | Recherche d'images |
| `capturing` | 75% | Capture screenshots |
| `validating` | ~78% | Validation screenshots (Agent 4) |
| `refining` | ~85% | Annotation + verification (Agents 5-6) |
| `rendering` | 90% | Rendu des slides PNG |

**Cote frontend** :
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();
// Lecture en boucle du stream
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events...
}
```

### 10.5 Affichage des Resultats

A la reception de l'evenement `complete`, l'interface affiche :
- Le titre du carousel
- Une grille de vignettes cliquables (ouvrent l'image en plein ecran)
- Un bouton "Download ZIP" liant vers `/download/{jobId}`

### 10.6 Design System UI

| Variable CSS | Valeur | Usage |
|-------------|--------|-------|
| `--bg` | `#0A0A0A` | Fond principal |
| `--surface` | `#141414` | Fond des champs/cartes |
| `--surface-2` | `#1E1E1E` | Fond secondaire |
| `--border` | `#2A2A2A` | Bordures |
| `--text` | `#FFFFFF` | Texte principal |
| `--text-muted` | `#888888` | Texte secondaire |
| `--accent` | `#D97757` | Couleur accent |
| `--accent-hover` | `#E08A6A` | Accent au survol |
| `--accent-dim` | `rgba(217,119,87,0.12)` | Accent attenue |
| `--radius` | `12px` | Rayon des coins |

---

## 11. Infrastructure de Production

### 11.1 Serveur

| Parametre | Valeur |
|-----------|--------|
| **Hebergeur** | Hostinger KVM 2 |
| **OS** | Debian 13 (Trixie) |
| **RAM** | 8 Go |
| **Disque** | 99 Go |
| **IP** | 89.116.110.171 |
| **Domaine** | autocarousel.glorics.com |

### 11.2 Architecture Reseau

```
Client (HTTPS)
     |
     v
+------------------+
| Apache 2.4.66    |  Port 443 (SSL)
| Reverse Proxy    |  Headers: flushpackets=on (SSE)
+------------------+
     |
     v (HTTP localhost)
+------------------+
| Node.js Express  |  Port 3000
| AutoCarousel     |
+------------------+
     |
     +--> Puppeteer (headless Chrome)
     +--> APIs externes (Claude, Steel, ScreenshotOne)
```

### 11.3 Apache — Configuration Reverse Proxy

Le choix d'Apache (plutot que Nginx) est une preference utilisateur. La configuration inclut :

- **Reverse proxy** vers `localhost:3000`
- **Support SSE** : `flushpackets=on` pour que les evenements soient envoyes immediatement au client (sans mise en tampon par Apache)
- **SSL** : certificat Let's Encrypt, renouvellement automatique

### 11.4 SSL / Let's Encrypt

| Parametre | Valeur |
|-----------|--------|
| Methode | Certbot avec plugin Apache |
| Expiration | 5 juin 2026 |
| Renouvellement | Automatique (cron certbot) |
| Protocole | TLS 1.2+ |

### 11.5 Service systemd

Le serveur est gere comme un service systemd (`autocarousel.service`) :

- **Auto-restart** en cas de crash (`Restart=on-failure`)
- **Demarrage au boot** (`WantedBy=multi-user.target`)
- **Chemin** : `/opt/autocarousel/`

### 11.6 Deploiement

Le deploiement se fait via rsync + redemarrage du service :

```bash
rsync -avz --exclude='node_modules' --exclude='outputs' --exclude='.env' \
  -e "ssh -i ~/.ssh/id_autocarousel" ./ root@89.116.110.171:/opt/autocarousel/

ssh -i ~/.ssh/id_autocarousel root@89.116.110.171 "systemctl restart autocarousel"
```

**Exclusions** :
- `node_modules` : installe sur le serveur
- `outputs` : genere sur le serveur, ne pas ecraser
- `.env` : configuration specifique au serveur (API keys)

### 11.7 Cleanup

Les fichiers de sortie sont conserves 24h, puis supprimes par un cron. Chaque job cree un dossier unique dans `/opt/autocarousel/outputs/` avec le format `job_{timestamp}_{random}`.

---

## 12. Scope et Cas d'Usage

### 12.1 Cas d'Usage Ideaux

| Type de site | Qualite attendue | Pourquoi |
|-------------|------------------|----------|
| **SaaS avec sous-pages riches** (Stripe, GitHub, Notion) | Excellent | Nombreuses sous-pages distinctes, elements UI riches, bonne structure |
| **Documentation technique** (docs.anthropic.com, MDN) | Excellent | Contenu structure, sections claires, navigation logique |
| **Articles de blog** | Bon | Contenu riche, structure en headings, images |
| **Chaines YouTube** | Bon | Elements interactifs distincts (play button, subscribe, tabs) |

### 12.2 Cas d'Usage Difficiles

| Type de site | Qualite attendue | Pourquoi |
|-------------|------------------|----------|
| **Sites marketing uniformes** (Notion landing, Airtable) | Moyen | Pages tres similaires, memes CTAs partout, peu de sous-pages distinctes |
| **Single-page apps** sans routes | Faible | Pas de sous-pages a capturer, tout est sur la meme URL |
| **Sites proteges** (login wall, paywall) | Variable | Screenshots bloques, contenu inaccessible |

### 12.3 Langues Supportees

| Code | Langue | Support |
|------|--------|---------|
| `en` | Anglais | Complet (defaut) |
| `fr` | Francais | Complet |
| `es` | Espagnol | Complet |
| `de` | Allemand | Complet |

Le support multilingue est integre dans chaque agent IA via des prompts traduits. Les titres, instructions et descriptions sont generes dans la langue choisie.

### 12.4 Parametres Utilisateur

| Parametre | Valeurs | Defaut |
|-----------|---------|--------|
| URL | Toute URL valide | - |
| Format | 3:4, 4:5, 9:16 | 4:5 |
| Langue | en, fr, es, de | en |
| Max slides | 1-10 | 7 |

---

## 13. Limites Connues

### 13.1 Limites Fonctionnelles

| Limite | Impact | Mitigation |
|--------|--------|------------|
| **Sites marketing uniformes** | Memes CTAs sur chaque page, deduplication agressive | Le dedup par fingerprinting retire les doublons, mais le nombre d'instructions uniques est reduit |
| **Temps de generation** | 3-8 minutes selon la complexite et les retries | SSE pour le suivi en temps reel |
| **Cout API** | ~8-20 appels Claude Sonnet par carousel | Prompts optimises, max_tokens limites, mode mock pour le dev |
| **Precision Vision** | Claude Vision peut se tromper sur les coordonnees (<5% des cas) | La boucle de verification (Agent 6) detecte et corrige via retry |

### 13.2 Limites Techniques

| Limite | Description |
|--------|-------------|
| **Browser singleton Puppeteer** | Un seul processus Puppeteer partage entre les captures et le rendu. Risque de fuite memoire sous charge |
| **Pas de rate limiting** | Pas de limitation du nombre de requetes simultanees. Un abus pourrait saturer le serveur |
| **Pas de git repo** | Le code n'est pas versionne dans un depot git |
| **Pas de tests automatises** | Pas de suite de tests unitaires ou d'integration |
| **Pas de queue de jobs** | Les generations sont traitees synchroniquement, pas de file d'attente |
| **Pas de caching IA** | Les memes URLs regenerent tout a chaque fois, pas de cache des resultats IA |
| **Content truncation** | Le contenu est tronque a 6000-8000 caracteres pour rester dans les limites de tokens |

### 13.3 Limites d'Infrastructure

| Limite | Description |
|--------|-------------|
| **Instance unique** | Un seul serveur, pas de load balancing |
| **Pas de monitoring** | Pas de Prometheus/Grafana, pas d'alertes |
| **Pas de backup** | Pas de backup automatise des donnees (outputs ephemeres de toute facon) |
| **Retention** | Les outputs sont supprimes apres 24h |

---

## 14. APIs Externes

### 14.1 Liste Exhaustive

| API | Role | Type | Obligatoire |
|-----|------|------|-------------|
| **Anthropic Claude Sonnet** | 6 agents IA (texte + Vision) | Payante | Oui |
| **Steel.dev** | Cloud browser (scraping + capture) | Payante | Non (Puppeteer local en fallback) |
| **ScreenshotOne** | Captures d'ecran cloud | Payante | Non (Puppeteer en fallback) |
| **Google Favicon** | Logos de sites web | Gratuite | Non (DuckDuckGo en fallback) |
| **DuckDuckGo Icons** | Logos de sites web | Gratuite | Non (logo.dev en fallback) |
| **logo.dev** | Logos de sites web | Gratuite (token anonyme) | Non |
| **Jina Reader** | Scraping Markdown | Gratuite | Non (Cheerio en fallback) |
| **YouTube oEmbed** | Metadata videos YouTube | Gratuite | Non (seulement pour YouTube) |
| **SerpAPI** | Google Images (images generiques) | Payante | Non (optionnel) |

### 14.2 Detail des APIs Payantes

#### Anthropic Claude Sonnet

| Parametre | Valeur |
|-----------|--------|
| **Modele** | `claude-sonnet-4-20250514` |
| **Endpoint** | `https://api.anthropic.com/v1/messages` |
| **Version API** | `2023-06-01` |
| **Variable env** | `ANTHROPIC_API_KEY` |
| **Appels par carousel** | 8-20 (selon nombre de slides et retries) |

**Repartition des appels** :

| Agent | Appels | Mode |
|-------|--------|------|
| Strategist | 1 | Texte |
| Writer | 1 | Texte |
| URL Explorer | 1 | Texte |
| Screenshot Validator | 1 par screenshot | Vision |
| Annotator | 1 par screenshot | Vision |
| Quality Verifier | 1-3 par slide (retries) | Vision |

#### Steel.dev

| Parametre | Valeur |
|-----------|--------|
| **Endpoint** | `wss://connect.steel.dev?apiKey={key}` |
| **Variable env** | `STEEL_API_KEY` |
| **Usage** | Scraping + capture screenshots |
| **Protocole** | WebSocket (Puppeteer connect) |

#### ScreenshotOne

| Parametre | Valeur |
|-----------|--------|
| **Endpoint** | `https://api.screenshotone.com/take` |
| **Variable env** | `SCREENSHOTONE_API_KEY` |
| **Usage** | Capture screenshots cloud |
| **Options** | viewport 1080x1080, block_cookie_banners, block_ads, delay 3s, cache 4h |

### 14.3 Variables d'Environnement

```bash
# Obligatoire
ANTHROPIC_API_KEY=sk-ant-...

# Optionnel (ameliore la qualite)
STEEL_API_KEY=...
SCREENSHOTONE_API_KEY=...
SERPAPI_KEY=...

# Auth
AUTH_USER=admin
AUTH_PASS=...

# Configuration
PORT=3000
OUTPUT_DIR=./outputs
MOCK_AGENT=false
```

---

## 15. Securite

### 15.1 Authentification

L'authentification est basee sur des **tokens HMAC-SHA256 signes** stockes dans des cookies.

**Flux d'authentification** :

```
1. Utilisateur visite / --> redirige vers /login
2. Utilisateur soumet username + password
3. Serveur verifie contre AUTH_USER et AUTH_PASS (.env)
4. Si OK : genere un token signe HMAC-SHA256
5. Token stocke en cookie HttpOnly (7 jours)
6. Chaque requete suivante : middleware verifie le cookie
```

**Generation du token** :
```javascript
function makeToken(user) {
  const payload = `${user}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${sig}`;
}
```

Le secret de signature est derive du mot de passe :
```javascript
const AUTH_SECRET = crypto.createHash('sha256')
  .update(`autocarousel:${AUTH_PASS}`).digest('hex');
```

**Verification** :
```javascript
function verifyToken(token) {
  const [b64, sig] = token.split('.');
  const payload = Buffer.from(b64, 'base64').toString();
  const expected = crypto.createHmac('sha256', AUTH_SECRET)
    .update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

**Note** : `timingSafeEqual` est utilise pour eviter les attaques par timing.

### 15.2 Protection du Cookie

| Attribut | Valeur | Description |
|----------|--------|-------------|
| `HttpOnly` | Oui | Inaccessible au JavaScript client |
| `Path` | `/` | Valide pour tout le site |
| `Max-Age` | 604800 (7 jours) | Expiration automatique |
| `SameSite` | Lax | Protection CSRF basique |
| `Secure` | Non (a ajouter) | Devrait etre active en production |

### 15.3 Protection Path Traversal

L'endpoint de telechargement valide le format du `jobId` :

```javascript
if (!/^job_\d+_[a-z0-9]+$/.test(jobId)) {
  return res.status(400).json({ error: 'Invalid job ID' });
}
```

Ce regex empeche les attaques de type `../../../etc/passwd` dans le parametre `jobId`.

### 15.4 Gestion des Reponses d'Authentification

Le middleware d'auth fait la difference entre les requetes navigateur et API :

```javascript
if (req.headers.accept && req.headers.accept.includes('text/html')) {
  return res.redirect('/login');  // Navigateur → page de login
}
res.status(401).json({ error: 'Authentication required' });  // API → 401 JSON
```

### 15.5 Endpoint Public

Seul l'endpoint `/health` est accessible sans authentification :

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### 15.6 SSL/TLS

| Parametre | Valeur |
|-----------|--------|
| Certificat | Let's Encrypt |
| Protocole | TLS 1.2+ |
| Renouvellement | Automatique (certbot) |
| Expiration | 5 juin 2026 |

### 15.7 Donnees Utilisateur

AutoCarousel ne stocke aucune donnee utilisateur permanente :
- Pas de base de donnees
- Pas de comptes utilisateur (identifiants en .env)
- Les outputs sont ephemeres (suppression apres 24h)
- Les API keys sont dans .env (jamais committees)
- Les screenshots et images intermediaires sont supprimes a la fin de chaque job (workDir cleanup)

### 15.8 Points d'Amelioration Securite

| Amelioration | Priorite | Description |
|-------------|----------|-------------|
| Cookie `Secure` | Haute | Ajouter le flag `Secure` en production |
| Rate limiting | Moyenne | Limiter le nombre de generations par IP/temps |
| CORS | Basse | Configurer les headers CORS si necessaire |
| CSP | Basse | Content Security Policy headers |
| Expiration token | Moyenne | Valider la date dans le payload du token |

---

## Annexe A — Structure des Donnees

### A.1 Job Output

Chaque generation cree un dossier :
```
outputs/
  job_1709836800000_abc123/
    slide_01.png        # Cover
    slide_02.png        # Step 1
    slide_03.png        # Step 2
    slide_04.png        # Step 3
    slide_05.png        # Step 4
    slide_06.png        # Resource
    .work/              # Supprime apres generation
      captures/
        screenshot_1.png
        screenshot_1_processed.png
        screenshot_1_annotated.png
      images/
        logo_0.png
        yt_thumb_1.jpg
```

### A.2 Reponse API `/generate` (SSE Complete Event)

```json
{
  "job_id": "job_1709836800000_abc123",
  "format": "4:5",
  "dimensions": "1080x1350",
  "carousel_title": "Master Stripe Payments in 5 Steps",
  "slides": [
    { "number": 1, "url": "/outputs/job_1709836800000_abc123/slide_01.png" },
    { "number": 2, "url": "/outputs/job_1709836800000_abc123/slide_02.png" }
  ],
  "zip_url": "/download/job_1709836800000_abc123"
}
```

### A.3 Reponse API `/health`

```json
{
  "status": "ok",
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

---

## Annexe B — Dependencies npm

| Package | Version | Role |
|---------|---------|------|
| `express` | ^4.21 | Serveur HTTP + routing |
| `puppeteer` | ^23 | Navigateur headless (capture + rendu) |
| `sharp` | ^0.33 | Traitement d'images (resize, crop, compositing SVG) |
| `cheerio` | ^1.0 | Parsing HTML cote serveur |
| `axios` | ^1.7 | Client HTTP (API calls + downloads) |
| `archiver` | ^7.0 | Generation d'archives ZIP |
| `dotenv` | ^16.4 | Chargement des variables d'environnement |

---

## Annexe C — Glossaire

| Terme | Definition |
|-------|------------|
| **Carousel** | Serie de slides verticales destinees aux reseaux sociaux |
| **Slide Step** | Slide tutoriel avec screenshot annote + instructions |
| **Slide Cover** | Premiere slide, titre du carousel |
| **Slide Resource** | Slide de fin avec ressource complementaire |
| **Annotation** | Element graphique superpose au screenshot (cercle, encadre, fleche) |
| **Compositing** | Fusion de plusieurs couches d'images en une seule |
| **DOM Enumeration** | Extraction des positions des elements HTML via getBoundingClientRect |
| **Vision** | Capacite de Claude a analyser des images |
| **SSE** | Server-Sent Events, protocole de streaming unidirectionnel |
| **Fingerprinting** | Technique de deduplication basee sur un identifiant unique extrait du contenu |

---

*Document genere le 26 mars 2026 — AutoCarousel v0.1.0*
