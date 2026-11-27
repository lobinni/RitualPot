# Shipping RitualPot to GitHub and Vercel

This file is deliberately separate from the README: it is pipeline material (remotes, builds,
hosts), not product documentation.

## 1. Push to GitHub

The repository is a plain Next.js app plus Python contract files; nothing secret lives in it.

```sh
# first push of an existing working tree
git init
git add .
git commit -m "RitualPot: contract, console, docs and live deployment record"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main

# every push after that
git add -A
git commit -m "describe the change"
git push
```

If the remote already exists, skip `git init` and `git remote add`, then:

```sh
git remote set-url origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Contents that never go to a remote: `.env`, `.env.*` (`.env.example` is the template that does),
`node_modules/`, `.next/`, `*.tsbuildinfo`. They are listed in `.gitignore`.

Pushing also runs `.github/workflows/ci.yml`: contract syntax, the 16 offline contract tests, the
deployed-code check, TypeScript and the production build.

## 2. Build on Vercel

**Do not configure `DATABASE_URL` on Vercel.** The build and the site both work without it, and
nothing in this project needs it to show live data.

| Step | Value |
| --- | --- |
| Import | the GitHub repository |
| Framework preset | Next.js (auto-detected) |
| Build command | `npm run build` |
| Install command | `npm install` |
| Output | Next.js default (do not change) |
| Node version | 20 or newer |

Why no database URL:

- The build never opens a connection. No page, route handler or component queries PostgreSQL at
  build time; every page is rendered from the chain on the client.
- The connection is opened lazily, on first use: importing a route never touches the database,
  which is why `npm run build` succeeds with no `DATABASE_URL` at all.
- At runtime `GET /api/deployment` reads the database **if one is configured**, and otherwise
  answers from `deployments/registry.json` — the contract address, chain id, RPC and explorer in
  that file are enough to run the whole console.
- `/api/health` answers `{"ok":true,"database":"not-configured"}` when no `DATABASE_URL` is set,
  `{"ok":true,"database":"up"}` when a query succeeds, and `{"ok":false,"database":"error"}` (HTTP 500)
  when a configured database does not answer. The console itself is unaffected in all three cases.

Without a database the console behaves like this on the host:

| Endpoint | Answer without `DATABASE_URL` |
| --- | --- |
| `/api/health` | `{"ok":true,"database":"not-configured"}` |
| `GET /api/deployment` | the address from `deployments/registry.json`, with `"source":"registry"` and `"database":false` |
| `POST /api/deployment` | `503` with a sentence explaining that the address is recorded in the repository instead |
| the footer panel | the address form is replaced by that explanation, so a switch cannot be attempted and fail |

Changing the contract on a database-less host is therefore a commit plus a redeploy:
edit `deployments/registry.json`, push, Vercel rebuilds. That is the whole procedure.

### Optional environment variables

| Variable | Needed? | Effect when absent |
| --- | --- | --- |
| `DATABASE_URL` | **leave it unset on Vercel** | the console reads the address from `deployments/registry.json` |
| `NEXT_PUBLIC_RITUALPOT_ADDRESS` | no | falls back to the database record, then the registry |
| `NEXT_PUBLIC_RITUALPOT_NETWORK` | no | uses `defaultNetwork` from the registry |
| `NEXT_PUBLIC_RITUALPOT_RPC` | no | uses the RPC of the selected registry entry |
| `NEXT_PUBLIC_RITUALPOT_EXPLORER` | no | uses the explorer of the selected registry entry |

`NEXT_PUBLIC_*` values are baked in at build time: change one and redeploy.

## 3. After the first deploy

```sh
curl https://<your-app>.vercel.app/api/health   # {"ok":true,"database":"not-configured"}
curl https://<your-app>.vercel.app/api/deployment
```

The second command must return `"address"` with the recorded contract and a `"source"` of
`registry`, `database` or `environment`. If it returns `"source": "none"`, the address has not
been recorded anywhere yet — see `deployments/README.md`.

## 4. Changing the contract later

1. Deploy the new source and record it in `deployments/registry.json`.
2. `python3 scripts/verify_deployment.py` must print `match`.
3. Commit and push — Vercel rebuilds and picks the address up automatically.

To move a *running* instance without a rebuild, use `POST /api/deployment`; that path is the only
one that needs a database.
