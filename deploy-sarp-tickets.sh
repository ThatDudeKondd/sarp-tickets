#!/usr/bin/env bash
set -euo pipefail

export XDG_RUNTIME_DIR="/run/user/$(id -u)"

LOCKFILE="/tmp/sarp-tickets-deploy.lock"
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  echo "Another deploy is already running, skipping."
  exit 0
fi

REPO_DIR="/opt/sarp-project/sarp-tickets"
BRANCH="main"

cd "$REPO_DIR"

git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/"$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "No changes, nothing to deploy."
  exit 0
fi

echo "New commits found ($LOCAL -> $REMOTE), deploying..."
git pull origin "$BRANCH"

docker build -t sarp-tickets:latest .

# --network host lets the throwaway container reach Postgres at
# localhost:5432 the same way the systemd-run container does.
docker run --rm --network host --env-file .env sarp-tickets:latest npm run db:update

# Idempotent -- safe to run even when commands haven't changed.
docker run --rm --network host --env-file .env sarp-tickets:latest npm run deploy

systemctl --user restart sarp-tickets.service

echo "Deploy complete."
