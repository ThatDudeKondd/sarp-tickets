# Tickets Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `sarp-tickets-web`, a Next.js site at `tickets.san-andreas-rp.co.uk`
where users log in with Discord to view their own ticket transcripts, general
support staff can search `general`-type tickets, and supervisor+ can search all
tickets — replacing the bot's current unauthenticated static-file PUT approach.

**Architecture:** New standalone workspace package. A small standalone Node
script (no framework, HMAC-authed, `127.0.0.1`-bound) receives transcript HTML
from the bot. The Next.js app reads ticket metadata straight from the existing
Postgres DB (read-only role, raw `pg` queries — no duplicated Prisma schema),
reads staff role IDs from a read-only bind-mount of the bot's `config.json`,
and resolves the viewer's Discord role tier via NextAuth (Discord OAuth) plus
one bot-token-authenticated call for role positions.

**Tech Stack:** TypeScript, Next.js (App Router), React, Tailwind CSS v4,
NextAuth v4 (Discord provider), `pg`, vitest, pm2.

**Spec:** `docs/superpowers/specs/2026-09-21-tickets-web-design.md`

## Global Constraints

- Node >=18 (matches `sarp-tickets`'s `engines`).
- `--network host` for the Docker container — the established pattern in this
  project (see `deploy-sarp-tickets.sh`); no bridge networks.
- The internal transcript-write listener binds `127.0.0.1` only and is never
  added to the Cloudflare Tunnel ingress config.
- Website DB user (`sarp_tickets_web_ro`) has `SELECT`-only grants — never
  reuse the bot's read-write credentials.
- Role tier must be re-derived from live Discord data on every protected page
  load — never cached in the session/JWT.
- No new UI component gets written before Task 9 (frontend-design pass) is
  complete and approved.

---

### Task 1: Scaffold the `sarp-tickets-web` package

**Files:**
- Create: `sarp-tickets-web/package.json`
- Create: `sarp-tickets-web/tsconfig.json`
- Create: `sarp-tickets-web/next.config.ts`
- Create: `sarp-tickets-web/postcss.config.mjs`
- Create: `sarp-tickets-web/src/app/layout.tsx`
- Create: `sarp-tickets-web/src/app/page.tsx`
- Create: `sarp-tickets-web/src/app/globals.css`
- Create: `sarp-tickets-web/.env.example`
- Create: `sarp-tickets-web/.gitignore`
- Modify: `package.json` (root) — add `"sarp-tickets-web"` to `workspaces`

**Interfaces:**
- Produces: a running `npm run dev --workspace=sarp-tickets-web` on port 3002
  (avoids colliding with `sarp-tickets`'s `DOMAIN=http://127.0.0.1:3000`
  convention), and `npm run build --workspace=sarp-tickets-web`.

- [ ] **Step 1: `git init` the new repo**

  ```bash
  mkdir sarp-tickets-web && cd sarp-tickets-web && git init
  ```

- [ ] **Step 2: Write `package.json`**

  ```json
  {
    "name": "sarp-tickets-web",
    "version": "1.0.0",
    "private": true,
    "engines": { "node": ">=18" },
    "scripts": {
      "dev": "next dev -p 3002",
      "build": "next build",
      "start": "next start -p 3002",
      "test": "vitest run",
      "test:watch": "vitest"
    },
    "dependencies": {
      "next": "^15.0.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "next-auth": "^4.24.7",
      "pg": "^8.22.0"
    },
    "devDependencies": {
      "@types/node": "^22.13.10",
      "@types/react": "^19.0.0",
      "@types/pg": "^8.11.0",
      "typescript": "^5.8.2",
      "vitest": "^4.1.9",
      "tailwindcss": "^4.0.0",
      "@tailwindcss/postcss": "^4.0.0"
    }
  }
  ```

- [ ] **Step 3: Write `tsconfig.json`**

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "preserve",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "incremental": true,
      "noEmit": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    "exclude": ["node_modules"]
  }
  ```

- [ ] **Step 4: Write `postcss.config.mjs`**

  ```js
  export default {
    plugins: { '@tailwindcss/postcss': {} },
  };
  ```

- [ ] **Step 5: Write `src/app/globals.css`**

  ```css
  @import "tailwindcss";
  ```

- [ ] **Step 6: Write minimal `src/app/layout.tsx` and `src/app/page.tsx`**

  ```tsx
  // src/app/layout.tsx
  import './globals.css';

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }
  ```

  ```tsx
  // src/app/page.tsx
  export default function HomePage() {
    return <main>sarp-tickets-web placeholder</main>;
  }
  ```

- [ ] **Step 7: Write `.env.example`**

  ```
  DATABASE_URL="postgresql://sarp_tickets_web_ro:password@localhost:5432/sarp_tickets"
  CONFIG_JSON_PATH=/app/config.json
  DISCORD_CLIENT_ID=
  DISCORD_CLIENT_SECRET=
  DISCORD_BOT_TOKEN=
  DISCORD_GUILD_ID=
  AUTH_SECRET=
  INTERNAL_TRANSCRIPT_SECRET=
  NEXTAUTH_URL=https://tickets.san-andreas-rp.co.uk
  ```

- [ ] **Step 8: Write `.gitignore`**

  ```
  node_modules
  .next
  .env
  ```

- [ ] **Step 9: Add to root workspaces**

  In `package.json` (repo root, `SARP-project/package.json`), add
  `"sarp-tickets-web"` to the `workspaces` array.

- [ ] **Step 10: Install and verify it builds**

  ```bash
  npm install
  npm run build --workspace=sarp-tickets-web
  ```

  Expected: build succeeds, `.next/` produced, no type errors.

- [ ] **Step 11: Commit**

  ```bash
  cd sarp-tickets-web
  git add -A
  git commit -m "Scaffold sarp-tickets-web Next.js app"
  cd ..
  git add package.json
  git commit -m "Add sarp-tickets-web to npm workspaces"
  ```

---

### Task 2: Database migration — `transcript_html` column + read-only role

**Files:**
- Modify: `sarp-tickets/prisma/schema.prisma` (add `transcript_html` to `Ticket`)
- Create: `sarp-tickets/prisma/migrations/<timestamp>_add_transcript_html/migration.sql` (generated)
- Create: `sarp-tickets-web/db/001_readonly_role.sql`

**Interfaces:**
- Produces: `tickets.transcript_html` column (nullable text), and a
  `sarp_tickets_web_ro` Postgres role with `SELECT` on `tickets` and
  `claim_history`.

- [ ] **Step 1: Add the column to the Prisma schema**

  In `sarp-tickets/prisma/schema.prisma`, in `model Ticket`, add:

  ```prisma
  transcript_html String?
  ```

  (Right after `control_message_id`, matching the existing field grouping.)

- [ ] **Step 2: Generate and apply the migration**

  ```bash
  cd sarp-tickets
  npx prisma migrate dev --name add_transcript_html
  ```

  Expected: a new `migrations/<timestamp>_add_transcript_html/migration.sql`
  containing `ALTER TABLE "tickets" ADD COLUMN "transcript_html" TEXT;`, and
  the local dev DB now has the column (`\d tickets` in `psql` shows it).

- [ ] **Step 3: Write the read-only role SQL**

  ```sql
  -- sarp-tickets-web/db/001_readonly_role.sql
  -- Run manually against the sarp_tickets database (not part of Prisma's
  -- migration history — this role belongs to the website, not the bot).
  CREATE ROLE sarp_tickets_web_ro WITH LOGIN PASSWORD 'CHANGE_ME';
  GRANT CONNECT ON DATABASE sarp_tickets TO sarp_tickets_web_ro;
  GRANT USAGE ON SCHEMA public TO sarp_tickets_web_ro;
  GRANT SELECT ON tickets, claim_history TO sarp_tickets_web_ro;
  -- Future columns/tables this role should see must be granted explicitly —
  -- deliberately no default-privileges grant, so new tables stay hidden
  -- unless someone opts them in.
  ```

- [ ] **Step 4: Apply it to the local dev DB and verify**

  ```bash
  psql "$DATABASE_URL" -f sarp-tickets-web/db/001_readonly_role.sql
  psql "postgresql://sarp_tickets_web_ro:CHANGE_ME@localhost:5432/sarp_tickets" \
    -c "SELECT id, transcript_html FROM tickets LIMIT 1;"
  ```

  Expected: query succeeds (empty result if no rows yet is fine); a write
  attempt (`UPDATE tickets SET reason = 'x'`) with that role fails with a
  permission error — confirms read-only.

- [ ] **Step 5: Commit**

  ```bash
  cd sarp-tickets
  git add prisma/schema.prisma prisma/migrations
  git commit -m "Add transcript_html column to tickets table"
  cd ../sarp-tickets-web
  git add db/001_readonly_role.sql
  git commit -m "Add read-only DB role SQL for sarp-tickets-web"
  ```

---

### Task 3: Access-control decision logic (TDD)

**Files:**
- Create: `sarp-tickets-web/src/lib/access.ts`
- Test: `sarp-tickets-web/src/lib/access.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no I/O).
- Produces: `canViewTranscript(viewer, ticket): boolean`, used by Task 11's
  `/tickets/[id]` page and Task 12's `/staff` search filter.

  ```ts
  export type ViewerTier = 'member' | 'general_support' | 'supervisor_plus';

  export interface Viewer {
    discordId: string;
    tier: ViewerTier;
  }

  export interface TicketAccessInfo {
    opener_id: string;
    type: 'general' | 'supervisor';
  }
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  // src/lib/access.test.ts
  import { describe, it, expect } from 'vitest';
  import { canViewTranscript } from './access';

  describe('canViewTranscript', () => {
    it('allows the ticket opener regardless of tier', () => {
      const viewer = { discordId: 'u1', tier: 'member' as const };
      expect(canViewTranscript(viewer, { opener_id: 'u1', type: 'supervisor' })).toBe(true);
    });

    it('denies a member viewing someone else\'s ticket', () => {
      const viewer = { discordId: 'u1', tier: 'member' as const };
      expect(canViewTranscript(viewer, { opener_id: 'u2', type: 'general' })).toBe(false);
    });

    it('allows general_support on a general ticket they did not open', () => {
      const viewer = { discordId: 'staff1', tier: 'general_support' as const };
      expect(canViewTranscript(viewer, { opener_id: 'u2', type: 'general' })).toBe(true);
    });

    it('denies general_support on a supervisor ticket they did not open', () => {
      const viewer = { discordId: 'staff1', tier: 'general_support' as const };
      expect(canViewTranscript(viewer, { opener_id: 'u2', type: 'supervisor' })).toBe(false);
    });

    it('allows supervisor_plus on any ticket', () => {
      const viewer = { discordId: 'sup1', tier: 'supervisor_plus' as const };
      expect(canViewTranscript(viewer, { opener_id: 'u2', type: 'supervisor' })).toBe(true);
      expect(canViewTranscript(viewer, { opener_id: 'u3', type: 'general' })).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  npx vitest run src/lib/access.test.ts
  ```

  Expected: FAIL — `access.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

  ```ts
  // src/lib/access.ts
  export type ViewerTier = 'member' | 'general_support' | 'supervisor_plus';

  export interface Viewer {
    discordId: string;
    tier: ViewerTier;
  }

  export interface TicketAccessInfo {
    opener_id: string;
    type: 'general' | 'supervisor';
  }

  export function canViewTranscript(viewer: Viewer, ticket: TicketAccessInfo): boolean {
    if (viewer.discordId === ticket.opener_id) return true;
    if (viewer.tier === 'supervisor_plus') return true;
    if (viewer.tier === 'general_support' && ticket.type === 'general') return true;
    return false;
  }
  ```

- [ ] **Step 4: Run to verify it passes**

  ```bash
  npx vitest run src/lib/access.test.ts
  ```

  Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/access.ts src/lib/access.test.ts
  git commit -m "Add ticket transcript access-control logic"
  ```

