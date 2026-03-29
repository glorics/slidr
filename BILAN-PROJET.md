# AutoCarousel — Bilan Projet & Strategie Finale

**Date :** 29 mars 2026
**Deadline :** 5 avril 2026 (7 jours restants)
**Production :** https://autocarousel.glorics.com

---

## 1. CHALLENGE REQUIREMENTS — Statut

| Requirement | Statut | Detail |
|---|---|---|
| Takes a URL as input | OK | Un champ, une URL, c'est tout |
| Grabs relevant images (screenshots, logos, YT videos, browser snapshots) | OK | Cascade multi-source : ScreenshotOne, Steel.dev, Puppeteer, Google Favicon, YouTube thumbnails |
| Outputs annotated visuals | OK | Cercles numerotes, highlights, fleches, legendes |
| Ready for social media carousels | OK | 3 formats verticaux (3:4, 4:5, 9:16) |
| No manual editing | OK | Zero intervention, tout automatise |
| Vertical images | OK | 1080x1440, 1080x1350, 1080x1920 |
| Hosted on Hostinger | OK | VPS KVM 2, Debian 13, live avec SSL |

**Tous les requirements sont coches.**

---

## 2. JUDGING CRITERIA — Analyse Honnete

### Critere 1 : Output Quality (poids FORT)
> *"Does the final image look intentional and clean? Is it repeatable on any URL?"*

**Ce qui va bien :**
- Design coherent et professionnel (fond noir, typo Inter, accent terra cotta)
- 3 types de slides (cover, step, resource)
- Screenshots bien captures et cadres
- Logos s'affichent correctement

**Ce qui pose question :**
- Certaines slides n'ont qu'1 seul cercle visible — impression "vide" vs les 3 des images de reference
- Cercles parfois sur des elements peu pertinents ou mal positionnes par rapport au texte de la legende
- Le screenshot peut etre scrolle trop bas — on voit du contenu pas forcement utile
- Compare aux images de Simon, nos slides sont correctes mais pas au meme niveau de polish

**Le "repeatable on any URL"** — avec Steel.dev + ScreenshotOne + fallbacks, la robustesse est bonne. Mais la qualite des annotations varie beaucoup d'une URL a l'autre.

**Score : 7/10** — Fonctionnel et propre, mais pas encore au niveau "wow".

---

### Critere 2 : Documentation & Clarity (poids MOYEN)
> *"Can a member replicate your build from your notes or simple install commands?"*

**Ce qu'on a :**
- `scripts/install.sh` pour setup Debian 13
- `.env.example`
- DOCUMENTATION-TECHNIQUE.md (65KB, tres complete)
- SPEC-FONCTIONNELLE.md

**Ce qui manque :**
- Un vrai README.md simple et clair a la racine (5 min de lecture, installation en 3 commandes)
- Le Setup Wizard (mentionne dans la spec) n'est PAS implemente
- Pas de Docker
- La doc est massive mais technique — un membre Scrapes.ai (pas forcement dev) aurait du mal

**Score : 6/10** — Doc technique existe mais le "can a member replicate" n'est pas au point.

---

### Critere 3 : Workflow Efficiency (poids MOYEN)
> *"How many steps, how much friction?"*

Le workflow utilisateur :
1. Aller sur l'URL
2. Se connecter
3. Coller une URL
4. Choisir langue + format
5. Cliquer "Generate"
6. Attendre ~90 secondes
7. Telecharger le ZIP

**C'est minimal.** SSE streaming temps reel. Interface claire. Un seul bouton.

**Score : 9/10** — Difficile de faire plus simple.

---

### Critere 4 : Implementation Cost (poids FAIBLE)
> *"What does it cost per run?"*

- ~$0.05-0.15 par carousel (13-15 appels Claude Sonnet + screenshots)
- APIs gratuites maximisees (Google Favicon, YouTube oEmbed, Jina Reader)
- Claude Sonnet (pas Opus) — choix delibere

**Score : 9/10** — Cout documente et tres bas.

---

### Tableau recapitulatif

