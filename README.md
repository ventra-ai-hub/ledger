# ledger

Ventra internal ledger — expenses, income, partner splits, EOFY accountant pack.

Single-page web app (`ledger.html`) with encrypted shared sync via a private GitHub Gist, installable as a PWA. Designed for two-partner businesses (Dan & Nelson, 50/50 split locked).

## Deploying to GitHub Pages

The repo is private; the deployed site is public. Code is visible. Encrypted ledger data lives in a separate private Gist and is not exposed by the deployment.

1. **Repo → Settings → Pages**
2. **Source**: Deploy from a branch
3. **Branch**: `main`, folder: `/` (root)
4. **Save**
5. After ~60s the site is live at <https://ventra-ai-hub.github.io/ledger/ledger.html>.

## Files

| file | purpose |
|---|---|
| `ledger.html` | the entire app (UI + state + crypto + EOFY pack with inlined JSZip + jsPDF) |
| `manifest.webmanifest` | PWA manifest (id `/ledger/`, scope `/ledger/`, dark theme) |
| `sw.js` | service worker (cache `ledger-v1`, bypasses `api.github.com`) |
| `icon.svg`, `icon-maskable.svg` | source SVGs |
| `icon-{180,192,512}.png`, `icon-maskable-512.png` | rasterized PWA icons |
| `ledger.jsx` | original React design source — kept for reference |

## Sync setup

Two devices, one shared Gist:

1. On device A: Settings → Shared sync → paste a GitHub PAT with `gist` scope, choose a passphrase, leave Gist ID blank, **Save & sync now**. The app creates a private Gist on first push.
2. Copy the Gist ID from `Settings → Shared sync` on device A.
3. On device B: same passphrase, paste the Gist ID, paste device B's *own* GitHub PAT, **Save & sync now**.

Each partner sets their own name in `Settings → Your name on this device` so edits are stamped per-person. The name is per-device (`ventra-ledger-user`) and never synced.

## Tax exports

Tax tab → **Generate EOFY Pack** produces `ventra-eofy-pack-FY{year}.zip` containing CSVs (income, expenses-all, expenses-by-category, uncollected, loans) + two PDFs (one-page summary + detailed line-item report). Works fully offline.
