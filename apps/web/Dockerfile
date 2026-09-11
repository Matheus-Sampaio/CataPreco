# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN npm ci --no-audit --no-fund

ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run generate -w packages/db \
  && npm run build -w apps/web

# ---------- run ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# Prisma engine + client (externalized from the bundle)
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
