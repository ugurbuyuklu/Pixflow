# ---------- builder ----------
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm rebuild better-sqlite3

COPY tsconfig.json tsconfig.node.json tsconfig.web.json vite.web.config.ts ./
COPY src/server/ src/server/
COPY src/constants/ src/constants/
COPY src/renderer/ src/renderer/

RUN npx vite build --config vite.web.config.ts

# ---------- runtime ----------
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium tini \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV FFMPEG_PATH=/usr/bin/ffmpeg

RUN groupadd -r pixflow && useradd -r -g pixflow -m pixflow

WORKDIR /app

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/tsconfig.json tsconfig.json
COPY --from=builder /app/tsconfig.node.json tsconfig.node.json
COPY --from=builder /app/src/server src/server
COPY --from=builder /app/src/constants src/constants
COPY --from=builder /app/dist/web dist/web

RUN mkdir -p data uploads outputs avatars_generated avatars_uploads exports logs \
  && chown -R pixflow:pixflow /app

USER pixflow

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["npx", "tsx", "src/server/index.ts"]
