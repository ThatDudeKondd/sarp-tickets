# Security

## Secrets

`SARP_TICKETS_BOT_TOKEN`, `SARP_TICKETS_CLIENT_ID`, `BLOXLINK_API_KEY`, and
`DATABASE_URL` live only in `.env`, gitignored, never committed. In
production they're passed to the container via `docker run --env-file`, not
baked into the image.

**Gotcha**: Docker's `--env-file` parser is stricter than `dotenv` and than
systemd's old `EnvironmentFile=` — it doesn't strip surrounding quotes or
tolerate `KEY = value` spacing. If `.env` predates the Docker migration,
check for both before assuming a token is wrong; see `DEBUG_CHEATSHEET.md`.

## `config.json`

Role IDs, category IDs, and channel IDs that gate ticket actions all live in
`config.json` (see `ARCHITECTURE.md`), not `.env`, not in the database. It's
gitignored with **no `.example` template checked in** — losing it on the
server means a manual re-authoring of every role/channel ID before the bot
can gate anything correctly again. Back it up alongside `.env` if you script
backups for this host.

## Permission model

No separate auth system — entirely Discord role membership, checked in
`utils/permissions.ts` against the role IDs in `config.json`:
`isStaffMember`, `hasClaimRole`, `canForceUnclaim`, `canManagePanel`. There
is no bot-owner debug console wired into this bot (unlike `sarp-utilities`,
which loads `djsko`/Jishaku) — this bot has no built-in arbitrary
code/shell-execution surface.

## Transcript sharing (`services/ticketShare.ts`)

Closed-ticket transcript URLs are built as:

```
{DOMAIN}/tickets/transcript/{openerId}-{ticketId}.html
```

Both `openerId` (a Discord user ID) and `ticketId` (an auto-increment
integer) are predictable/enumerable — the URL itself contains **no
authentication token**. Ticket transcripts can include names, complaints,
and moderation context. Whatever serves `DOMAIN` (not part of this repo)
must enforce its own access control on that path if transcripts are meant
to be non-public; this bot only constructs the link and does not host or
authenticate it.

## External API calls

`services/bloxlink.ts` sends the Discord user ID being looked up to the
Bloxlink API along with `BLOXLINK_API_KEY`. Treat that key like any other
bot secret — anyone with it can query Bloxlink under this account's quota
and identity.
