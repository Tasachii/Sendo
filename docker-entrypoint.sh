#!/bin/sh
set -e

# On Render the public URL is provided as RENDER_EXTERNAL_URL; NextAuth needs NEXTAUTH_URL.
export NEXTAUTH_URL="${RENDER_EXTERNAL_URL:-${NEXTAUTH_URL:-http://localhost:3000}}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(head -c 32 /dev/urandom | base64)}"

echo "→ applying database schema"
npx prisma migrate deploy

if [ "${SENDO_DEMO_SEED:-false}" = "true" ]; then
  echo "→ seeding demo data"
  set +e
  npm run seed
  seed_status=$?
  set -e
  if [ "$seed_status" -eq 2 ]; then
    echo "→ demo seed skipped (database already contains data)"
  elif [ "$seed_status" -ne 0 ]; then
    exit "$seed_status"
  fi
fi

echo "→ starting Sendo at $NEXTAUTH_URL"
exec npm run start -- -p "${PORT:-3000}" -H 0.0.0.0
