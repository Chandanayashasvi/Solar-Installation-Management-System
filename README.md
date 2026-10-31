# SunPower Console v2 — React + Express + PostgreSQL

Rooftop-solar operations platform: **enquiry → survey → quotation → order → advance → reservation → serial dispatch → delivery (warranty starts) → installation → service tickets → profitability reports.**
The original Flask/SQLite prototype is preserved untouched in `legacy/solar_console_docker.zip`.

> **Status honesty:** this code was written in a sandbox with no Docker, no PostgreSQL and no npm network access. The pure business-logic functions (warranty dates, BOM, quote totals, finance, billing) were executed and pass. **Nothing else has been compiled, installed, started or tested** — expect to fix small type/runtime errors on first run. See "Verify" below.

## Run (Windows PowerShell, Docker Desktop)
```powershell
Copy-Item .env.example .env        # then edit the secrets in .env
docker compose up --build
```
- App: http://localhost:8080  ·  Public enquiry form: http://localhost:8080/apply  ·  Health: http://localhost:8080/api/health
- The API container runs `prisma db push`, then the idempotent seed (when `SEED_DEMO=true`), then starts.
- Postgres is **not** published to the host. Data persists in the `pgdata` volume.
- Demo reset: `docker compose down -v ; docker compose up --build`

## Demo accounts (DEMO ONLY — password `Demo@12345`)
`admin@` (director) · `sales@` · `store@` (warehouse) · `tech@` · `support@` — all `@sunpower.demo`.
Seed has: stock with serials, 15 packages, an expired-inverter customer (serial `DEMO-INV3-0001`, 30 months old: inverter expired, panels still covered), an in-warranty customer (`DEMO-INV2-0001`, with an open ticket), a qualified lead ready to quote, a new web lead, a pending survey.

## Local dev without Docker
```powershell
cd backend; npm install; $env:DATABASE_URL="postgresql://user:pass@localhost:5432/solar"; $env:JWT_SECRET="a-long-random-secret-here"
npx prisma db push; npm run seed; npm run dev
cd ..\frontend; npm install; npm run dev   # http://localhost:5173 (proxies /api)
```
Create real migrations once: `cd backend; npx prisma migrate dev --name init` (commit `prisma/migrations`, then switch the Dockerfile CMD to `prisma migrate deploy`).

## Verify (run these — I could not)
```powershell
cd backend; npm install; npm run typecheck; npm test      # unit tests cover warranty/BOM/quote/finance/billing
cd ..\frontend; npm install; npm run typecheck; npm run build
```
Not yet written: API integration tests (auth/RBAC, survey gate, duplicate serial, payment idempotency, dispatch consistency) — they need a throw-away Postgres (`DATABASE_URL` pointing at a *test* database, never the demo one).

## Business rules enforced server-side
Quote blocked until survey approved (director override needs reason, audited) · advance (`ADVANCE_PERCENT`, default 30%) auto-confirms order & reserves stock · payments are row-locked + idempotent, no overpayment · dispatch needs CONFIRMED order, scanned serials that exist, are IN_STOCK and match the product · delivery auto-creates warranty rows (2y inverter/battery/controller, 20y panels — configurable examples) · install needs times, passed test, checklist, photo, signature · tickets: covered if complaint date is inside warranty window → ₹0, else parts + labour + call-out · reports: invoiced (order totals) vs collected (payment rows, counted once) vs outstanding vs estimated profit (invoiced − material cost − technician hours × rate).

## Roles → access
ADMIN everything · SALES enquiries/surveys/quotes/orders/payments/scheduling/subsidy · WAREHOUSE inventory/dispatch/delivery · TECHNICIAN own jobs · SUPPORT lookup/tickets.

## Known limitations
No barcode camera scanner (manual/scanner-as-keyboard entry only) · quotation print uses browser "Save as PDF" · subsidy has API only (no UI page) · no PO/supplier UI beyond receiving · uploads served by unguessable URL, not auth-gated · token in sessionStorage · seeded prices are illustrative · no refresh tokens.

## Branching
`main` (demo-ready) ← `feat/<area>` PRs, one per teammate/module. Add the evaluator as collaborator in GitHub → Settings → Collaborators once you have their real username.

## 5-minute demo script
1. Dashboard (admin): the problem + live KPIs. 2. `/apply` as a customer → appears in Enquiries. 3. Sales: save survey → approve → generate 3 kW quote (show BOM, print). 4. Accept → order; record advance → auto-confirmed, stock reserved; schedule technician. 5. Store: dispatch scanning `INV3KW-S0001…` etc. → deliver (warranties start). 6. Tech: complete job (photo + signature). 7. Support: search `DEMO-INV3-0001` (expired) vs `DEMO-INV2-0001` (covered) → open/resolve ticket, show ₹0 vs billed. 8. Dashboard profit table + CSV.
