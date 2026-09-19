# SARP Tickets — Debugging Cheat Sheet

All commands below run as the `sarp` user unless noted otherwise.
If you just got a fresh `sudo -iu sarp` shell and `systemctl --user`
commands fail with a DBUS/XDG_RUNTIME_DIR error, run this first:

```
export XDG_RUNTIME_DIR=/run/user/$(id -u)
```

## Bot logs

Live/follow:

```
journalctl --user -u sarp-tickets -f
```

Last 50 lines, no follow:

```
journalctl --user -u sarp-tickets -n 50 --no-pager
```

Since a specific time:

```
journalctl --user -u sarp-tickets --since "10 minutes ago" --no-pager
```

Look for: `✅ Connected to database`, `Logged in as SARP Tickets#...`,
`Slash commands deployed.`, and no repeated restart-loop lines after that.

## Webhook receiver logs

Live/follow — shows incoming GitHub pushes AND the deploy output triggered
by them (since the webhook runs `deploy-sarp-tickets.sh` directly). This
service lives in the `sarp-utilities` repo but handles pushes for all
configured repos, including this one:

```
journalctl --user -u sarp-webhook -f
```

## Polling-timer deploy logs

Only shows output when `sarp-tickets-deploy.timer` fires the fallback poll
(not webhook-triggered deploys — those log under `sarp-webhook` instead):

```
journalctl --user -u sarp-tickets-deploy -f
```

Check when it's next scheduled to run:

```
systemctl --user list-timers
```

## Service status

```
systemctl --user status sarp-tickets.service
systemctl --user status sarp-tickets-deploy.service
systemctl --user status sarp-webhook.service
systemctl --user status sarp-tunnel.service
```

## Docker

Bot runs as a container (`--rm --name sarp-tickets`), not a bare `node`
process — `journalctl` above still works since it's foregrounded under
systemd, but these are useful too:

```
docker ps                              # confirm it's up, check uptime
docker logs -f sarp-tickets            # same output as journalctl, if you're already at a docker prompt
docker exec -it sarp-tickets sh        # shell into the running container
```

Rebuild the image manually:

```
cd /opt/sarp-project/sarp-tickets
docker build -t sarp-tickets:latest .
```

If `.env` was edited and the container fails with an `invalid env file`
error or a bad-token error, check for values wrapped in quotes or key names
with trailing spaces (`KEY = value`) — `systemd`'s `EnvironmentFile=`
tolerated both, but Docker's `--env-file` doesn't.

## Manual actions

Trigger a deploy right now, without waiting on a push or the timer:

```
/opt/sarp-project/sarp-tickets/deploy-sarp-tickets.sh
```

Restart just the bot (e.g. after manually editing `.env`):

```
systemctl --user restart sarp-tickets.service
```

Reload systemd after editing any `.service`/`.timer` file (not needed for
plain script edits like `deploy-sarp-tickets.sh`):

```
systemctl --user daemon-reload
```

## Database

Test the bot's DB connection directly:

```
psql "postgresql://sarp_bot:PASSWORD@localhost:5432/sarp_tickets" -c "SELECT 1;"
```

Open a shell into the bot's database:

```
psql -U sarp_bot -d sarp_tickets -h localhost -W
```

## GitHub side

Repo → Settings → Webhooks → click the webhook → **Recent Deliveries** tab.
Green = 200 response (arrived and was accepted). Red = check the response
code shown there — a 502 means the tunnel URL is stale or the receiver's
down, not a GitHub-side problem.
