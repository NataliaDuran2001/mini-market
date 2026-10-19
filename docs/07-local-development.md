# 07 - Local development

Run the whole system on your computer against the real Supabase dev project `mini-market-dev`, and test milestone M1 by hand. Hosting is deferred (ADR 0011 amendment), so nothing here deploys anything. Docker is not needed.

Commands are for **Git Bash** (installed with Git for Windows) at the repository root. Every command below starts from a fresh terminal.

## 1. What runs where

| Piece | Where | Address |
|---|---|---|
| Web (React, Vite) | your computer | http://localhost:5173 |
| API (NestJS) | your computer | http://localhost:3001, routes under `/api/v1` |
| Database, Auth | Supabase project `mini-market-dev` (region `sa-east-1`) | in the cloud |
| Tests (`pnpm test`) | your computer, in-memory Postgres (PGlite) | never touches Supabase |

The API connects to the database as the role `app_user` (cannot bypass row level security) through the Supabase pooler. Migrations and the provisioning script use the owner role `postgres`. The browser only talks to Supabase for sign-in; all data goes through the API (ADR 0003).

## 2. Prerequisites

| Need | How |
|---|---|
| Git for Windows | provides Git Bash |
| Node 22 with nvm | `nvm install 22` then `nvm use 22`. Check: `node -v` prints `v22.x`. |
| pnpm 10.18 through corepack | `corepack enable` once. The repository pins the version, so `pnpm -v` prints `10.18.0` inside it. |
| Supabase CLI | nothing to install: use `npx supabase`. Log in once with `npx supabase login` (only for section 9). |
| The secrets file | see below |

### The secrets file

It lives **outside** the repository, at `~/.mini-market/supabase-dev.env` (that is `C:\Users\<you>\.mini-market\supabase-dev.env`). The repository is public: never copy its values into the repository, chat, issues or pull requests.

```
SUPABASE_PROJECT_REF=<20 letters, the part of the project URL before .supabase.co>
SUPABASE_URL=https://<project ref>.supabase.co
SUPABASE_ANON_KEY=<Dashboard > Project Settings > API Keys > anon (public)>
SUPABASE_SERVICE_ROLE_KEY=<same page > service_role (secret)>
SUPABASE_DB_PASSWORD=<Dashboard > Project Settings > Database > database password>
```

Optional: `SUPABASE_POOLER_HOST` (default `aws-1-sa-east-1.pooler.supabase.com`). If the first `pnpm setup:db` says the host cannot be reached, run `npx supabase link --project-ref <ref>` and read the host from `supabase/.temp/pooler-url` (the file is gitignored). To use another location set `MINI_MARKET_SECRETS_FILE`.

## 3. First setup (about 5 minutes)

```
git clone https://github.com/NataliaDuran2001/mini-market.git
cd mini-market
pnpm install
pnpm setup:env        # writes apps/api/.env and apps/web/.env from the secrets file
pnpm turbo run build --filter=@mini-market/contracts --filter=@mini-market/shared-kernel
pnpm setup:db         # applies the migrations, gives app_user its login, checks RLS
pnpm setup:tenants    # creates the two test businesses and their owners
```

What each command does:

| Command | Effect | Safe to repeat |
|---|---|---|
| `pnpm setup:env` | Reads the secrets file and writes the two gitignored `.env` files. The web file gets only the URL and the anon key, never the service role key or a database password. Prints variable names, never values. Fails with a clear message when the secrets file is missing or incomplete. Derives the `app_user` password and the test password from the secrets, so every checkout and worktree of yours gets the same values and none invalidates another. | yes |
| `pnpm setup:db` | Applies pending migrations (owner role), sets the `app_user` password the API will use, prints PASS or FAIL for: RLS enabled and forced on every tenant table, `app_user` cannot bypass RLS, the browser roles `anon` and `authenticated` have no table privilege, the API connection is `app_user`. | yes |
| `pnpm setup:tenants` | Creates the Supabase Auth accounts of the two test owners (confirmed, with a password, so no email is sent) and runs the provisioning script of issue #13 for each. | yes |

