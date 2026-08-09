# Agent notes — Quakers

## Deploy policy (required)

- **Single source of code:** GitHub repo `asujeff48/Quakers`, branch `main`.
- **Single user-facing site:** Railway production (`quakers`), which autodeploys from `main`.
- **Default:** when a change is ready for users, **merge it into `main` and push** so Railway picks it up. Do not stop at an open PR or feature branch if the user is testing production.
- **Rule of thumb:** if it is not on `main`, it is not live.

### Workflow

1. Work on a `cursor/<name>-1a99` feature branch as needed.
2. Commit and push the branch.
3. Merge into `main` (fast-forward or merge commit) and `git push origin main`.
4. Confirm Railway deployment succeeds before telling the user to retest production.
5. Hard-refresh guidance: users should hard-refresh the Railway URL after deploy.

PRs are optional documentation of the work; they are not a substitute for landing on `main` when production is the test target.

### Stack

- Vite + React + TypeScript frontend
- Leaflet map of USGS earthquake GeoJSON
- Docker multi-stage build → Caddy static server (same pattern as SkyLight)
