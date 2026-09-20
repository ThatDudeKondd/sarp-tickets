# Build context must be the repo root (../), not this directory -- sarp-tickets
# is an npm workspace member and depends on the sibling djsko package.
# e.g. docker build -f sarp-tickets/Dockerfile . (from /opt/sarp-project)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY djsko djsko
COPY sarp-tickets sarp-tickets
RUN npm ci

RUN npm run build:djsko
RUN npm run db:gen --workspace=sarp-tickets
RUN npm run build --workspace=sarp-tickets

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

WORKDIR /app/sarp-tickets
CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