The test businesses:

| | Name | Preset | Owner email |
|---|---|---|---|
| A | Dev Minimarket A | `minimarket` | `owner.a@example.com` |
| B | Dev Farmacia B | `farmacia` | `owner.b@example.com` |

Both owners use the same password. It is the value of `SMOKE_OWNER_PASSWORD` in `apps/api/.env`: open that file in an editor and copy it. Do not paste it anywhere shared.

## 4. Run

```
pnpm dev
```

Wait until both lines appear: the API listening on 3001 and Vite on `http://localhost:5173/`. Open http://localhost:5173 and sign in as `owner.a@example.com`. You land on the dashboard of "Dev Minimarket A". Stop with `Ctrl+C`.

If a port is busy, free it or set `API_PORT` and `WEB_PORT` before `pnpm setup:env` and `pnpm dev` (the two files stay consistent).

## 5. Check that everything works (smoke run)

With `pnpm dev` running, in a second terminal:

```
pnpm smoke:local
```

It prints one `PASS` or `FAIL` line per check and exits non-zero on any failure. It never prints a credential or a token. The checks:

| Group | What is checked |
|---|---|
| Files | the web `.env` holds only public variables and none of the secrets |
| Database | RLS enabled and forced with a policy on every tenant table; `app_user` cannot bypass RLS; the API connection runs as `app_user`; without a tenant bound `app_user` sees zero rows of `memberships` while the owner role sees them; `anon` and `authenticated` hold no privilege on any public table |
| Tenants | A and B exist with their preset and module flags, one active owner each |
| API and Auth | API up; real sign-in of owner A and owner B through Supabase Auth; `GET /me/tenants` returns only the own tenant; owner A with the tenant id of A gets 200; owner A with the tenant id of B gets 403; no token gets 401 |
| Supabase config | public signup is off; the emailed invitation link may land on the web app and a foreign origin is refused; the anon key cannot read `users`, `invitations`, `memberships`, `tenants` through the Supabase Data API |

## 6. Automated tests

| Command | What | Needs Supabase |
|---|---|---|
| `pnpm typecheck && pnpm lint && pnpm test` | unit and integration tests (PGlite with the real migrations and RLS) | no |
| `pnpm e2e` | Playwright against a fake Supabase and its own in-memory database | no. It starts its own API and web on 3001 and 5173: stop `pnpm dev` first. |

## 7. Call the API by hand

```
TOKEN_A=$(pnpm --silent dev:token a)      # real access token of owner A, valid about 1 hour
TOKEN_B=$(pnpm --silent dev:token b)
curl -s http://localhost:3001/api/v1/me/tenants -H "Authorization: Bearer $TOKEN_A"
```

The answer lists the tenant id of A. Put it in a variable and try both tenants (replace the two ids with the ones printed by `/me/tenants` for A and for B):

```
TENANT_A=<id of Dev Minimarket A>
TENANT_B=<id of Dev Farmacia B>
curl -s -i http://localhost:3001/api/v1/tenant -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Id: $TENANT_A"   # 200
curl -s -i http://localhost:3001/api/v1/tenant -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Id: $TENANT_B"   # 403 NOT_A_MEMBER
```

The token is a credential: keep it in the terminal, never in a file or a message.

## 8. Wipe the test data

`pnpm wipe:dev-data` shows what it would do and changes nothing. To run it you type the ref of the dev project on purpose (Dashboard > Project Settings > General > Reference ID):

```
pnpm wipe:dev-data -- --confirm-project <project ref>
```

It empties **every table of the `public` schema** of the project and deletes the two test owners from Supabase Auth. That includes the ledger tables and every business you created by hand: the dev project must hold nothing but test data. It never drops tables, roles or the migration history, and does not touch other Auth users. It refuses when the typed ref is not the project of `MIGRATION_DATABASE_URL` and `SUPABASE_URL`, when those two belong to different projects, and when `NODE_ENV=production`. Never run it against anything but `mini-market-dev`.

