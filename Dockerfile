# ── Stage 1: install all deps (including dev for build) ─────────────────────
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: compile TypeScript ──────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build

# ── Stage 3: production runtime ──────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

# System libraries required by Playwright's Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV MCP_TRANSPORT=httpStream
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Install only chromium (no other browsers) — skip system-deps, done above
RUN npx playwright install chromium

EXPOSE 8080
CMD ["node", "dist/index.js"]
