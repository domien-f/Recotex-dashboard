-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "responsible_user_id" TEXT,
ADD COLUMN     "responsible_user_name" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'excel';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'excel',
ADD COLUMN     "teamleader_id" TEXT;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'excel';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "teamleader_user_id" TEXT;

-- CreateTable
CREATE TABLE "appointment_targets" (
    "id" TEXT NOT NULL,
    "verantwoordelijke" TEXT NOT NULL,
    "teamleader_user_id" TEXT,
    "weekly_target" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teamleader_tokens" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teamleader_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "raw_body" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_targets_verantwoordelijke_idx" ON "appointment_targets"("verantwoordelijke");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_targets_verantwoordelijke_effective_from_key" ON "appointment_targets"("verantwoordelijke", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotency_key_key" ON "webhook_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");

-- CreateIndex
CREATE INDEX "webhook_events_entity_type_entity_id_idx" ON "webhook_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "webhook_events_source_event_type_idx" ON "webhook_events"("source", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_external_ref_key" ON "appointments"("external_ref");

-- CreateIndex
CREATE INDEX "appointments_scheduled_at_idx" ON "appointments"("scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_responsible_user_id_idx" ON "appointments"("responsible_user_id");

-- CreateIndex
CREATE INDEX "appointments_source_idx" ON "appointments"("source");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_teamleader_id_key" ON "contacts"("teamleader_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_external_ref_key" ON "contacts"("external_ref");

-- CreateIndex
CREATE INDEX "contacts_source_idx" ON "contacts"("source");

-- CreateIndex
CREATE UNIQUE INDEX "deals_external_ref_key" ON "deals"("external_ref");

-- CreateIndex
CREATE INDEX "deals_source_idx" ON "deals"("source");

-- CreateIndex
CREATE UNIQUE INDEX "users_teamleader_user_id_key" ON "users"("teamleader_user_id");

