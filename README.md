# NullAI Netlify Ghost Hub

> A cinematic local Netlify control plane for Parrot OS. Sync sites, clone repos, spawn Podman previews, and manage reviewer workflows from a single high‑fidelity console.

```
NullAI: https://nullai.tech
```

## Why This Exists
- Operate Netlify CLI + local previews without leaving Parrot OS.
- Keep previews fully local with rootless Podman and strict memory caps.
- Track site URLs, GitHub repos, and reviewer flows in one place.

## What You Get
- Netlify site inventory (with URL + repo metadata)
- Local repo cloning and pod preview launching
- Live resource stats (CPU/RAM) per pod
- Reviewer contact + email preview workflow
- One‑click kill switch for all app pods

## OS Baseline (Parrot)
These commands assume Parrot OS (Debian‑based) with a standard user account.

### 1) System Packages
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl podman
```

### 2) Node.js + npm (via NodeSource)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3) Netlify CLI
```bash
npm install -g netlify-cli
```

### 4) Rootless Podman Service
This app will try to start Podman automatically. If it fails, start the user service:

```bash
systemctl --user start podman.socket
```

Optional: enable on login:
```bash
systemctl --user enable podman.socket
```

## Clone & Install
```bash
git clone <your-repo-url>
cd netlify-dev-hub
```

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd netlify-dashboard
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## Configuration Notes
- **Pod Memory Cap:** Each pod is limited to 4GB (`--memory 4g` + `--memory-swap 4g`).
- **Secrets:** SMTP creds are stored in `backend/sentinel_config.json` and are ignored by `.gitignore`.

## API Reference
- `GET /api/sites` — Netlify sites + URLs + repo metadata + contacts
- `POST /api/clone?repo_url=...` — clone a repository
- `POST /api/ghost/start/{repo_name}` — start preview pod (auto-checks Podman)
- `POST /api/ghost/stop/{repo_name}` — stop preview pod
- `POST /api/ghost/stop-all` — kill all app-managed pods
- `GET /api/ghost/logs/{repo_name}` — tail logs
- `GET /api/ghost/stats` — CPU/RAM usage for app-managed pods
- `POST /api/config/smtp` — save SMTP credentials
- `POST /api/sites/{site_id}/contacts` — update reviewer contacts
- `POST /api/email/send` — send preview email

## Quick Troubleshooting (Parrot OS)
- **Podman won’t start:**
  ```bash
  systemctl --user start podman.socket
  ```
- **Netlify CLI can’t list sites:**
  ```bash
  netlify login
  netlify sites:list
  ```
- **Port 8000/5173 in use:** pick a different port and update the frontend API base.

## Security Notes
- The backend accepts all CORS origins for local development.
- This app is intended for local use only.

## Design Notes
- The UI uses layered glass, ambient gradients, and motion‑aware transitions.
- Use the **Motion High/Low** toggle in the top bar to reduce animations.