---

### Task 4: Discord role/tier resolution (TDD)

**Files:**
- Create: `sarp-tickets-web/src/lib/roles.ts`
- Test: `sarp-tickets-web/src/lib/roles.test.ts`

**Interfaces:**
- Consumes: `ViewerTier` from Task 3 (`src/lib/access.ts`).
- Produces: `resolveTier(input): ViewerTier` (pure), and
  `fetchGuildRoles(guildId, botToken): Promise<DiscordRole[]>` (impure,
  isolated so `resolveTier` stays testable without network access). Task 8
  (NextAuth session callback) calls both.

  ```ts
  export interface DiscordRole { id: string; position: number; }
  ```

- [ ] **Step 1: Write failing tests for the pure function**

  ```ts
  // src/lib/roles.test.ts
  import { describe, it, expect } from 'vitest';
  import { resolveTier, type DiscordRole } from './roles';

  const guildRoles: DiscordRole[] = [
    { id: 'everyone', position: 0 },
    { id: 'general_support_role', position: 5 },
    { id: 'supervisor_role', position: 10 },
    { id: 'admin_role', position: 20 },
  ];

  describe('resolveTier', () => {
    it('returns member when the viewer has neither staff role nor anything above supervisor', () => {
      const tier = resolveTier({
        memberRoleIds: ['everyone'],
        guildRoles,
        generalSupportRoleId: 'general_support_role',
        supervisorRoleId: 'supervisor_role',
      });
      expect(tier).toBe('member');
    });

    it('returns general_support for the configured general support role', () => {
      const tier = resolveTier({
        memberRoleIds: ['everyone', 'general_support_role'],
        guildRoles,
        generalSupportRoleId: 'general_support_role',
        supervisorRoleId: 'supervisor_role',
      });
      expect(tier).toBe('general_support');
    });

    it('returns supervisor_plus for the supervisor role itself', () => {
      const tier = resolveTier({
        memberRoleIds: ['supervisor_role'],
        guildRoles,
        generalSupportRoleId: 'general_support_role',
        supervisorRoleId: 'supervisor_role',
      });
      expect(tier).toBe('supervisor_plus');
    });

    it('returns supervisor_plus for a role positioned above supervisor', () => {
      const tier = resolveTier({
        memberRoleIds: ['admin_role'],
        guildRoles,
        generalSupportRoleId: 'general_support_role',
        supervisorRoleId: 'supervisor_role',
      });
      expect(tier).toBe('supervisor_plus');
    });

    it('prefers supervisor_plus over general_support when the viewer has both', () => {
      const tier = resolveTier({
        memberRoleIds: ['general_support_role', 'admin_role'],
        guildRoles,
        generalSupportRoleId: 'general_support_role',
        supervisorRoleId: 'supervisor_role',
      });
      expect(tier).toBe('supervisor_plus');
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  npx vitest run src/lib/roles.test.ts
  ```

  Expected: FAIL — `roles.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

  ```ts
  // src/lib/roles.ts
  import type { ViewerTier } from './access';

  export interface DiscordRole {
    id: string;
    position: number;
  }

  export function resolveTier(input: {
    memberRoleIds: string[];
    guildRoles: DiscordRole[];
    generalSupportRoleId: string;
    supervisorRoleId: string;
  }): ViewerTier {
    const { memberRoleIds, guildRoles, generalSupportRoleId, supervisorRoleId } = input;
    const supervisorRole = guildRoles.find((r) => r.id === supervisorRoleId);
    const supervisorPosition = supervisorRole?.position ?? Infinity;

    const memberRoles = guildRoles.filter((r) => memberRoleIds.includes(r.id));
    const highestPosition = Math.max(0, ...memberRoles.map((r) => r.position));

    if (memberRoleIds.includes(supervisorRoleId) || highestPosition > supervisorPosition) {
      return 'supervisor_plus';
    }
    if (memberRoleIds.includes(generalSupportRoleId)) {
      return 'general_support';
    }
    return 'member';
  }

  const DISCORD_API = 'https://discord.com/api/v10';

  export async function fetchGuildRoles(guildId: string, botToken: string): Promise<DiscordRole[]> {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) {
      throw new Error(`Discord guild roles fetch failed: ${res.status}`);
    }
    return res.json();
  }
  ```

- [ ] **Step 4: Run to verify it passes**

  ```bash
  npx vitest run src/lib/roles.test.ts
  ```

  Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/roles.ts src/lib/roles.test.ts
  git commit -m "Add Discord role/tier resolution logic"
  ```

