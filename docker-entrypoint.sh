#!/bin/sh
set -e

# On Render the public URL is provided as RENDER_EXTERNAL_URL; NextAuth needs NEXTAUTH_URL.
export NEXTAUTH_URL="${RENDER_EXTERNAL_URL:-${NEXTAUTH_URL:-http://localhost:3000}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(head -c 32 /dev/urandom | base64)}"

echo "→ applying database schema"
npx prisma migrate deploy

echo "→ seeding demo data"
npm run seed || echo "seed skipped"

echo "→ starting Sendo at $NEXTAUTH_URL"
exec npm run start -- -p "${PORT:-3000}" -H 0.0.0.0
