-- BASELINE MIGRATION — DO NOT run this as-is against a DB that already has
-- these tables (e.g. production). It was generated from the local dev DB's
-- existing (pre-Prisma-migrations) schema and was never executed there —
-- it was recorded as already-applied via `prisma migrate resolve --applied
-- 0_init`. Production's `sarp_tickets` DB is in the same pre-migration
-- state (tables exist, no `_prisma_migrations` history), so before running
-- `prisma migrate deploy` there, run the same
-- `prisma migrate resolve --applied 0_init` step first, or these raw
-- `CREATE TABLE` statements (no `IF NOT EXISTS`) will fail with
-- "relation already exists".

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."anti_ping" (
    "user_id" TEXT NOT NULL,
    "offence_count" INTEGER NOT NULL DEFAULT 0,
    "auto_timeout_count" INTEGER NOT NULL DEFAULT 0,
    "last_mute_at" BIGINT,
    "last_unmute_at" BIGINT,
    "last_offence_at" BIGINT,

    CONSTRAINT "anti_ping_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."blacklist" (
    "user_id" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."claim_history" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "channel_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "meta" TEXT,

    CONSTRAINT "claim_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."claim_stats" (
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "claims" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "claim_stats_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "public"."meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."response_samples" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "delay_ms" INTEGER NOT NULL,
    "recorded_at" BIGINT NOT NULL,

    CONSTRAINT "response_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ticket_type_stats" (
    "type" TEXT NOT NULL,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "closed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_type_stats_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "public"."tickets" (
    "id" SERIAL NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "opener_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "claimed_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_at" BIGINT NOT NULL,
    "closed_at" BIGINT,
    "close_reason" TEXT,
    "closed_by" TEXT,
    "last_message_at" BIGINT NOT NULL,
    "checkup_sent" INTEGER NOT NULL DEFAULT 0,
    "last_staff_speaker_id" TEXT,
    "pending_member_message_at" BIGINT,
    "control_message_id" TEXT,
    "times_claimed" INTEGER NOT NULL DEFAULT 0,
    "first_claimed_by" TEXT,
    "last_claimed_by" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_channel_id_key" ON "public"."tickets"("channel_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."claim_history" ADD CONSTRAINT "claim_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."response_samples" ADD CONSTRAINT "response_samples_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

