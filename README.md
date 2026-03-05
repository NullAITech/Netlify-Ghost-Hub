# Netlify Ghost Hub

A local full-stack control plane for managing Netlify sites, local repo clones, preview containers, media tooling, and reviewer email workflows.

## What This Project Is

This repo contains two applications:

1. `backend/` (FastAPI): wraps Netlify CLI, Podman, SMTP, and utility tools behind HTTP APIs.
2. `netlify-dashboard/` (React + MUI + Vite): cinematic dashboard UI for site operations, tooling, and email workflows.

The app is designed for local operator use on Linux (Parrot/Debian-family), not for direct internet exposure.

## UI + Backend Analysis

### UI (React Dashboard)

The frontend is a single-screen, viewport-locked operations UI with three primary views:

1. `Sites`: card-by-card Netlify site navigation, clone status, live site metadata snapshot, and preview controls.
2. `Workspace`: per-site deep operations (live metadata fetch, Codex launcher, media asset preview, SMTP/contact/email studio).
3. `Tools`: power tab for `yt-dlp`, `ffmpeg`, repo creation, WHOIS, and DNS lookup.

Notable design/system characteristics implemented in code:

- Dark neon visual system with MUI theme overrides in [`netlify-dashboard/src/theme.js`](/home/neo/netlify-dev-hub/netlify-dashboard/src/theme.js).
- "Fixed-screen" UX: content sections scroll internally, while the app frame stays pinned to viewport.
- Layered ambient visuals and animated ghost motifs in [`netlify-dashboard/src/App.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/App.jsx).
- Function-first component structure:
  - Site card ops: [`SiteCard.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/components/SiteCard.jsx)
  - Pod lifecycle/logs: [`GhostControl.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/components/GhostControl.jsx)
  - Per-site detail workspace: [`SiteWorkspace.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/components/SiteWorkspace.jsx)
  - SMTP/contact/email builder: [`EmailStudio.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/components/EmailStudio.jsx)
  - Tools surface: [`ToolsPage.jsx`](/home/neo/netlify-dev-hub/netlify-dashboard/src/components/ToolsPage.jsx)

### Backend (FastAPI)

The backend mounts static file roots and composes API domains via routers:

- App factory: [`backend/backend_api/application.py`](/home/neo/netlify-dev-hub/backend/backend_api/application.py)
- State/config roots: [`backend/backend_api/state.py`](/home/neo/netlify-dev-hub/backend/backend_api/state.py)
- Routers:
  - Sites + metadata + assets + Codex launcher: [`sites.py`](/home/neo/netlify-dev-hub/backend/backend_api/routers/sites.py)
  - Podman preview control: [`ghost.py`](/home/neo/netlify-dev-hub/backend/backend_api/routers/ghost.py)
  - SMTP + contacts + send: [`email.py`](/home/neo/netlify-dev-hub/backend/backend_api/routers/email.py)
  - Utility tools and uploads: [`tools.py`](/home/neo/netlify-dev-hub/backend/backend_api/routers/tools.py)

Core backend behavior:

- Site inventory comes from `netlify sites:list --json`.
- Repo clone state is inferred from local git directories under `sentinel_clones`.
- Preview apps run in Podman containers mapped to dynamic local ports.
- Live metadata parser fetches title/meta/OG/canonical/favicon with short cache (`15m`).
- `/downloads` and `/repos` are exposed as static mounts for media previews.

## Architecture

```text
React UI (5173)
  -> FastAPI (8000)
    -> netlify CLI (sites inventory)
    -> git / gh (clone + repo workflows)
    -> podman (preview containers)
    -> smtp (email delivery)
    -> yt-dlp / ffmpeg / whois / dig|nslookup (tooling)

Static mounts:
- /downloads -> backend/downloads
- /repos     -> backend/sentinel_clones
```

## Repository Layout

```text
.
├── backend/
│   ├── main.py
│   ├── backend_api/
│   │   ├── application.py
│   │   ├── state.py
│   │   ├── utils.py
│   │   └── routers/
│   │       ├── sites.py
│   │       ├── ghost.py
│   │       ├── email.py
│   │       └── tools.py
│   ├── sentinel_clones/      # local cloned/generated repos
│   ├── downloads/            # generated media + uploads
│   └── sentinel_config.json  # local SMTP + contact config
└── netlify-dashboard/
    ├── src/
    │   ├── App.jsx
    │   ├── theme.js
    │   └── components/
    └── package.json
```

## Local Setup

### 1) System packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl podman whois dnsutils ffmpeg yt-dlp
```

### 2) Node.js + Netlify CLI

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g netlify-cli
```

Optional GitHub CLI support for repo creation flow:

```bash
sudo apt install -y gh
```

### 3) Backend

Run backend from `backend/` so relative paths resolve correctly (`sentinel_clones`, `downloads`, `sentinel_config.json`).

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi "uvicorn[standard]" python-multipart
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4) Frontend

```bash
cd netlify-dashboard
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### 5) Authenticate Netlify CLI

```bash
netlify login
netlify sites:list
```

## API Surface

### Sites + Repo + Metadata

- `GET /api/sites`
- `POST /api/clone?repo_url=...`
- `GET /api/sites/{site_id}/metadata?force_refresh=false`
- `GET /api/sites/{site_id}/assets`
- `POST /api/codex/open`

### Preview Containers (Podman)

- `POST /api/ghost/start/{repo_name}`
- `POST /api/ghost/stop/{repo_name}`
- `GET /api/ghost/logs/{repo_name}`

### Email + Contacts

- `GET /api/config/smtp`
- `POST /api/config/smtp`
- `GET /api/sites/{site_id}/contacts`
- `PUT /api/sites/{site_id}/contacts`
- `POST /api/sites/{site_id}/contacts`
- `DELETE /api/sites/{site_id}/contacts?email=...`
- `POST /api/email/send`

### Tools

- `GET /api/tools/status`
- `POST /api/tools/yt-dlp`
- `POST /api/tools/yt-dlp/update`
- `POST /api/tools/uploads`
- `POST /api/tools/ffmpeg/convert`
- `GET /api/tools/downloads/media`
- `POST /api/tools/repo/create`
- `POST /api/tools/native/whois`
- `POST /api/tools/native/dns`

## Real Examples

### Clone a site repo

```bash
curl -X POST "http://localhost:8000/api/clone" \
  --get --data-urlencode "repo_url=https://github.com/your-org/your-site.git"
```

### Start preview container

```bash
curl -X POST "http://localhost:8000/api/ghost/start/your-site"
```

### Fetch live metadata for a site

```bash
curl "http://localhost:8000/api/sites/<site_id>/metadata?force_refresh=true"
```

### Save SMTP settings

```bash
curl -X POST "http://localhost:8000/api/config/smtp" \
  -H "Content-Type: application/json" \
  -d '{
    "server": "smtp.example.com",
    "port": 465,
    "user": "ops@example.com",
    "password": "***",
    "from_name": "Ops Team",
    "from_email": "ops@example.com",
    "use_ssl": true,
    "use_tls": false
  }'
```

### Send a designed email to selected contacts

```bash
curl -X POST "http://localhost:8000/api/email/send" \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "<site_id>",
    "recipient_mode": "selected_site_emails",
    "selected_emails": ["reviewer@example.com"],
    "subject": "Preview Ready",
    "html_body": "<h1>Preview</h1><p>Your build is ready.</p>",
    "text_body": "Preview ready."
  }'
```

### Convert uploaded media with ffmpeg

```bash
curl -X POST "http://localhost:8000/api/tools/ffmpeg/convert" \
  -H "Content-Type: application/json" \
  -d '{
    "input_path": "/absolute/path/to/input.mp4",
    "output_name": "clip_720p",
    "output_format": "mp4",
    "scale": "1280:720",
    "crf": "23",
    "preset": "medium",
    "overwrite": true
  }'
```

## Operational Notes

- Backend currently allows all CORS origins (`*`) and should remain local/private.
- SMTP credentials and site contacts are persisted to `backend/sentinel_config.json`.
- Tool and clone operations execute host commands via subprocess; host tool availability directly controls feature availability.
- Podman preview assumes repo apps serve from container port `3000`.

## Troubleshooting

### `GET /api/sites` returns empty

- Run `netlify login`.
- Verify CLI returns JSON: `netlify sites:list --json`.

### Preview start fails

- Ensure Podman service is active:

```bash
systemctl --user start podman.socket
```

- Validate `podman info` works for your user.

### ffmpeg/yt-dlp actions fail

- Check tool presence from UI status chips or shell:

```bash
which ffmpeg
which yt-dlp
```

### No media shown for a site

- Site must be cloned locally.
- Asset scanner only indexes known media extensions and skips dirs like `node_modules`, `.git`, `dist`, `build`.

### Email send fails

- Confirm SMTP server/user/password are saved.
- Verify SSL/TLS/port combo matches provider requirements.

## Security Recommendations

1. Do not expose backend port `8000` publicly.
2. Keep `backend/sentinel_config.json` local only.
3. Rotate SMTP credentials if they were ever committed or shared.
4. Consider origin restrictions and auth if used beyond local machine.

## Suggested Next Enhancements

1. Add `requirements.txt`/`pyproject.toml` for reproducible backend installs.
2. Add API auth + scoped CORS for non-local use.
3. Add test coverage (router-level + integration smoke tests).
4. Add structured logging and command error telemetry.