---

### Task 5: Config.json reader

**Files:**
- Create: `sarp-tickets-web/src/lib/config.ts`
- Test: `sarp-tickets-web/src/lib/config.test.ts`

**Interfaces:**
- Consumes: `CONFIG_JSON_PATH` env var.
- Produces: `readStaffRoleIds(): { generalSupportRoleId: string; supervisorRoleId: string }`,
  used by Task 8's NextAuth session callback.

- [ ] **Step 1: Write a failing test using a temp file**

  ```ts
  // src/lib/config.test.ts
  import { describe, it, expect, afterEach } from 'vitest';
  import { writeFileSync, rmSync } from 'node:fs';
  import { readStaffRoleIds } from './config';

  const TMP_PATH = '/tmp/sarp-tickets-web-config-test.json';

  afterEach(() => rmSync(TMP_PATH, { force: true }));

  describe('readStaffRoleIds', () => {
    it('reads the two configured role IDs from the config file', () => {
      writeFileSync(
        TMP_PATH,
        JSON.stringify({
          General_support_role: 'gs-id',
          Supervisor_support_role: 'sup-id',
          Other_unrelated_key: 'ignored',
        }),
      );
      expect(readStaffRoleIds(TMP_PATH)).toEqual({
        generalSupportRoleId: 'gs-id',
        supervisorRoleId: 'sup-id',
      });
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  npx vitest run src/lib/config.test.ts
  ```

  Expected: FAIL — `config.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

  ```ts
  // src/lib/config.ts
  import { readFileSync } from 'node:fs';

  export function readStaffRoleIds(path = process.env.CONFIG_JSON_PATH ?? '/app/config.json') {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return {
      generalSupportRoleId: String(raw.General_support_role ?? ''),
      supervisorRoleId: String(raw.Supervisor_support_role ?? ''),
    };
  }
  ```

- [ ] **Step 4: Run to verify it passes**

  ```bash
  npx vitest run src/lib/config.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/config.ts src/lib/config.test.ts
  git commit -m "Add config.json reader for staff role IDs"
  ```

---

### Task 6: Internal transcript-write server (TDD signature check)

**Files:**
- Create: `sarp-tickets-web/internal-transcript-server.cjs`
- Test: `sarp-tickets-web/internal-transcript-server.test.cjs`
- Create: `sarp-tickets-web/src/lib/db.ts` (write path used by the server)

**Interfaces:**
- Consumes: `DATABASE_URL`, `INTERNAL_TRANSCRIPT_SECRET` env vars.
- Produces: `PUT http://127.0.0.1:4001/internal/transcripts/:ticketId` — Task 7
  (bot's `ticketShare.ts`) is the only caller.

- [ ] **Step 1: Write failing test for the signature verifier**

  Extract `verifySignature` as an exported, independently testable function
  (same shape as `webhook-server.cjs`'s, which has no test today — this one
  gets one since it's new).

  ```js
  // internal-transcript-server.test.cjs
  const { test } = require('node:test');
  const assert = require('node:assert/strict');
  const crypto = require('node:crypto');
  const { verifySignature } = require('./internal-transcript-server.cjs');

  test('accepts a correctly-signed payload', () => {
    const secret = 'test-secret';
    const body = Buffer.from('<html>transcript</html>');
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    assert.equal(verifySignature(body, sig, secret), true);
  });

  test('rejects a bad signature', () => {
    assert.equal(verifySignature(Buffer.from('x'), 'sha256=deadbeef', 'test-secret'), false);
  });

  test('rejects a missing signature', () => {
    assert.equal(verifySignature(Buffer.from('x'), undefined, 'test-secret'), false);
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  node --test internal-transcript-server.test.cjs
  ```

  Expected: FAIL — file doesn't exist yet.

- [ ] **Step 3: Implement the server**

  ```js
  #!/usr/bin/env node
  // internal-transcript-server.cjs
  const http = require('node:http');
  const crypto = require('node:crypto');
  const { Pool } = require('pg');

  const PORT = 4001;
  const SECRET = process.env.INTERNAL_TRANSCRIPT_SECRET;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  if (!SECRET) {
    console.error('INTERNAL_TRANSCRIPT_SECRET not set, exiting.');
    process.exit(1);
  }

  function verifySignature(payload, signatureHeader, secret) {
    if (!signatureHeader) return false;
    const digest = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  const server = http.createServer((req, res) => {
    const match = req.url.match(/^\/internal\/transcripts\/(\d+)$/);
    if (req.method !== 'PUT' || !match) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ticketId = Number(match[1]);

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks);
      if (!verifySignature(raw, req.headers['x-signature-256'], SECRET)) {
        console.log(`[${new Date().toISOString()}] Rejected: bad signature for ticket ${ticketId}`);
        res.writeHead(401);
        return res.end('Invalid signature');
      }
      try {
        await pool.query('UPDATE tickets SET transcript_html = $1 WHERE id = $2', [
          raw.toString('utf8'),
          ticketId,
        ]);
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        console.error(`Failed to store transcript for ticket ${ticketId}:`, err);
        res.writeHead(500);
        res.end('Storage error');
      }
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Internal transcript server listening on 127.0.0.1:${PORT}`);
  });

  module.exports = { verifySignature };
  ```

  Note: this DB write needs a role with `UPDATE` on `tickets.transcript_html`,
  which is different from the website's own `sarp_tickets_web_ro` read role —
  this script runs with its own write-capable connection string
  (`DATABASE_URL` here is intentionally *not* the `_ro` role; name it
  distinctly in the real `.env`, e.g. `TRANSCRIPT_WRITER_DATABASE_URL`, to
  avoid ever confusing the two).

- [ ] **Step 4: Run to verify it passes**

  ```bash
  node --test internal-transcript-server.test.cjs
  ```

  Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

  ```bash
  git add internal-transcript-server.cjs internal-transcript-server.test.cjs
  git commit -m "Add internal transcript-write server"
  ```

---

### Task 7: Update the bot to sign and PUT transcripts to the new endpoint

**Files:**
- Modify: `sarp-tickets/src/services/ticketShare.ts`
- Modify: `sarp-tickets/.env.example` (add `INTERNAL_TRANSCRIPT_SECRET`, `INTERNAL_TRANSCRIPT_URL`)

**Interfaces:**
- Consumes: nothing new exported — `shareTicketTranscript(openerId, ticketId, html)`
  keeps its existing call sites in `close.ts` unchanged.
- Produces: same function signature as before; `shareTicketData`,
  `shareTicketDataFireAndForget`, and `buildUserTicketsSharePayload` are
  deleted (their only caller, `interactions.ts:436`, is updated in this task
  too).

- [ ] **Step 1: Rewrite `ticketShare.ts`**

  Replace the whole file with just the transcript-share path, HMAC-signed:

  ```ts
  import crypto from 'node:crypto';

  const INTERNAL_TRANSCRIPT_URL =
    process.env.INTERNAL_TRANSCRIPT_URL ?? 'http://127.0.0.1:4001';
  const SECRET = process.env.INTERNAL_TRANSCRIPT_SECRET;

  function sign(body: string): string {
    if (!SECRET) throw new Error('INTERNAL_TRANSCRIPT_SECRET not set');
    return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  }

  /** Sends the closed ticket's HTML transcript to sarp-tickets-web for storage. */
  export async function shareTicketTranscript(
    openerId: string,
    ticketId: number,
    html: string,
  ): Promise<void> {
    const url = `${INTERNAL_TRANSCRIPT_URL}/internal/transcripts/${ticketId}`;
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Signature-256': sign(html),
        },
        body: html,
      });
      if (!res.ok) {
        console.error(`Transcript share failed (${res.status}) for ticket ${ticketId}`);
      }
    } catch (err) {
      console.error(`Transcript share error for ticket ${ticketId}:`, err);
    }
  }
  ```

  Note: `openerId` is now unused by this function (the URL is keyed by
  ticket ID only, since access is enforced by the website itself rather than
  encoded in a file path) — keep the parameter for call-site compatibility
  with `close.ts:55`, or update that call site in the same step if you'd
  rather drop it. Prefer dropping it — one less unused parameter:

  ```ts
  export async function shareTicketTranscript(ticketId: number, html: string): Promise<void>
  ```

  and update `sarp-tickets/src/services/close.ts:55` from
  `shareTicketTranscript(closed.opener_id, closed.id, html)` to
  `shareTicketTranscript(closed.id, html)`.

- [ ] **Step 2: Remove the JSON-sync call site**

  In `sarp-tickets/src/services/close.ts:56`, delete the
  `shareTicketData(closed, channel.name, channel.client)` line.

  In `sarp-tickets/src/events/interactions.ts`, delete the
  `shareTicketDataFireAndForget(fresh, updated.name, interaction.client)`
  call at line 436 and its now-unused import at line 36.

- [ ] **Step 3: Update `.env.example`**

  Add to `sarp-tickets/.env.example`:

  ```
  INTERNAL_TRANSCRIPT_URL=http://127.0.0.1:4001
  INTERNAL_TRANSCRIPT_SECRET=
  ```

  Remove the now-unused `DOMAIN=http://127.0.0.1:3000` line (nothing reads
  `env.domain` anymore — confirm with a repo-wide grep for `env.domain`
  before deleting the `domain` field from `config.ts` itself).

