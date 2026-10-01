# ShopFlow

ShopFlow is a constraint-aware production scheduling system for small high-mix, low-volume CNC job shops.

## Tech Stack
- Next.js (App Router)
- TypeScript (Strict Mode)
- PostgreSQL
- Prisma ORM

## Prerequisites
- Node.js (v18+)
- PostgreSQL (Docker or local installation)

## Environment Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update the `DATABASE_URL` in `.env` to point to your PostgreSQL instance.

## PostgreSQL Setup
If you prefer Docker, you can run a local Postgres instance using:
```bash
docker run --name shopflow-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shopflow -p 5432:5432 -d postgres
```
(Update the `.env` connection string to match these credentials: `postgresql://postgres:postgres@localhost:5432/shopflow?schema=public`)

## Install Dependencies
```bash
npm install
```

## Prisma Workflow
1. Initialize the development schema with migrations:
   ```bash
   npx prisma migrate deploy
   ```
2. Generate Prisma Client:
   ```bash
   npx prisma generate
   ```

## Development Commands
- **Run dev server**: `npm run dev`
- **Lint code**: `npm run lint`
- **Typecheck code**: `npm run typecheck`
- **Build production app**: `npm run build`

Every push and pull request is validated by GitHub Actions with PostgreSQL-backed migrations, linting, type checking, the test suite, a production build, and a Docker image build.

## Production deployment

The repository includes a standalone Next.js Docker image. Build and run it with:

```bash
docker build -t shopflow:latest .
docker run --env-file .env -p 3000:3000 shopflow:latest
```

Run Prisma migrations from a release job or deployment step before starting the new image:

```bash
npx prisma migrate deploy
```

Configure the platform health check to call `GET /api/health`. It returns `200` only when the application can reach PostgreSQL and `503` when the database is unavailable.

For a managed deployment, the repository also includes a Render Blueprint in `render.yaml`. It tracks `master` in the Singapore region, provisions PostgreSQL, runs migrations before deploy, and configures the health check. Connect the repository in Render, review the generated database and service plan, and provide the values marked `sync: false` before the first deploy.

### Free Vercel + Supabase deployment

For a no-card portfolio deployment, use Vercel Hobby for the Next.js application and a Supabase Free Postgres project for the database:

1. Create a Supabase project and copy both Prisma connection strings: use the **Transaction pooler** URL (port `6543`) for `DATABASE_URL`, and the **Session pooler** URL (port `5432`) for `DIRECT_URL`.
2. Import this repository into Vercel and keep the project on the Hobby plan.
3. Add these Vercel environment variables for **Production**:
   - `DATABASE_URL`: the Supabase Transaction pooler connection string (port `6543`).
   - `DIRECT_URL`: the Supabase Session pooler connection string (port `5432`), used for Prisma migrations.
   - `SHOPFLOW_SESSION_SECRET`: a long random secret.
   - `SHOPFLOW_APP_URL`: the Vercel deployment URL.
   - `GEMINI_API_KEY`: optional; leave empty if the AI explanation assistant is not needed.
   - `GEMINI_MODEL`: optional; defaults to `gemini-3.5-flash-lite`.
   - `RESEND_API_KEY`, `SHOPFLOW_EMAIL_FROM`: optional; required only for public email verification and password recovery.
4. Deploy. `vercel.json` runs Prisma client generation and `prisma migrate deploy` during the Vercel build.
5. In a one-time local terminal, point `DATABASE_URL` at the Supabase database and run `npm run seed` to load the demo planner data. Do not commit the database URL or any secret.

The free tiers are intended for personal/demo use. Supabase may pause low-activity free projects, so resume the project from its dashboard if a recruiter visits after a long period of inactivity.

## Planner Workflow

1. Run PostgreSQL and initialize the schema.
2. Run `npm run seed` to create the Development Organization, demo planner account, sample machines, product routings, setup rules, maintenance window, and five released jobs.
3. Sign in with the seeded demo account, or create a workspace from the **Sign up** page.
4. Open **Schedule** and select **Generate Schedule**.
5. Inspect the seven-day Gantt board, metrics, and assignment details.
6. Configure `GEMINI_API_KEY` in `.env` to enable the read-only schedule explanation assistant. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`.
7. Configure `RESEND_API_KEY`, `SHOPFLOW_EMAIL_FROM`, and `SHOPFLOW_APP_URL` to enable real signup verification and password recovery emails. Without them, those public-account actions return a controlled `503` instead of claiming an email was sent.

## Authentication and production configuration

The application uses organization-scoped sessions in production. Set `SHOPFLOW_SESSION_SECRET` to a long random value before deployment. The development seed creates the demo login `planner@shopflow.local` with password `ShopFlowDemo!2026`; change or remove this account before using a production database. The sign-up flow creates a new organization and owner account. Login and signup include process-local throttling; a multi-replica deployment should also configure a shared WAF or gateway limit. For a public production launch, add email verification, password recovery, and an operational process for account support before inviting external clients.

Production deployments must provide `DATABASE_URL`, `SHOPFLOW_SESSION_SECRET`, and a managed PostgreSQL database. Do not use the sample credentials from `.env.example` in production.

Only released and in-progress jobs with pending operations are included in generated schedules. Each regenerated schedule becomes a new version and supersedes the previous active version.
