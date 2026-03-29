# KEDecharge — AutoCarousel : Bilan Technique

**Date :** 7 mars 2026 (mis a jour)
**Projet :** AutoCarousel — URL to Annotated Tutorial Images
**Contexte :** Hackathon Scrapes.ai x Hostinger ($2,000 de prix)
**Spec de reference :** `hackathon-autocarousel-spec.md`

---

## 1. ETAT DES LIEUX : CE QUI A ETE FAIT

### 1.1 Pipeline complet fonctionnel et deploye

Le pipeline end-to-end est operationnel et deploye en production :

```
URL → Scraper → Agent IA (texte) → Image Search → Capture → Agent IA (Vision) → Renderer → PNG + ZIP
```

**Production :** https://autocarousel.glorics.com (auth requise)

Teste avec succes sur :
- Pages de documentation (docs.anthropic.com)
- Videos YouTube (youtube.com/watch?v=...)
- Les 3 formats : 3:4, 4:5, 9:16
- Les 4 langues : EN, FR, ES, DE

### 1.2 Modules — Statut detaille

| Module | Spec | Statut | Notes |
|---|---|---|---|
| **scraper.js** | Jina Reader + YouTube oEmbed + cheerio fallback | FAIT | Fonctionne sur articles, docs, YouTube |
| **agent.js** | Claude Sonnet API + Vision + multi-langue | FAIT | Utilise `claude-sonnet-4-20250514`. System prompt dynamique en 4 langues (EN/FR/ES/DE). Vision pour annotations precises. 3 strategies de parsing JSON. Mode mock |
| **image-search.js** | Google Favicon + DuckDuckGo + logo.dev | FAIT | Cascade avec `normalizeDomain()`. Gere tous les types (logo, icon, youtube_thumb, screenshot, diagram, code, chart, illustration...) |
| **capture.js** | ScreenshotOne + Puppeteer fallback + YouTube thumbnail | FAIT | YouTube = thumbnail directe. ScreenshotOne si cle API presente. Puppeteer en fallback |
| **renderer.js** | Templates HTML → Puppeteer → PNG | FAIT | Remplacement de variables, nettoyage des variables non remplacees, support multi-format |
| **pipeline.js** | Orchestration complete + Vision + logos + thumbnails | FAIT | 6 etapes : scrape → analyze → search → capture → vision → render. Logos injectes dans step slides, thumbnails YouTube dans resource slides |

### 1.3 Templates — Statut detaille

| Template | Ref image | Statut | Description |
|---|---|---|---|
| **step.html** (Type A) | image-1.png, image-3.png | FAIT | Header flex (titre + logo), separateur terra cotta, instructions, screenshot ~65%, annotations ameliorees (cercles avec border blanche, highlights avec glow, fleches epaisses, effet dimming spotlight) |
| **resource.html** (Type B) | image-2.png | FAIT | Badge numero, titre, description, embed YouTube avec vraie thumbnail + play overlay + barre YouTube |
| **cover.html** (Type C) | Pas de ref | FAIT | Badge "X steps", barre accent, titre 64px bold, sous-titre, gradients radiaux terra cotta, footer branding |

### 1.4 Serveur et endpoints