- [ ] **Step 4: Grep for remaining references and clean up `config.ts`**

  ```bash
  grep -rn "env.domain\|shareTicketData\b\|buildUserTicketsSharePayload" sarp-tickets/src
  ```

  Expected: no matches outside `ticketShare.ts` itself. Remove the `domain`
  field from `BotConfig`/`env` in `sarp-tickets/src/config.ts` if this
  confirms it's dead.

- [ ] **Step 5: Build to confirm no type errors**

  ```bash
  cd sarp-tickets
  npm run build
  ```

  Expected: succeeds, no references to deleted exports remain.

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/ticketShare.ts src/services/close.ts src/events/interactions.ts src/config.ts .env.example
  git commit -m "Replace unauthenticated transcript PUT with signed internal call"
  ```

---

### Task 8: Read queries for ticket listing/search

**Files:**
- Create: `sarp-tickets-web/src/lib/tickets.ts`

**Interfaces:**
- Consumes: `pg` `Pool` connected via `DATABASE_URL` (the `_ro` role).
- Produces: `getOwnTickets(discordId)`, `searchTickets(filter)`,
  `getTicketById(id)` — used by Task 10 (NextAuth isn't involved here) and
  Task 11 (pages).

  ```ts
  export interface TicketSummary {
    id: number;
    opener_id: string;
    type: 'general' | 'supervisor';
    status: 'open' | 'closed';
    reason: string;
    opened_at: number;
    closed_at: number | null;
  }
  ```

- [ ] **Step 1: Implement the query module**

  No TDD here — this is a thin, low-branching pass-through over `pg`; a
  test would just re-assert the SQL string. Manual verification (Step 2)
  covers it instead.

  ```ts
  // src/lib/tickets.ts
  import { Pool } from 'pg';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  export interface TicketSummary {
    id: number;
    opener_id: string;
    type: 'general' | 'supervisor';
    status: 'open' | 'closed';
    reason: string;
    opened_at: number;
    closed_at: number | null;
  }

  function toSummary(row: any): TicketSummary {
    return {
      id: row.id,
      opener_id: row.opener_id,
      type: row.type,
      status: row.status,
      reason: row.reason,
      opened_at: Number(row.opened_at),
      closed_at: row.closed_at === null ? null : Number(row.closed_at),
    };
  }

  export async function getOwnTickets(discordId: string): Promise<TicketSummary[]> {
    const { rows } = await pool.query(
      'SELECT id, opener_id, type, status, reason, opened_at, closed_at FROM tickets WHERE opener_id = $1 ORDER BY opened_at DESC',
      [discordId],
    );
    return rows.map(toSummary);
  }

  export async function searchTickets(filter: {
    type?: 'general' | 'supervisor';
    query?: string;
  }): Promise<TicketSummary[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      params.push(filter.type);
      conditions.push(`type = $${params.length}`);
    }
    if (filter.query) {
      params.push(`%${filter.query}%`);
      conditions.push(`(reason ILIKE $${params.length} OR opener_id = ${filter.query.match(/^\d+$/) ? `$${params.length}` : 'NULL'})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, opener_id, type, status, reason, opened_at, closed_at FROM tickets ${where} ORDER BY opened_at DESC LIMIT 200`,
      params,
    );
    return rows.map(toSummary);
  }

  export async function getTicketById(
    id: number,
  ): Promise<(TicketSummary & { transcript_html: string | null }) | null> {
    const { rows } = await pool.query(
      'SELECT id, opener_id, type, status, reason, opened_at, closed_at, transcript_html FROM tickets WHERE id = $1',
      [id],
    );
    if (!rows[0]) return null;
    return { ...toSummary(rows[0]), transcript_html: rows[0].transcript_html };
  }
  ```

- [ ] **Step 2: Manually verify against the local dev DB**

  ```bash
  DATABASE_URL="postgresql://sarp_tickets_web_ro:CHANGE_ME@localhost:5432/sarp_tickets" \
    node -e "require('./src/lib/tickets.ts')" # or a quick tsx one-liner calling getOwnTickets with a known opener_id
  ```

  Expected: returns an array matching what `psql` shows for that user.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/tickets.ts
  git commit -m "Add read-only ticket listing/search queries"
  ```

