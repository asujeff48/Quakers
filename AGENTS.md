# Agent notes — Quakers

## Deploy policy (required)

- **Always** push code changes to GitHub `main` and Railway production. Do not wait to be asked.
- **Single source of code:** GitHub repo `asujeff48/Quakers`, branch `main`.
- **Single user-facing site:** Railway production (`quakers`).
- **Rule of thumb:** if it is not on `main` and live on Railway, it is not done.

### Workflow

1. Work on a `cursor/<name>-1a99` feature branch as needed.
2. Commit the change.
3. Merge into `main` (fast-forward or merge commit) and `git push origin main`.
4. Trigger a Railway production deploy of that commit (autodeploy often misses) and wait until it succeeds.
5. Tell the user to hard-refresh the Railway URL.

PRs are optional documentation of the work; they are not a substitute for landing on `main` when production is the test target.

### Stack

- Vite + React + TypeScript frontend
- Leaflet map of USGS earthquake GeoJSON
- Docker multi-stage build → Caddy static server (same pattern as SkyLight)