Then `pnpm setup:tenants` creates the two businesses again.

For a clean slate of the schema as well (rare): Dashboard > SQL Editor > drop and recreate the `public` schema and the `drizzle` schema, then `pnpm setup:db` and `pnpm setup:tenants`. Never do this on `mini-market-prod`.

## 9. Supabase Auth settings for the local run

Stored in `supabase/config.toml` (no secrets; only `[auth]` keys are declared, everything else in the project is left unchanged):

| Setting | Value | Why |
|---|---|---|
| Site URL | `http://localhost:5173` | emailed links fall back to the web app |
| Redirect allow-list | `http://localhost:5173/reset-password`, `http://localhost:5173/accept-invitation` | the two pages emailed links open |
| Public signup | off | accounts exist only through the operator or an owner's invitation (docs/05-security.md section 6) |
| Secure password change | on | changing a password needs a recent sign-in |

Apply or check them:

```
npx supabase login                                      # once, opens the browser
npx supabase link --project-ref <SUPABASE_PROJECT_REF>  # once; the link state is gitignored
npx supabase config diff                                # what differs, changes nothing
npx supabase config push                                # shows each change and asks y/n
```

Without the CLI, by hand in the Dashboard of `mini-market-dev`:

1. Authentication > URL Configuration: Site URL `http://localhost:5173`; Redirect URLs: add the two URLs above.
2. Authentication > Sign In / Providers (or Settings): turn off "Allow new users to sign up".
3. Authentication > Sign In / Providers > Email: turn on "Secure password change" (wording varies: "require recent login to change password").

## 10. Manual M1 checklist (epic #8)

What the scripts above already prove is marked. What needs a person is the rest. Do these with `pnpm dev` running.

