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
1. Initialize/push schema to the database:
   ```bash
   npx prisma db push
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
