FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 4000
# schema sync + idempotent seed, then start. Replace `db push` with `migrate deploy` once migrations are committed.
CMD ["sh", "-c", "npx prisma db execute --schema prisma/schema.prisma --file prisma/prepare-existing-schema.sql && npx prisma db push --skip-generate && ([ \"$SEED_DEMO\" = \"true\" ] && npx tsx prisma/seed.ts || true) && npx tsx src/index.ts"]