---

### Task 9: NextAuth setup with Discord OAuth + tier resolution

**Files:**
- Create: `sarp-tickets-web/src/lib/auth.ts`
- Create: `sarp-tickets-web/src/app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Consumes: `resolveTier`/`fetchGuildRoles` (Task 4), `readStaffRoleIds` (Task 5).
- Produces: `auth()` helper returning `{ user: { id, tier } } | null`, used by
  every protected page in Task 11.

- [ ] **Step 1: Implement the NextAuth config**

  ```ts
  // src/lib/auth.ts
  import NextAuth from 'next-auth';
  import Discord from 'next-auth/providers/discord';
  import { resolveTier, fetchGuildRoles } from './roles';
  import { readStaffRoleIds } from './config';

  const GUILD_ID = process.env.DISCORD_GUILD_ID!;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

  let roleCache: { roles: Awaited<ReturnType<typeof fetchGuildRoles>>; fetchedAt: number } | null = null;
  const ROLE_CACHE_MS = 5 * 60 * 1000;

  async function getGuildRoles() {
    if (roleCache && Date.now() - roleCache.fetchedAt < ROLE_CACHE_MS) {
      return roleCache.roles;
    }
    const roles = await fetchGuildRoles(GUILD_ID, BOT_TOKEN);
    roleCache = { roles, fetchedAt: Date.now() };
    return roles;
  }

  export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
      Discord({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        authorization: { params: { scope: 'identify guilds.members.read' } },
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        if (account?.access_token) token.discordAccessToken = account.access_token;
        return token;
      },
      async session({ session, token }) {
        const memberRes = await fetch(
          `https://discord.com/api/v10/users/@me/guilds/${GUILD_ID}/member`,
          { headers: { Authorization: `Bearer ${token.discordAccessToken}` } },
        );
        const memberRoleIds: string[] = memberRes.ok ? (await memberRes.json()).roles : [];
        const guildRoles = await getGuildRoles();
        const { generalSupportRoleId, supervisorRoleId } = readStaffRoleIds();
        const tier = resolveTier({ memberRoleIds, guildRoles, generalSupportRoleId, supervisorRoleId });
        session.user.tier = tier;
        return session;
      },
    },
  });
  ```

  ```ts
  // src/app/api/auth/[...nextauth]/route.ts
  import { handlers } from '@/lib/auth';
  export const { GET, POST } = handlers;
  ```

- [ ] **Step 2: Extend the session type**

  ```ts
  // src/lib/next-auth.d.ts
  import type { ViewerTier } from './access';

  declare module 'next-auth' {
    interface Session {
      user: { id: string; name?: string | null; image?: string | null; tier: ViewerTier };
    }
  }

  declare module 'next-auth/jwt' {
    interface JWT {
      discordAccessToken?: string;
    }
  }
  ```

- [ ] **Step 3: Manual verification**

  Run `npm run dev --workspace=sarp-tickets-web`, visit `/api/auth/signin`,
  complete the Discord OAuth flow with a real test account in the guild, and
  confirm `session.user.tier` is one of the three expected values by
  temporarily logging it in the `session` callback.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/auth.ts src/lib/next-auth.d.ts src/app/api/auth
  git commit -m "Add NextAuth Discord OAuth with role-tier resolution"
  ```

