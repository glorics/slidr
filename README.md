# Slidr

**Paste a URL. Get annotated tutorial slides in seconds.**

Slidr takes any URL and generates a series of annotated tutorial slides ready for LinkedIn, Instagram, and TikTok. Powered by a 6-agent AI pipeline using Claude Sonnet, it automatically captures screenshots, identifies key UI elements, places pixel-perfect annotations, and composes professional slides.

**Cost per carousel:** ~$0.08 - $0.18

---

## Quick Start (VPS)

```bash
# 1. Get a Debian 12+ VPS and point your domain to it
# 2. Clone and install
git clone https://github.com/glorics/slidr.git
cd slidr
sudo bash scripts/install.sh your-domain.com

# 3. Open your browser → Setup Wizard guides you through API key configuration
# 4. Start generating carousels!
```

## Local Development

```bash
git clone https://github.com/glorics/slidr.git
cd slidr
npm install
cp .env.example .env
# Edit .env — add your API keys (at minimum ANTHROPIC_API_KEY)
npm run dev
# Open http://localhost:3000
```

## API Keys

| Key | Required | Where to get it | What it does |
|-----|----------|-----------------|--------------|
| **Anthropic** | Yes | [console.anthropic.com](https://console.anthropic.com/settings/keys) | 6 AI agents (Claude Sonnet) for content planning, writing, annotation, and quality verification |
| **Steel** | Yes | [steel.dev](https://app.steel.dev/settings/api-keys) | Cloud browser for web scraping + DOM element enumeration (pixel-perfect annotations) |
| **ScreenshotOne** | Yes | [screenshotone.com](https://screenshotone.com/dashboard) | Screenshot capture API (handles Cloudflare, cookie banners, JS-heavy sites) |
| **SerpAPI** | No | [serpapi.com](https://serpapi.com/manage-api-key) | Google Image search (optional, logos work without it) |

## Features

- **6 AI agents** — Strategist, Writer, URL Explorer, Validator, Annotator, Quality Verifier
- **Pixel-perfect annotations** — DOM-based coordinates + Vision hybrid for precise circle placement
- **4 languages** — English, French, Spanish, German
- **3 formats** — 4:5 (LinkedIn/Instagram), 3:4 (Instagram), 9:16 (Stories/Reels)
- **Customizable** — Theme (dark/light/navy/warm/custom), accent colors, legend sizes
- **Real-time progress** — SSE streaming with agent pipeline visualization
- **Token tracking** — see exact cost per generation
- **Setup Wizard** — web-based first-launch configuration

## Project Structure

```
slidr/
├── server.js              # Express server + auth + SSE
├── package.json
├── .env.example           # Environment template
├── modules/
│   ├── agent.js           # 6 Claude AI agents
│   ├── pipeline.js        # Orchestration
│   ├── capture.js         # Screenshot capture (Steel + ScreenshotOne + Puppeteer)
│   ├── scraper.js         # Web content extraction
│   ├── renderer.js        # HTML templates → PNG
│   ├── image-search.js    # Logo/image search
│   ├── annotator.js       # SVG annotation compositing
│   └── setup-wizard.js    # First-launch configuration
├── templates/             # Slide HTML templates (cover, step, resource)
├── public/                # Web UI
└── scripts/
    ├── install.sh         # VPS installation script
    └── cleanup.sh         # Output cleanup cron
```

## Troubleshooting

**Automated/non-interactive installation only:** If you run `install.sh` via a script or CI pipeline (e.g. `echo 'n' | bash install.sh domain.com`) and skip the SSL prompt, Apache may show its default page instead of Slidr. This is because the `expires` module is not enabled. Fix:

```bash
sudo a2enmod expires
sudo systemctl restart apache2
```

This does not affect normal interactive SSH installations — the SSL step with Let's Encrypt enables this module automatically.

**"Service Unavailable" after Setup Wizard:** After completing the Setup Wizard, you may briefly see a 503 error. This is normal — the server is restarting with your new configuration. Simply wait a few seconds and refresh the page.

## Tech Stack

Node.js, Express, Puppeteer, Sharp, Claude Sonnet (Anthropic API), Steel.dev, ScreenshotOne

---

Built for the [Scrapes.ai x Hostinger Hackathon](https://scrapes.ai)