| Critere | Poids estime | Score | Commentaire |
|---|---|---|---|
| **Output quality** | Fort | 7/10 | Propre mais pas "wow". Annotations variables |
| **Documentation** | Moyen | 6/10 | Doc massive, pas de README simple |
| **Workflow efficiency** | Moyen | 9/10 | Point fort — minimal friction |
| **Implementation cost** | Faible | 9/10 | $0.05-0.15, bien documente |

**Verdict : le projet est solide et complet, mais le critere #1 (output quality) a le plus de poids ET c'est celui ou on est le moins fort.**

---

## 3. PORTABILITE — Options de Distribution

### Option A : Git + script d'installation sur VPS
```bash
git clone https://github.com/glorics/autocarousel
cd autocarousel
./install.sh
```

- C'est ce qu'on a deja (le script install.sh existe)
- C'est ce que Hostinger attend — ils vendent des VPS
- Le Setup Wizard gere le premier lancement
- Matche le brief : "Hostinger can easily host Node.js projects"
- Inconvenients : il faut un VPS + SSH pour le script initial
- **Effort : ~1 jour** (Setup Wizard + README)

### Option B : Application desktop (Windows/Mac)
**NON RECOMMANDE :**
- Puppeteer + Chromium = 200-400 MB a embarquer
- Sharp utilise des binaires natifs — cross-platform penible
- Il faudrait Electron — projet a part entiere
- Cles API a configurer — UX mauvaise sur desktop
- Antivirus Windows bloquent les Chromium headless
- **Effort : des semaines. On oublie.**

### Option C : Docker
```bash
docker run -d -p 3000:3000 glorics/autocarousel
```

- Installation en 1 commande, fonctionne partout
- Chromium + fonts + tout embarque
- Image lourde (~800MB-1GB), Docker pas toujours installe
- **Effort : ~demi-journee** pour Dockerfile + tests

### Option D : One-liner heberge (RECOMMANDE)
```bash
curl -fsSL https://autocarousel.glorics.com/install.sh | bash
```

Le workflow ideal :
1. L'utilisateur a un VPS Hostinger neuf
2. Il copie-colle UNE commande dans le terminal SSH
3. Tout s'installe en 2-3 minutes
4. Il ouvre son navigateur → Setup Wizard
5. Il entre ses cles API + login/password dans un formulaire web
6. C'est pret

- **Effort : quelques heures** (adapter le script existant + heberger)

### Recommandation : Option D + Setup Wizard
C'est la combinaison gagnante pour le critere "simple install commands" et la video demo. Docker en bonus si le temps le permet.

---

## 4. PLAN D'ACTION — 7 Jours Restants

Par ordre de priorite :

### Priorite 1 : Ameliorer la qualite des annotations
- S'assurer qu'il y a toujours 3 cercles bien places, pertinents, bien espaces sur chaque slide step
- Affiner les prompts de l'Agent 5 (Annotateur Vision+DOM)
- Tester et corriger les edge cases

### Priorite 2 : Tester sur 10-15 URLs variees
- Blogs, YouTube, docs, produits SaaS, pages marketing
- Corriger les cas ou le resultat est mediocre

### Priorite 3 : README.md propre
- 5 min de lecture
- "Voici ce que c'est, voici comment l'installer"
- Installation en 3 commandes

### Priorite 4 : Setup Wizard
- Page web au premier lancement
- Formulaire : cles API + login/password
- Ecrit le .env, redemarre le service, redirige vers login

### Priorite 5 : Script install.sh one-liner
- Adapter le script existant pour fonctionner en standalone
- Heberger sur autocarousel.glorics.com/install.sh

### Priorite 6 : Video demo (OBLIGATOIRE)
- 1-3 min screencast
- Montrer : URL → slides en temps reel → download ZIP
- Montrer la qualite de l'output

### Priorite 7 : Writeup 100-300 mots (OBLIGATOIRE)
- Description technique concise
- Mettre en avant les differenciateurs

### Bonus si temps : Dockerfile

---

## 5. LIVRABLES OBLIGATOIRES — Checklist

| Livrable | Statut | Deadline |
|---|---|---|
| Host sur Hostinger | FAIT | - |
| Soumission via form | A FAIRE | 5 avril |
| Video demo 1-3 min | A FAIRE | 4 avril |
| Writeup 100-300 mots | A FAIRE | 4 avril |
| Droits partages acceptes | OK | - |
