# ---------- builder ----------
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json ./
COPY src/server/ src/server/
COPY src/constants/ src/constants/

# ---------- runtime ----------
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV FFMPEG_PATH=/usr/bin/ffmpeg

WORKDIR /app

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/tsconfig.json tsconfig.json
COPY --from=builder /app/tsconfig.node.json tsconfig.node.json
COPY --from=builder /app/src/server src/server
COPY --from=builder /app/src/constants src/constants

RUN mkdir -p data uploads outputs avatars_generated avatars_uploads exports logs

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npx", "tsx", "src/server/index.ts"]
