# Architecture

TypeScript Discord bot (discord.js v14) implementing a support-ticket
system: staff claim/unclaim, categories for general vs. supervisor tickets,
transcripts, anti-ping enforcement, blacklisting, and per-guild config
editable through Discord UI panels. Backed by PostgreSQL via Prisma.

## Config: three different sources, on purpose

- **`.env`** — secrets and process-level values only: bot token, client ID,
  the Bloxlink API key, `DATABASE_URL`, `DOMAIN`.
- **`config.json`** (`src/config.ts`) — everything an operator tunes without
  redeploying: channel/role/category IDs, and tunable thresholds
  (`max_open_tickets`, inactivity windows, anti-ping window, close delay).
  Loaded once into an in-memory `config` object; `updateConfig()` merges a
  patch, persists it back to `config.json`, and updates the in-memory copy —
  this is what the in-Discord config panel (`components/configPanel.ts`,
  `events/config.ts`) writes through. It's gitignored with no `.example`
  checked in, so a fresh deployment needs one hand-authored before first
  boot.
- **`prisma/schema.prisma` / Postgres** — actual ticket data and stats (see
  below), not configuration.

## Data model

- **`Ticket`** — one row per ticket channel: opener, type (`general` /
  `supervisor`), status, claim history summary fields, timestamps.
  Relates to `ResponseSample` (staff response-time samples, feeds the ETA
  shown when opening a ticket) and `ClaimHistory` (claim/unclaim/transfer
  audit trail).
- **`Blacklist`** — user IDs barred from opening tickets.
- **`AntiPing`** — per-user offence/auto-timeout counters for the anti-ping
  system (`services/antiPing.ts`).
- **`ClaimStat`** / **`TicketTypeStat`** — aggregate counters for stats
  commands.
- **`Meta`** — generic key/value store for small persisted state that
  doesn't warrant its own table.

## Request flow

```
Discord gateway event
  -> events/{interactions,messages,config}.ts
  -> services/*.ts (business logic)
  -> components/{builders,configPanel,containerStore}.ts (renders the reply)
```

- **`events/interactions.ts`** (the largest handler) — button/select-menu/
  modal interactions for the ticket lifecycle: open, claim, unclaim,
  transfer, close, and the config panel's edit flows.
- **`events/messages.ts`** — prefix-command fallback and anti-ping message
  scanning.
- **`events/config.ts`** — the staff-facing config panel's interaction
  handling, on top of `config.ts`'s `updateConfig()`.
- **`services/tickets.ts`** — core ticket lifecycle (open/claim/close/
  transfer channel + DB state).
- **`services/close.ts`** — closing flow + transcript generation
  (`discord-html-transcripts`).
- **`services/ticketShare.ts`** — builds a shareable transcript link against
  `env.domain`; this repo does not itself host a web server for that
  domain — it's an external site this bot only links to.
- **`services/inactivity.ts`** / **`panelSchedule.ts`** — periodic jobs:
  auto-checkup/close of stale tickets, scheduled panel refresh.
- **`services/antiPing.ts`** — detects staff being pinged outside a ticket
  and escalates (warn → timeout) per `AntiPing` counters.
- **`services/blacklist.ts`** — gate on ticket creation.
- **`services/bloxlink.ts`** — looks up a Discord user's linked Roblox
  account via the Bloxlink API (`BLOXLINK_API_KEY`), used where Roblox
  identity matters for a ticket.
- **`services/commandLog.ts`** — audit log of staff actions to
  `Command_Log_Channel`.
- **`utils/permissions.ts`** — role-based checks (`isStaffMember`,
  `hasClaimRole`, `canForceUnclaim`, `canManagePanel`) against the role IDs
  in `config.json`, plus the channel-name sanitizer used when creating
  ticket channels.

## Deployment

Production topology (Docker image, systemd units, webhook/timer auto-deploy)
is covered in `README.md`'s Deployment section and `DEBUG_CHEATSHEET.md`.
