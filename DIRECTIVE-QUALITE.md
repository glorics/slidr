# DIRECTIVE URGENTE — Redressement Qualité AutoCarousel

**Contexte :** Le pipeline fonctionne end-to-end mais la qualité de sortie est insuffisante pour gagner le hackathon. Les annotations sont mal positionnées, les images recherchées ne sont pas intégrées dans les slides, les screenshots échouent sur les sites protégés, et les logos ne s'affichent pas. Il faut redresser la barre sur tous ces points AVANT de penser au déploiement.

**Référence :** Lis le `KEDecharge.md` pour l'état des lieux complet. Les points critiques sont les écarts 2.1, 2.4, 2.6 et la section 6.1 "Priorité haute".

---

## PRIORITÉ 1 — Intégration de Claude Vision pour les annotations (CRITIQUE)

C'est le changement le plus important. Les annotations (cercles numérotés, flèches, highlight boxes) sont actuellement positionnées à l'aveugle via des `position_hint` génériques ("top-left", "center"). Le résultat est imprécis et amateur.

**Ce qu'il faut faire :**

Modifier le pipeline pour utiliser Claude Sonnet en mode Vision APRÈS la capture des screenshots. Le nouveau flow est :

```
1. Scraper extrait le contenu texte de l'URL
2. Agent IA (appel 1 — texte seul) analyse le contenu et structure les slides en JSON
   → Il identifie les étapes, les titres, les instructions, les URLs à capturer
   → Il décrit en langage naturel ce qu'il faut annoter ("le bouton +", "le champ de recherche", "le résultat Gamma")
3. Module capture fait les screenshots avec Puppeteer/ScreenshotOne
4. Agent IA (appel 2 — Vision) reçoit chaque screenshot en image et les descriptions d'annotations
   → Il analyse visuellement le screenshot
   → Il retourne des coordonnées PRÉCISES pour chaque annotation : { x_percent, y_percent, width_percent, height_percent }
   → Il choisit le type de flèche approprié et son angle
5. Renderer compose les slides avec les coordonnées précises
```

**Le prompt Vision (appel 2) doit ressembler à :**

```
Tu reçois un screenshot d'interface et une liste d'éléments à annoter.

Pour chaque élément, retourne ses coordonnées exactes en pourcentage de l'image :
- x_percent : position horizontale du centre de l'élément (0 = gauche, 100 = droite)
- y_percent : position verticale du centre de l'élément (0 = haut, 100 = bas)
- width_percent : largeur de l'élément en % de la largeur de l'image
- height_percent : hauteur de l'élément en % de la hauteur de l'image

Pour les flèches, indique aussi :
- arrow_from : { x_percent, y_percent } point de départ
- arrow_to : { x_percent, y_percent } point d'arrivée
- arrow_curve : "left" | "right" | "straight"

Éléments à annoter :
{{annotations_descriptions}}

Retourne UNIQUEMENT un JSON valide.
```

**Impact :** Les annotations seront pixel-perfect. C'est ce qui fait la différence entre un output "ça marche" et un output "c'est professionnel".

**Coût additionnel :** ~$0.01-0.03 par screenshot analysé. Négligeable.

---

## PRIORITÉ 2 — Intégrer ScreenshotOne API (CRITIQUE)

Puppeteer local échoue sur les sites protégés par Cloudflare, les pages avec consentement cookies, et les interfaces dynamiques. C'est inacceptable — Simon va tester avec des URLs variées et si ça plante, c'est éliminatoire.

**Ce qu'il faut faire :**

Implémenter ScreenshotOne comme méthode PRINCIPALE de capture, avec Puppeteer local en fallback.

