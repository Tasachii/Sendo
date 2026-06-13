# Sendo — container for a self-contained live demo (SQLite inside the container).
# Demo data is reseeded on every start, so the public demo always looks clean.
FROM node:20-slim

# Prisma needs OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps (dev deps included: prisma CLI + tsx for migrate/seed at boot)
# copy the prisma schema first so the postinstall `prisma generate` can find it
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# build
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
CMD ["/usr/local/bin/entrypoint.sh"]
