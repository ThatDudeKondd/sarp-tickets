# SARP Tickets

Discord ticket bot for SARP, built with TypeScript, discord.js, and Prisma
(PostgreSQL).

## 🚀 Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL

### Setup

```bash
npm install
cp .env.example .env   # fill in BOT_TOKEN, CLIENT_ID, CLIENT_SECRET, DATABASE_URL, etc.
npm run db:update      # format schema, push it, generate the Prisma client
npm run dev            # run with tsx, no build step
```

### npm Scripts

```bash
npm run dev         # dev, via tsx
npm run build        # tsc -> dist
npm start            # run compiled bot
npm run deploy        # register slash commands
npm run db:push       # push schema to database
npm run db:migrate    # create a migration
npm run db:gen        # generate Prisma client
npm run db:update     # format + push + generate, all at once
```

## 🐳 Production Deployment

Production runs this bot in Docker, supervised by a systemd `--user` service.

- **Image**: multi-stage build from `Dockerfile` (context is this repo's root):
  ```bash
  docker build -t sarp-tickets:latest .
  ```
- **Process supervisor inside the container**: `pm2-runtime` via
  `ecosystem.config.js` (single fork instance).
- **systemd unit** (`sarp-tickets.service`): `ExecStart=docker run --rm
  --name sarp-tickets --network host --env-file .env sarp-tickets:latest`.
  `--network host` lets the container reach Postgres on `localhost:5432`.
- **Auto-deploy**: `deploy-sarp-tickets.sh` is triggered by a GitHub webhook
  (push to `main`) or a 5-minute polling timer as a fallback. It pulls,
  rebuilds the image, runs one-shot `docker run ... npm run db:update` and
  `npm run deploy` containers, then restarts the systemd service.

### Useful ops commands

```bash
journalctl --user -u sarp-tickets -f      # bot logs (follow)
docker ps                                  # confirm container is up
docker logs -f sarp-tickets                # same logs, if already at a docker prompt
systemctl --user restart sarp-tickets.service
```