```javascript
// capture.js — stratégie de capture
async function captureScreenshot(url, options = {}) {
  // 1. Essayer ScreenshotOne d'abord (si clé API disponible)
  if (process.env.SCREENSHOTONE_API_KEY) {
    try {
      return await captureWithScreenshotOne(url, options);
    } catch (err) {
      console.warn(`ScreenshotOne failed for ${url}: ${err.message}`);
      // Fallback Puppeteer
    }
  }
  
  // 2. Fallback Puppeteer local
  return await captureWithPuppeteer(url, options);
}

async function captureWithScreenshotOne(url, options) {
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOTONE_API_KEY,
    url: url,
    viewport_width: options.width || 1280,
    viewport_height: options.height || 800,
    format: 'png',
    block_cookie_banners: true,
    block_ads: true,
    delay: 3,
    cache: true
  });
  
  const response = await axios.get(
    `https://api.screenshotone.com/take?${params}`,
    { responseType: 'arraybuffer', timeout: 30000 }
  );
  
  return Buffer.from(response.data);
}
```

**Paramètres ScreenshotOne importants :**
- `block_cookie_banners: true` — élimine les popups de consentement
- `block_ads: true` — interface propre
- `delay: 3` — attendre le rendu JS
- `cache: true` — éviter de recapturer la même URL

**Ajouter la clé dans .env.example :**
```
SCREENSHOTONE_API_KEY=  # Optionnel — si absent, Puppeteer local est utilisé
```

---

## PRIORITÉ 3 — Intégrer les images recherchées dans les slides (CRITIQUE)

Le brief de Simon dit DEUX FOIS "relevant image searching". Le module image-search télécharge des logos et des thumbnails mais ils ne sont PAS visibles dans l'output final. C'est comme avoir un moteur de recherche qui trouve des résultats mais ne les affiche pas.

**Ce qu'il faut faire :**

### 3a. Logos dans les slides Type A (step)

Ajouter une zone logo en haut à droite du step template. Quand l'agent identifie un outil/service dans l'étape (ex: "Claude.ai", "Gamma", "Slack"), le logo correspondant doit apparaître dans la slide.

```html
<!-- Dans step.html, ajouter dans le header -->
<div class="step-header">
  <div class="step-title-area">
    <span class="step-number">{{slide_number}}.</span>
    <h1 class="step-title">{{title}}</h1>
  </div>
  {{#if logo_base64}}
  <div class="step-logo">
    <img src="data:image/png;base64,{{logo_base64}}" alt="logo" />
  </div>
  {{/if}}
</div>
```

```css
.step-logo {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255,255,255,0.1);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

### 3b. Thumbnails YouTube dans les slides Type B (resource)

Le template resource a déjà un mockup YouTube, mais il utilise un screenshot Puppeteer de YouTube (qui échoue souvent à cause du consentement). Utiliser directement la thumbnail HD :

```javascript
// Pour les URLs YouTube, ne PAS capturer un screenshot
// Utiliser directement la thumbnail haute résolution
if (isYouTubeUrl(url)) {
  const videoId = extractYouTubeId(url);
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const thumbBuffer = await downloadImage(thumbUrl);
  // Fallback sur hqdefault si maxresdefault n'existe pas
  if (!thumbBuffer) {
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return await downloadImage(fallbackUrl);
  }
  return thumbBuffer;
}
```

### 3c. Remplacer Clearbit par une alternative fonctionnelle

Clearbit est down. Remplacer par une cascade de sources :

```javascript
async function findLogo(domain) {
  // 1. logo.dev (gratuit, haute qualité)
  try {
    const url = `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;
    const buffer = await downloadImage(url);
    if (buffer && buffer.length > 1000) return buffer; // Vérifier que c'est pas un placeholder
  } catch (e) {}
  
  // 2. Google Favicon 128px (toujours dispo)
  try {
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    return await downloadImage(url);
  } catch (e) {}
  
  // 3. DuckDuckGo icons (alternative)
  try {
    const url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    return await downloadImage(url);
  } catch (e) {}
  
  return null; // Pas de logo trouvé
}
```

---

## PRIORITÉ 4 — Améliorer la qualité des annotations CSS

Les annotations actuelles (cercles, flèches, highlight boxes) ne correspondent pas au niveau de qualité des images de référence de Simon.

**Cercles numérotés :**
- Taille : 40x40px minimum (pas 20x20)
- Font : Inter Bold, 18px, blanc
- Background : accent color solide (pas transparent)
- Ombre portée : `box-shadow: 0 2px 8px rgba(0,0,0,0.4)`
- Border : 2px solid rgba(255,255,255,0.3) pour le relief

**Highlight boxes :**
- Border-radius : 12px (coins arrondis, pas carrés)
- Border : 2.5px solid accent color
- Background : transparent (PAS de fill)
- Ombre portée légère : `box-shadow: 0 0 0 4px rgba(accent, 0.2)`

**Flèches :**
- Stroke-width : 3-4px (pas 1-2px)
- Stroke-linecap : round
- Couleur : accent color
- Pointe de flèche : triangle rempli, pas un simple marker SVG fin
- Courbe naturelle (bezier), pas un trait droit

**L'effet "dimming" du screenshot :**
Quand une annotation highlight box est présente, le reste du screenshot doit être légèrement assombri pour créer un effet de focus. Utiliser le trick CSS :

```css
.screenshot-area::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
  z-index: 1;
}

.highlight-box {
  z-index: 2; /* Au dessus de l'overlay */
  box-shadow: 0 0 0 4px rgba(accent, 0.3);
}
```

Alternative avec le trick box-shadow inversé sur le highlight :
```css
.highlight-box {
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  z-index: 2;
}
```

---

## PRIORITÉ 5 — Gérer YouTube correctement

Les URLs YouTube sont un cas d'usage majeur (Simon les mentionne explicitement dans le brief). Actuellement, Puppeteer capture souvent une page de consentement Google au lieu du contenu.

**Règle :** Ne JAMAIS capturer un screenshot de youtube.com avec Puppeteer. Toujours utiliser :
- Thumbnail HD : `https://img.youtube.com/vi/{ID}/maxresdefault.jpg`
- Metadata : YouTube oEmbed API (`https://www.youtube.com/oembed?url=...&format=json`)
- Le template resource.html construit le mockup YouTube visuellement (barre YouTube, thumbnail, titre, vues)

---

## RÉCAPITULATIF — Ordre d'exécution

1. **Claude Vision** — Modifier agent.js pour ajouter l'appel Vision après les captures. Modifier pipeline.js pour passer les screenshots à l'agent. Mettre à jour les annotations avec des coordonnées précises.
2. **ScreenshotOne** — Ajouter dans capture.js comme méthode principale avec fallback Puppeteer.
3. **Images dans les slides** — Logos dans step.html, thumbnails YouTube dans resource.html, cascade de sources pour les logos.
4. **Qualité annotations CSS** — Refaire le CSS des cercles, flèches, highlight boxes. Ajouter l'effet dimming.
5. **YouTube** — Ne plus capturer youtube.com, utiliser les thumbnails directement.

Chaque point doit être testé individuellement avec au moins 2 URLs différentes avant de passer au suivant. Montre-moi le résultat visuel (PNG) après chaque changement.