| # | Step of the epic | Status | How |
|---|---|---|---|
| 1 | Provision tenant A (minimarket) and B (farmacia) | Done by `pnpm setup:tenants`, checked by `pnpm smoke:local` | For a real business with a real owner email, see 10.1 |
| 2 | Accept the owner invitation email, set a password, log in on a phone | **You** | 10.1 and 10.2 |
| 3 | Invite an employee, accept, log in, confirm the menu lacks Reportes, Capital and Configuración | **You** (no invite screen yet, issue #93) | 10.3 |
| 4 | Log in as owner B and confirm the pharmacy modules in settings | Sign-in: **you**. Modules: no settings screen yet (#93); the API shows them | 10.4 |
| 5 | With the token of A call the API with the tenant id of B and get 403 | Done by `pnpm smoke:local`; you can repeat it with section 7 | section 7 |
| 6 | Disable the employee and confirm they are logged out of tenant routes | **You** (no screen yet, #93) | 10.5 |
| 7 | `pnpm e2e --grep @M1` green on mobile and desktop | Automated; run it (section 6) | |

### 10.1 A real owner with a real invitation email

Use an address you can read. Supabase's built-in email sender is limited (a few emails per hour, and it may only deliver to members of your Supabase organization); if the email never arrives, set up custom SMTP in Dashboard > Authentication > SMTP Settings or invite an address of your own organization.

```
pnpm --filter @mini-market/api provision -- --name "Mini Market Prueba" --slug mini-market-prueba --preset minimarket --owner-email you@your-domain.com
```

The email contains a link to `http://localhost:5173/reset-password`. It only works on the computer that runs `pnpm dev`. Open the email on that computer, set the password, then sign in at http://localhost:5173/login.

### 10.2 Sign in from a real phone

A phone cannot open `localhost` of your computer, and the API refuses a plain `http` web origin that is not localhost (docs/05-security.md section 6), so the phone needs an https address for both the web and the API. This is not automated and was **not verified** by the lane that wrote this document. Options:

1. Quick approximation, no phone: Edge or Chrome, F12, device toolbar, pick a phone size. The e2e suite already runs the `chromium-mobile` profile.
2. Real phone: expose both ports through an https tunnel (for example Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:5173` and a second one for `http://localhost:3001`), then set `WEB_ORIGIN` in `apps/api/.env` and `VITE_API_URL` in `apps/web/.env` to the two https addresses, add the web address to the Supabase redirect list (section 9), let Vite accept the tunnel host name (`server.allowedHosts` in `apps/web/vite.config.ts`, which does not exist yet), restart `pnpm dev`. Expect to adjust. A permanent staging address (the hosting decision) removes all of this: raise it with the owner when hosting is chosen.

### 10.3 Invite an employee (API only until #93)

```
TOKEN_A=$(pnpm --silent dev:token a)
TENANT_A=<id of Dev Minimarket A, from /me/tenants>
curl -s -i -X POST http://localhost:3001/api/v1/auth/invitations \
  -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Id: $TENANT_A" -H "Content-Type: application/json" \
  -d '{"email":"employee@your-domain.com","role":"employee"}'
```

Expect `202`. The employee receives a real email (same sender limits as 10.1) whose link opens `http://localhost:5173/accept-invitation?token=...`; they choose a password and the membership is created. Then sign in as the employee and confirm the menu lacks Reportes, Capital and Configuración, and that opening `/capital` sends you to the forbidden page.

### 10.4 Pharmacy modules of owner B

Sign in on the web as `owner.b@example.com`. The settings screen does not exist yet; the API answers:

```
TOKEN_B=$(pnpm --silent dev:token b)
TENANT_B=<id of Dev Farmacia B>
curl -s http://localhost:3001/api/v1/tenant -H "Authorization: Bearer $TOKEN_B" -H "X-Tenant-Id: $TENANT_B"
```

The `modules` of B must show `lots`, `fractional` and `credit_sales` as `true`; A shows only `credit_sales`.

### 10.5 Disable the employee

```
curl -s http://localhost:3001/api/v1/members -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Id: $TENANT_A"          # find the employee userId
curl -s -X PATCH http://localhost:3001/api/v1/members/<userId> -H "Authorization: Bearer $TOKEN_A" -H "X-Tenant-Id: $TENANT_A" \
  -H "Content-Type: application/json" -d '{"status":"disabled"}'
```

The employee's next request answers 403, and the web sends them out of the tenant routes.

### 10.6 Password recovery by email

On http://localhost:5173/forgot-password enter an address that exists (the owner of 10.1). The email link opens `/reset-password` on the same computer. Same sender limits as 10.1.

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Secrets file not found` | Create `~/.mini-market/supabase-dev.env` (section 2) or set `MINI_MARKET_SECRETS_FILE`. |
| `password authentication failed for user "app_user"` right after `setup:db` changed it | The pooler caches credentials for a few seconds. `setup:db` waits and retries on its own; run it again if it gave up. |
| `Cannot find module '@mini-market/contracts'` | Build the packages: `pnpm turbo run build --filter=@mini-market/contracts --filter=@mini-market/shared-kernel` (`pnpm dev` also builds them). |
| Port 3001 or 5173 in use | Another run is active. Find it: `netstat -ano \| grep -E ":(3001\|5173) "`, stop it with `taskkill //PID <pid> //T //F`. |
| `smoke:local`: sign-in fails | `pnpm setup:tenants` sets the test password again. |
| Web shows an error banner on every request | API not running or `VITE_API_URL` differs from the API port: rerun `pnpm setup:env`. |
| A migration from a branch that is not merged was applied to the dev project | Do not. drizzle applies only migrations newer than the newest applied one, so a later-merged migration with an older timestamp is skipped silently. Apply only migrations that are on `main`. |

## 12. Rules for the shared dev project

- Only migrations merged to `main` are applied to `mini-market-dev`.
- No destructive operation. The one exception is `pnpm wipe:dev-data`, run by you (the owner) on purpose with the project ref typed, because it empties all application data of the dev project. Agents and lanes never run it.
- Never print, log or commit a value of the secrets file, a token, or a `.env` file. The repository is public.
- Test accounts use `example.com` addresses. Real addresses only for the manual steps of section 10.
