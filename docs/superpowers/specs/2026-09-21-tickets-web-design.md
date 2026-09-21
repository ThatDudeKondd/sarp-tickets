# Tickets Web — Design Spec

Public/staff web app for viewing sarp-tickets transcripts, at
`tickets.san-andreas-rp.co.uk`. New workspace package: `sarp-tickets-web`.

## Problem

`sarp-tickets` already generates an HTML transcript per closed ticket
(`discord-html-transcripts`) and PUTs it, plus a per-user JSON summary, to
`env.domain` — but nothing has ever received or served those files
(`ARCHITECTURE.md` explicitly calls this an external site the bot only
links to; the PUT calls have no auth and 500/ECONNREFUSED today).

The requested access model — community members see only their own
transcripts, general support sees all `general`-type tickets, supervisor+
sees everything — is incompatible with serving transcripts as static files
at a guessable URL. This requires a real authenticated backend, not just a
frontend over files.

## Data model

- Add `transcript_html` (nullable `text`) to the `tickets` table in the
  existing `sarp-tickets` Postgres DB. Written once, at close time.
- New Postgres role `sarp_tickets_web_ro`: `SELECT`-only grant on the
  tables the website reads (`tickets`, `claim_history`, whatever backs
  `ticketsDb`/`claimHistoryDb`). The website never gets write access to
  the bot's DB credentials.
- No new tables beyond the one column — ticket metadata already covers
  everything else needed for listing/search/access control.

## Internal write path (bot → website)

Replaces `ticketShare.ts`'s current `shareTicketTranscript` /
`shareTicketData` PUT calls.

- Single route: `PUT /internal/transcripts/:ticketId`, body = raw HTML.
- Auth: HMAC-SHA256 over the body with a shared secret, `X-Signature-256`
  header, `crypto.timingSafeEqual` compare — same pattern as
  `sarp-utilities/webhook-server.cjs`.
- Primary defense is network isolation, not the HMAC: the sarp-tickets bot
  container and sarp-tickets-web container share a private Docker network
  (`sarp-internal`); this route is bound to that network only and is never
  published to the host or routed through the Cloudflare Tunnel. The HMAC
  is defense-in-depth in case that network boundary is ever
  misconfigured.
- The `/data/tickets/{userId}.json` PUT is deleted outright — the website
  computes a user's ticket list live from the DB, so shipping a synced
  copy is redundant.
- `ticketShare.ts` shrinks to one function that PUTs the HTML to the
  internal route; `buildUserTicketsSharePayload` and the JSON PUT path are
  removed.

## Auth & access control

- NextAuth.js, Discord OAuth provider only.
- Scopes: `identify`, `guilds.members.read` — this returns the caller's
  guild member object (including roles) directly off their own OAuth
  token via `GET /users/@me/guilds/{guild_id}/member`, so the web app
  never needs a bot token.
- Role tier is **re-fetched from Discord on every protected page load**,
  not cached in the session — a demotion or role removal takes effect on
  the next request, not just the next login.
- Per-ticket access check (server-side, before any HTML is sent to the
  client):
  1. `ticket.opener_id === viewer.id` → allowed, any tier.
  2. viewer has `General_support_role` and `ticket.type === 'general'` →
     allowed.
  3. viewer's highest role position > `Supervisor_support_role`'s
     position → allowed (sees all tickets, any type).
  4. otherwise → `403`.
- `General_support_role` / `Supervisor_support_role` are read from the
  same per-guild config the bot already uses (`config.ts` /
  `ROLE_SETTING_KEYS`) via the read-only DB connection — not duplicated.

## Site structure (Next.js, TypeScript, React, Tailwind — App Router)

- `/` — Discord login gate; redirects logged-in users to `/tickets`.
- `/tickets` — the logged-in user's own tickets (any tier), links to each
  transcript.
- `/tickets/[id]` — single transcript view. Runs the access check above;
  renders the stored `transcript_html` inside a styled shell (transcript
  content itself stays as the HTML `discord-html-transcripts` produces —
  not reimplemented as React — but everything else on the page, nav,
  metadata, layout, is React/Tailwind).
- `/staff` — search/filter table over tickets. General support sees
  `type = 'general'` only; supervisor+ sees all. Requires one of those two
  role tiers; otherwise redirects to `/tickets`.

## Deployment

- New workspace package `sarp-tickets-web`, added to the root
  `package.json` `workspaces` array, own `.git` repo like the other three.
- Dockerfile + systemd `--user` service + deploy script, mirroring
  `sarp-tickets`'s existing pattern (`deploy-sarp-tickets.sh` as the
  template).
- Joins the `sarp-internal` Docker network alongside the `sarp-tickets`
  bot container for the internal write path.
- New Cloudflare Tunnel ingress rule + DNS record for
  `tickets.san-andreas-rp.co.uk`, following the same steps used for
  `webhook.san-andreas-rp.co.uk`.
- `djsko`'s release webhook deploy loop is untouched — this new service
  has no dependency on `djsko`, so it's not added to that redeploy list.

## Out of scope (YAGNI, revisit if actually needed)

- Rate limiting on top of Cloudflare's edge protections.
- Caching/CDN for transcript pages beyond Cloudflare's defaults.
- Any UI for editing tickets — this is read-only, viewing only.
