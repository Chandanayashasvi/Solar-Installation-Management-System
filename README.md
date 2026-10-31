# Solar Pro — React + Express + PostgreSQL

Rooftop-solar operations platform: **enquiry → survey → quotation → order → advance → reservation → serial dispatch → delivery (warranty starts) → installation → service tickets → profitability reports.**
The original Flask/SQLite prototype is preserved untouched in `legacy/solar_console_docker.zip`.

> **Status honesty:** Admin user management, subsidy tracking, technician-pay records, role-specific dashboards, a public enquiry form, and optional camera scanning are implemented. The current Docker database has been updated with additive schema changes and the API/web services are healthy. Full end-to-end role and business-lifecycle integration tests remain outstanding. See [REQUIREMENTS-TRACEABILITY.md](./REQUIREMENTS-TRACEABILITY.md) for verified scope and remaining work.

## Run (Windows PowerShell, Docker Desktop)
```powershell
Copy-Item .env.example .env        # then edit the secrets in .env
docker compose up --build
```
- App: http://localhost:8080  ·  Public enquiry form: http://localhost:8080/apply  ·  Health: http://localhost:8080/api/health
- The API container safely prepares the additive enquiry schema for existing databases, runs `prisma db push`, then the idempotent seed (when `SEED_DEMO=true`), then starts.
- Postgres is **not** published to the host. Data persists in the `pgdata` volume.
- Do not remove the `pgdata` volume when restarting or updating the app.

## Demo accounts (DEMO ONLY — password `Demo@12345`)
`admin@` (director) · `sales@` · `surveyor@` · `store@` (warehouse) · `tech@` · `support@` · `finance@` — all `@sunpower.demo`.
Seed has: stock with serials, 15 packages, an expired-inverter customer (serial `DEMO-INV3-0001`, 30 months old: inverter expired, panels still covered), an in-warranty customer (`DEMO-INV2-0001`, with an open ticket), a qualified lead ready to quote, a new web lead, a pending survey.

## Local dev without Docker
```powershell
cd backend; npm install; $env:DATABASE_URL="postgresql://user:pass@localhost:5432/solar"; $env:JWT_SECRET="a-long-random-secret-here"
npx prisma db push; npm run seed; npm run dev
cd ..\frontend; npm install; npm run dev   # http://localhost:5173 (proxies /api)
```
When running the frontend with a Docker-managed backend, keep the Docker app on `http://localhost:8080`; Vite proxies API and upload requests through it. If running the backend directly on the host instead, set `$env:VITE_API_PROXY_TARGET="http://localhost:4000"` before `npm run dev`.
The startup schema preparation only adds the enquiry fields/idempotency index and updates the subsidy draft default. For future schema changes, create and commit proper Prisma migrations rather than adding broad `--accept-data-loss` flags.

## Verify
```powershell
cd backend; npm install; npm run typecheck; npm test      # unit tests cover warranty/BOM/quote/finance/billing
cd ..\frontend; npm install; npm run typecheck; npm run build
```
API/database integration tests (auth/RBAC, survey gate, duplicate serial, payment idempotency, dispatch consistency) require a throw-away Postgres (`DATABASE_URL` pointing at a *test* database, never the demo one). See [REQUIREMENTS-TRACEABILITY.md](./REQUIREMENTS-TRACEABILITY.md) for audited gaps.

## Business rules enforced server-side
Quote blocked until survey approved (director override needs reason, audited) · advance (`ADVANCE_PERCENT`, default 30%) auto-confirms order & reserves stock · payments are row-locked + idempotent, no overpayment · dispatch needs CONFIRMED order, scanned serials that exist, are IN_STOCK and match the product · delivery auto-creates warranty rows (2y inverter/battery/controller, 20y panels — configurable examples) · install needs times, passed test, checklist, photo, signature · tickets: covered if complaint date is inside warranty window → ₹0, else parts + labour + call-out · reports: invoiced (order totals) vs collected (payment rows, counted once) vs outstanding vs estimated profit (invoiced − material cost − technician hours × rate).

## Roles → access
ADMIN team/access management and all business workspaces · SALES enquiries/survey assignments/quotes/orders/payments/scheduling · SURVEYOR assigned surveys and review · WAREHOUSE inventory/purchase orders/dispatch/delivery · TECHNICIAN own jobs · SUPPORT equipment lookup/tickets · FINANCE reports, orders/payments, invoice records, expenses, technician pay records, and subsidy tracking. Technician pay status is recorded only; it does not initiate a real payment.

## Known limitations
Camera scanning depends on the browser's native `BarcodeDetector` support and camera permission; manual serial entry remains available · quotation print uses browser "Save as PDF" · supplier management is limited to creating/updating suppliers through purchase orders · installation-evidence uploads still need an access-control review · token in sessionStorage · seeded prices are illustrative · no refresh tokens. Do not reset or remove the persistent PostgreSQL volume when updating the Docker deployment.

## Branching
`main` (demo-ready) ← `feat/<area>` PRs, one per teammate/module. Add the evaluator as collaborator in GitHub → Settings → Collaborators once you have their real username.

## 5-minute demo script
1. Dashboard (admin): the problem + live KPIs. 2. `/apply` as a customer → appears in Enquiries. 3. Sales: save survey → approve → generate 3 kW quote (show BOM, print). 4. Accept → order; record advance → auto-confirmed, stock reserved; schedule technician. 5. Store: dispatch scanning `INV3KW-S0001…` etc. → deliver (warranties start). 6. Tech: complete job (photo + signature). 7. Support: search `DEMO-INV3-0001` (expired) vs `DEMO-INV2-0001` (covered) → open/resolve ticket, show ₹0 vs billed. 8. Dashboard profit table + CSV.
