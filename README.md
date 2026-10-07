# AI Fault Diagnosis Assistant

An AI-powered troubleshooting assistant for certified TV & Satellite installation technicians.
Upload a photo or short video of a faulty TV, remote, or satellite/terrestrial decoder (DStv, GOtv,
StarTimes, Azam, and other generic set-top boxes) — or just type the decoder's on-screen error code —
and get an instant diagnosis with step-by-step fix instructions.

🔗 **Live app:** `https://<your-github-username>.github.io/ai-fault-diagnosis-assistant/` (after Pages deploy)

## How it works

1. **Frontend** (`/web`) — a static HTML/CSS/JS site, published to **GitHub Pages**. It:
   - Checks an instant, offline **knowledge base** (`web/data/knowledge-base.json`) of common
     DStv / GOtv / StarTimes error codes and general TV/remote faults — no AI call, no cost, works
     even without the Azure backend configured.
   - Falls back to the **Azure AI backend** when a photo/video is attached or there's no confident
     knowledge-base match.
2. **Backend** (`/src`, deployed as an **Azure Function**, Node.js, Flex Consumption) — exposes
   `POST /api/diagnose`, which calls an **Azure AI Services (gpt-4o) vision deployment** using the
   Function App's **managed identity** (no API keys stored anywhere) to analyze the photo/video
   frame plus any error code/symptoms, and returns a structured diagnosis.
3. **Infrastructure** (`/infra`, Bicep + `azd`) provisions:
   - Azure Functions (Flex Consumption) + Storage + Application Insights + Log Analytics
   - Azure AI Services account with a `gpt-4o` model deployment
   - RBAC: "Cognitive Services OpenAI User" role granted to the Function App's identity only —
     no connection strings or API keys in code or config.

## Project layout

```
web/            Static frontend — published to GitHub Pages
  index.html
  css/style.css
  js/app.js             Knowledge-base matching + API calls + media capture
  data/knowledge-base.json
src/            Azure Functions backend
  functions/diagnose.js  POST /api/diagnose — AI vision diagnosis
  functions/health.js    GET  /api/health   — health check
  lib/aiClient.js        Azure OpenAI client (managed-identity auth)
  lib/systemPrompt.js    Domain-specific system prompt
infra/          Bicep infrastructure (azd)
.github/workflows/pages.yml   Publishes /web to GitHub Pages on every push to main
```

## Deploying the backend (Azure)

```powershell
azd auth login
azd up
```

This provisions all Azure resources and deploys the Function App. After it completes, note the
`SERVICE_API_URI` output (your Function App's base URL).

## Configuring the frontend

1. Open the published GitHub Pages site.
2. Click the ⚙️ **settings** icon (top-right) and paste your Function App's base URL
   (e.g. `https://func-api-xxxx.azurewebsites.net`) — saved locally in the browser.
3. That's it — the site will call `<your-url>/api/diagnose` for AI-assisted diagnoses, and use the
   built-in knowledge base instantly for common known error codes.

## Publishing the frontend to GitHub Pages

1. Push this repo to GitHub.
2. In the repo **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) will build and publish `/web` automatically
   on every push to `main`.

## Local development

**Backend:**
```powershell
npm install
func start
```

**Frontend:** open `web/index.html` with a local static server (e.g. VS Code "Live Server", or
`npx serve web`), then point the ⚙️ settings URL at `http://localhost:7071`.

## Safety & accuracy note

This tool provides suggested diagnoses only. Always verify with manufacturer documentation and
follow local electrical and working-at-height safety regulations — especially for dish/aerial work.
