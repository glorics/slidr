# CLAUDE.md — AutoCarousel Project

## Context

Tu travailles sur un projet de hackathon pour la communauté Scrapes.ai (Simon Coton) en partenariat avec Hostinger. Le projet s'appelle **AutoCarousel**.

## Documents dans ce dossier

- `hackathon-autocarousel-spec.md` — La spec technique complète du projet. Lis-la intégralement avant de proposer quoi que ce soit. Elle contient l'analyse du brief, l'architecture du pipeline, le stack technique, les modules détaillés, le planning, la stratégie, et en annexe le brief original verbatim de Simon.
- `image-1.png`, `image-2.png`, `image-3.png` — Les 3 images de référence fournies par Simon dans le post du hackathon. Ce sont des exemples du type de slides annotées que notre système doit produire automatiquement. Analyse-les en détail : palette de couleurs, typographie, positionnement des éléments, style des annotations (cercles numérotés, flèches, encadrés), ratios, marges. Ces images DÉFINISSENT le standard de qualité visuelle à atteindre.

## Ce que j'attends de toi maintenant

1. Lis la spec technique en entier
2. Analyse les 3 images de référence pixel par pixel — note les couleurs exactes, les tailles de typo, les styles d'annotations, les espacements, les ombres, les coins arrondis
3. Donne-moi ton analyse : est-ce que la spec est cohérente avec les images de référence ? Est-ce qu'il manque quelque chose ? Est-ce que tu vois des incohérences ou des améliorations ?
4. Propose un plan d'action concret pour commencer le développement

## Contraintes

- Hébergement final : VPS Hostinger sous Debian 13, tout installé from scratch
- Stack : Node.js, Express, Puppeteer, Sharp
- Le dev peut se faire en local et être migré sur Hostinger ensuite
- Format de sortie : PDF, Markdown, HTML, SVG uniquement — jamais de .docx, .pptx, .xlsx
- Deadline : 5 avril 2026