---

### Task 10: Frontend design pass (gate — no page UI before this)

This is a process task, not a code task — do not write any page/component
code until it's complete.

- [ ] **Step 1: Invoke the `frontend-design` skill**

  Run it against this project's context: a Discord-community ticket
  transcript viewer with three surfaces (login gate, personal ticket list,
  single transcript view, staff search table). Ask the user (via the skill's
  own process) for any brand/style inputs it needs (colors, tone, reference
  sites) — per the user's instruction, surface exactly what's needed and no
  more.

- [ ] **Step 2: Capture the output as a reusable reference**

  Save whatever the skill produces (design tokens, Tailwind theme values,
  component patterns) to `sarp-tickets-web/docs/design-direction.md` so
  Task 11's page-building steps have a concrete style to implement against
  instead of improvising.

- [ ] **Step 3: Commit**

  ```bash
  git add docs/design-direction.md
  git commit -m "Add frontend design direction for tickets-web"
  ```

---

### Task 11: Pages

**Files:**
- Create: `sarp-tickets-web/src/app/page.tsx` (overwrite Task 1's placeholder)
- Create: `sarp-tickets-web/src/app/tickets/page.tsx`
- Create: `sarp-tickets-web/src/app/tickets/[id]/page.tsx`
- Create: `sarp-tickets-web/src/app/staff/page.tsx`

**Interfaces:**
- Consumes: `auth()` (Task 9), `getOwnTickets`/`searchTickets`/`getTicketById`
  (Task 8), `canViewTranscript` (Task 3), the design direction (Task 10).

No TDD here (App Router server components; verification is manual browser
checks per step) — apply Task 10's design direction throughout.

- [ ] **Step 1: `/` login gate**

  Server component: if `await auth()` returns a session, redirect to
  `/tickets`; otherwise render a "Log in with Discord" button posting to
  the NextAuth sign-in route. Styled per Task 10's direction.

- [ ] **Step 2: `/tickets` own list**

  Server component: `const session = await auth()`; if none, redirect to
  `/`. Call `getOwnTickets(session.user.id)`, render a table/list linking
  each row to `/tickets/${id}`.

- [ ] **Step 3: `/tickets/[id]` transcript view**

  Server component: load session (redirect to `/` if none), call
  `getTicketById(params.id)` (404 page if not found), run
  `canViewTranscript({ discordId: session.user.id, tier: session.user.tier }, ticket)`
  — render a 403 page if false. If allowed and `transcript_html` is set,
  render it inside an `<iframe sandbox="allow-same-origin" srcDoc={html} />`
  (sandboxed so the untrusted stored HTML can't run scripts against the
  parent page) wrapped in the site's own header/nav chrome. If
  `transcript_html` is null (ticket still open), show a "not closed yet"
  message instead.

- [ ] **Step 4: `/staff` search**

  Server component: load session, redirect to `/tickets` if
  `tier === 'member'`. Build the filter passed to `searchTickets` from tier
  (`general_support` forces `type: 'general'`) plus query params for a
  search box (client component for the input, server action or route handler
  for the actual query — keep it simple: a form that GETs `/staff?q=...`).

- [ ] **Step 5: Manual verification**

  `npm run dev --workspace=sarp-tickets-web`; walk through as a member
  account (sees only own tickets, 403 on someone else's `/tickets/[id]`
  URL), a general-support account (sees `/staff` filtered to `general`), and
  a supervisor+ account (sees everything on `/staff`).

- [ ] **Step 6: Commit**

  ```bash
  git add src/app
  git commit -m "Add login, own-tickets, transcript, and staff search pages"
  ```

---

### Task 12: Dockerfile + pm2 ecosystem

**Files:**
- Create: `sarp-tickets-web/Dockerfile`
- Create: `sarp-tickets-web/ecosystem.config.js`

- [ ] **Step 1: Write `ecosystem.config.js`**

  ```js
  module.exports = {
    apps: [
      {
        name: 'sarp-tickets-web',
        script: 'node_modules/.bin/next',
        args: 'start -p 3002',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 5000,
      },
      {
        name: 'sarp-tickets-web-internal',
        script: 'internal-transcript-server.cjs',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_restarts: 10,
        restart_delay: 5000,
      },
    ],
  };
  ```

- [ ] **Step 2: Write `Dockerfile`**

  ```dockerfile
  # sarp-tickets-web has no workspace siblings to depend on -- build context
  # is this directory alone, unlike sarp-tickets/djsko.
  FROM node:22-alpine AS builder
  WORKDIR /app
  COPY package.json package-lock.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM node:22-alpine
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=builder /app /app
  CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
  ```

  Add `pm2` to `dependencies` in `package.json` (Task 1) — currently missing
  from that list; add `"pm2": "^7.0.4"` there now.

- [ ] **Step 3: Build and smoke-test the image locally**

  ```bash
  cd sarp-tickets-web
  docker build -t sarp-tickets-web:latest .
  docker run --rm --network host --env-file .env sarp-tickets-web:latest
  ```

  Expected: both pm2 apps start; `curl http://127.0.0.1:3002` returns the
  login page; `curl -X PUT http://127.0.0.1:4001/internal/transcripts/1`
  (no signature) returns 401.

- [ ] **Step 4: Commit**

  ```bash
  git add Dockerfile ecosystem.config.js package.json
  git commit -m "Add Dockerfile and pm2 ecosystem for sarp-tickets-web"
  ```

---

### Task 13: Deploy script, webhook registration, tunnel + DNS

**Files:**
- Create: `sarp-tickets-web/deploy-sarp-tickets-web.sh`
- Modify: `sarp-utilities/webhook-server.cjs` (register the new repo)

**Interfaces:**
- Produces: a fourth entry in `DEPLOY_SCRIPTS`, a new Cloudflare Tunnel
  ingress rule, and a GitHub webhook for `sarp-tickets-web` pointed at the
  already-working `https://webhook.san-andreas-rp.co.uk/webhook`.

- [ ] **Step 1: Write the deploy script**

  Mirror `sarp-tickets/deploy-sarp-tickets.sh` exactly, minus the `djsko`
  loop (this repo has no shared-package dependency):

  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"

  LOCKFILE="/tmp/sarp-tickets-web-deploy.lock"
  exec 200>"$LOCKFILE"
  if ! flock -n 200; then
    echo "Another deploy is already running, skipping."
    exit 0
  fi

  ROOT_DIR="/opt/sarp-project"
  APP_DIR="$ROOT_DIR/sarp-tickets-web"
  BRANCH="main"

  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/"$BRANCH")
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo "No changes, nothing to deploy."
    exit 0
  fi
  git pull origin "$BRANCH"

  docker build -f "$APP_DIR/Dockerfile" -t sarp-tickets-web:latest "$APP_DIR"
  systemctl --user restart sarp-tickets-web.service
  echo "Deploy complete."
  ```

- [ ] **Step 2: Register the repo in the webhook receiver**

  In `sarp-utilities/webhook-server.cjs`, add to `DEPLOY_SCRIPTS`:

  ```js
  "ThatDudeKondd/sarp-tickets-web": ["/opt/sarp-project/sarp-tickets-web/deploy-sarp-tickets-web.sh"],
  ```

- [ ] **Step 3: Push the new repo to GitHub, create the webhook**

  ```bash
  gh repo create ThatDudeKondd/sarp-tickets-web --private --source=. --push
  gh api -X POST repos/ThatDudeKondd/sarp-tickets-web/hooks \
    -f name=web -F active=true \
    -f events[]=push \
    -f config[url]=https://webhook.san-andreas-rp.co.uk/webhook \
    -f config[content_type]=json \
    -f config[secret]="$WEBHOOK_SECRET"
  ```

  (`$WEBHOOK_SECRET` = the same value already in `sarp-utilities/.env` on
  the server — set it in this shell from there, don't hardcode it.)

- [ ] **Step 4: Add the Cloudflare Tunnel ingress rule + DNS record**

  On the server, edit the `sarp-webhook`/`sarp-tunnel` tunnel's config to add:

  ```yaml
  - hostname: tickets.san-andreas-rp.co.uk
    service: http://127.0.0.1:3002
  ```

  then `systemctl --user restart sarp-tunnel.service`, and in Cloudflare DNS
  add a CNAME for `tickets` → `<tunnel-id>.cfargotunnel.com` (proxied),
  matching how `webhook.san-andreas-rp.co.uk` was set up.

- [ ] **Step 5: Manual verification**

  ```bash
  gh api -X POST repos/ThatDudeKondd/sarp-tickets-web/hooks/<id>/pings
  gh api repos/ThatDudeKondd/sarp-tickets-web/hooks/<id> \
    --jq '.last_response'
  curl -I https://tickets.san-andreas-rp.co.uk
  ```

  Expected: webhook ping `200`, site responds `200`/redirect to login.

- [ ] **Step 6: Commit**

  ```bash
  cd sarp-tickets-web
  git add deploy-sarp-tickets-web.sh
  git commit -m "Add deploy script for sarp-tickets-web"
  cd ../sarp-utilities
  git add webhook-server.cjs
  git commit -m "Register sarp-tickets-web in webhook deploy map"
  git push
  cd ../sarp-tickets-web
  git push
  ```

---

## Post-plan checklist (not a task — sanity check before calling this done)

- [ ] All five `sarp-tickets-web` env vars from the spec are set on the
      server's real `.env` (not just `.env.example`).
- [ ] `sarp_tickets_web_ro` password in the real `.env` differs from the
      placeholder in `db/001_readonly_role.sql`.
- [ ] End-to-end: close a real test ticket in Discord, confirm its
      transcript appears at `/tickets/[id]` for the opener and is 403 for
      an unrelated member account.
