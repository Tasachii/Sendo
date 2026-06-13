# Deploying Sendo (live demo)

Sendo is a server app (NextAuth + Prisma + server-rendered PDFs), so it needs a host that
runs Node — not a static page host. The simplest free option is **Render** using the included
`Dockerfile` and `render.yaml`. The container ships SQLite inside it and **reseeds demo data on
every start**, so the public demo always looks clean (data is intentionally ephemeral).

## Render (recommended, free, ~1 click)

1. Push this repo to GitHub (already done: `Tasachii/Sendo`).
2. Go to **render.com → New → Blueprint** and pick the `Sendo` repo. Render reads `render.yaml`.
3. Click **Apply**. Render builds the Dockerfile and starts the service.
   - `NEXTAUTH_SECRET` is generated automatically.
   - `NEXTAUTH_URL` is derived from Render's URL at boot (`docker-entrypoint.sh`).
4. Open the service URL (e.g. `https://sendo.onrender.com`) and sign in with the demo account:

   | Email | Password |
   |---|---|
   | `demo@sendo.test` | `demo1234` |

> Free instances sleep after inactivity; the first request after a sleep takes ~30s to wake,
> and waking reseeds the demo data.

## Run the container locally

```bash
docker build -t sendo .
docker run -p 3000:3000 -e NEXTAUTH_SECRET=dev-secret sendo   # http://localhost:3000
```

## Notes for a persistent (non-demo) deployment

For real multi-user use, switch from ephemeral SQLite to PostgreSQL:

1. In `prisma/schema.prisma` set `provider = "postgresql"` and `url = env("DATABASE_URL")`.
2. Provision a database (e.g. Neon free tier) and set `DATABASE_URL`.
3. Use a host with a persistent service (Render Web Service + managed Postgres, Railway, Fly.io).
4. Drop the reseed step from `docker-entrypoint.sh` (run `prisma migrate deploy` only).
