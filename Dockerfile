FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PGLITE_DATA_DIR=/app/data/db

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json

RUN npm ci --omit=dev --workspaces=false

COPY dist ./dist
COPY frontend/dist ./frontend/dist
COPY .env.example ./.env.example

RUN mkdir -p /app/data/db && chown -R node:node /app

USER node

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["npm", "start"]