| Endpoint | Spec | Statut |
|---|---|---|
| `GET /login` | Page de connexion | FAIT (hors spec — ajout securite) |
| `POST /login` | Authentification | FAIT (cookie HMAC-SHA256, 7 jours) |
| `GET /logout` | Deconnexion | FAIT |
| `POST /generate` | SSE stream avec etapes scraping/analyzing/searching/capturing/refining/rendering/complete | FAIT |
| `GET /download/:jobId` | ZIP des slides PNG | FAIT (validation anti path traversal) |
| `GET /health` | Status check (public, pas d'auth) | FAIT |
| `GET /render/:template` | Preview dev | FAIT (bonus) |
| Fichiers statiques | /outputs/, /templates/, /public/ | FAIT (proteges par auth) |

### 1.5 Interface Web

| Element | Statut |
|---|---|
| Page de login dark mode | FAIT |
| Champ URL | FAIT |
| Selecteur de langue (EN, FR, ES, DE) | FAIT |
| Selecteur de format (3:4, 4:5, 9:16) | FAIT |
| Bouton "Generate Carousel" | FAIT |
| Barre de progression + log SSE | FAIT |
| Galerie de resultats avec preview | FAIT |
| Bouton "Download ZIP" | FAIT |
| Lien Logout | FAIT |
| Design dark mode (Inter, terra cotta) | FAIT |

### 1.6 Deploiement production

| Element | Detail |
|---|---|
| VPS | Hostinger KVM 2, Debian 13 (trixie), 8GB RAM, 99GB disk |
| IP | 89.116.110.171 |
| SSH | Clef ed25519 `~/.ssh/id_autocarousel` |
| Node.js | v20.20.1 |
| Chromium | 145.0.7632.159 |
| Apache | 2.4.66 avec mod_proxy, mod_ssl, SSE flushpackets |
| SSL | Let's Encrypt, expire 5 juin 2026, auto-renew |
| Service | systemd autocarousel.service, auto-restart |
| Auth | admin / Scr4pes2026! |
| URL | https://autocarousel.glorics.com |

### 1.7 Scripts

| Script | Statut |
|---|---|
| `scripts/install.sh` | FAIT — Apache, Node 20, Chromium, systemd |
| `scripts/cleanup.sh` | FAIT — Supprime outputs > 24h |

---

## 2. ECARTS PAR RAPPORT A LA SPEC

### 2.1 ScreenshotOne — RESOLU

**Spec :** Utilisation de l'API ScreenshotOne pour les captures d'ecran.
**Statut :** IMPLEMENTE comme methode principale avec Puppeteer en fallback. Non teste en reel (pas de cle API configuree). L'implementation est prete a activer en ajoutant `SCREENSHOTONE_API_KEY` dans `.env`.

### 2.2 Apache au lieu de Nginx — CHOIX UTILISATEUR

**Spec :** Nginx. **Realite :** Apache. Preference explicite de l'utilisateur.

### 2.3 Terra Cotta au lieu de Magenta — CHOIX UTILISATEUR

**Spec :** Accent magenta. **Realite :** Terra cotta #D97757. Choix delibere.

### 2.4 Clearbit Logo API — RESOLU

**Spec :** Clearbit comme source principale de logos.
**Statut :** REMPLACE par cascade Google Favicon → DuckDuckGo → logo.dev. Fonction `normalizeDomain()` pour gerer les entites sans TLD.

### 2.5 CSS de ratio — PAS D'IMPACT

Les fichiers existent mais ne sont pas importes. Le renderer modifie les CSS variables directement. Meme resultat.

### 2.6 Images recherchees non integrees — RESOLU

**Spec :** Logos et thumbnails dans les slides.
**Statut :** FAIT. Logos en haut a droite des step slides, thumbnails YouTube avec play overlay dans les resource slides.

### 2.7 Alertes Telegram — NON IMPLEMENTE

Fonctionnalite secondaire. Le systemd gere le restart auto.

### 2.8 Parametre `style` — NON IMPLEMENTE

Un seul theme (dark). Pas de valeur ajoutee pour le hackathon.

### 2.9 Annotations position_hint — RESOLU

**Spec :** Annotations mal positionnees avec les position_hint generiques.
**Statut :** RESOLU via Claude Vision (appel 2). Les annotations sont maintenant positionnees avec des coordonnees precises (x_percent, y_percent) quand le Vision fonctionne. Fallback sur position_hint si echec.

---

## 3. CHOIX TECHNIQUES ET JUSTIFICATIONS

### 3.1 Architecture monolithique Node.js
Tout tourne dans un seul process Node.js. Acceptable pour un hackathon.

### 3.2 Puppeteer singleton
Un navigateur par module (capture.js, renderer.js). Pages ouvertes/fermees pour chaque operation.

### 3.3 Screenshot en base64 inline
Injectes en `data:image/png;base64,...` dans les templates. Evite les chemins relatifs.

### 3.4 Pipeline en deux passes pour les annotations
1. Appel texte : Claude structure les slides et decrit ce qu'il faut annoter
2. Appel Vision : Claude recoit le screenshot et retourne des coordonnees precises
Fallback sur position_hint si Vision echoue.

### 3.5 Multi-langue sans i18n framework
Le system prompt de Claude est reconstruit dynamiquement pour chaque langue supportee. Pas de fichiers de traduction, pas de framework i18n. Claude traduit naturellement.

### 3.6 Auth sans dependance externe
Cookie signe HMAC-SHA256 avec `crypto` natif. Pas de express-session, pas de passport, pas de DB. Token derive du password dans `.env`. `timingSafeEqual` contre les timing attacks.

---

## 4. TESTS REALISES

| URL | Type | Langue | Format | Resultat |
|---|---|---|---|---|
| `docs.anthropic.com/.../prompt-caching` | Article | FR | 4:5 | 6 slides, Vision OK sur 3/4, logo Anthropic visible |
| `docs.anthropic.com/.../prompt-caching` | Article | EN | 4:5 | 5 slides en anglais, titres corrects |
| `docs.anthropic.com/.../prompt-caching` | Article | FR | 9:16 | 6 slides, format Stories |
| `youtube.com/watch?v=dQw4w9WgXcQ` | YouTube | FR | 4:5 | 5 slides, thumbnail directe, logo Bitly, resource avec play overlay |
| Auth login OK | — | — | — | Cookie set, redirect, session maintenue |
| Auth login KO | — | — | — | 401, pas de cookie |
| Auth protection | — | — | — | /generate sans cookie → 401, /health → 200 public |
| Production HTTPS | — | — | — | https://autocarousel.glorics.com/health → 200 OK |

---

## 5. COUT PAR RUN

| Composant | Cout estime |
|---|---|
| Claude Sonnet — appel 1 texte (~2000 in, ~1500 out) | ~$0.01-0.02 |
| Claude Sonnet — appel 2 Vision (par screenshot) | ~$0.01-0.03 |
| Jina Reader | Gratuit |
| YouTube oEmbed / Thumbnails | Gratuit |
| Google Favicon | Gratuit |
| Puppeteer screenshots (local) | $0 |
| ScreenshotOne (si active) | ~$0.01/capture |
| SerpAPI (si configure) | ~$0.01/requete |
| **Total sans ScreenshotOne/SerpAPI** | **~$0.03-0.10** |
| **Total complet** | **~$0.05-0.15** |

---

## 6. STRUCTURE FINALE DU PROJET

```
/opt/autocarousel/
├── server.js                 # Express + auth + 6 endpoints
├── package.json              # express, puppeteer, sharp, cheerio, axios, archiver, dotenv
├── .env                      # API keys + AUTH_USER/AUTH_PASS
├── .env.example              # Template sans secrets
├── .gitignore
│
├── modules/
│   ├── scraper.js            # Jina Reader + YouTube oEmbed + cheerio
│   ├── agent.js              # Claude Sonnet (texte + Vision) + multi-langue (EN/FR/ES/DE)
│   ├── image-search.js       # Google Favicon / DuckDuckGo / logo.dev + normalizeDomain
│   ├── capture.js            # ScreenshotOne → Puppeteer fallback + YouTube thumbnail
│   ├── pipeline.js           # Orchestration 6 etapes + Vision + logo/thumb injection
│   └── renderer.js           # Template → Puppeteer → PNG
│
├── templates/
│   ├── cover.html            # Type C : titre, sous-titre, badge, gradients terra cotta
│   ├── step.html             # Type A : header flex + logo, screenshot, annotations ameliorees
│   ├── resource.html         # Type B : badge, description, YouTube thumb + play overlay
│   └── styles/               # CSS variables (common, ratio-3-4, ratio-4-5, ratio-9-16)
│
├── public/
│   └── index.html            # UI : login/URL/langue/format/generate/gallery/download/logout
│
├── scripts/
│   ├── install.sh            # Setup Debian 13 + Apache + Node 20 + Chromium + systemd
│   └── cleanup.sh            # Cron : supprime outputs > 24h
│
├── outputs/                  # Dossiers de jobs generes
│
├── CLAUDE.md                 # Instructions projet
├── hackathon-autocarousel-spec.md
├── KEDecharge.md             # Ce document
├── DIRECTIVE-QUALITE.md      # Directive originale
├── DIRECTIVE-QUALITE-2.md    # Bilan implementation
└── image-1.png, image-2.png, image-3.png   # References Simon
```

---

## 7. PROCHAINES ETAPES POUR LA SOUMISSION

| Etape | Statut |
|---|---|
| Commander VPS Hostinger KVM 2 | FAIT |
| Configurer DNS autocarousel.glorics.com | FAIT |
| Deployer sur le VPS | FAIT |
| Configurer .env production | FAIT |
| SSL/HTTPS | FAIT (Let's Encrypt) |
| Authentification | FAIT (admin/Scr4pes2026!) |
| Tester en production | FAIT |
| Enregistrer la demo video | A FAIRE |
| Rediger le writeup (100-300 mots) | A FAIRE |
| Soumettre via le formulaire | A FAIRE (quand Simon le partage) |
