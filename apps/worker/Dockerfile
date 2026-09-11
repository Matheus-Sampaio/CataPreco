# Single-stage: playwright's own installer pulls the right system deps
# for the image's distro (avoids Debian/Ubuntu package-name drift).
FROM node:22-bookworm-slim
WORKDIR /repo
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# NOTE: NODE_ENV=production must NOT be set before npm ci (devDeps like tsx are required at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && npm ci --no-audit --no-fund \
  && npm run generate -w packages/db \
  && npx playwright install --with-deps chromium \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

CMD ["npm", "run", "start", "-w", "apps/worker"]
