

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'released', 'scheduled', 'in_progress', 'completed', 'on_hold', 'cancelled');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('pending', 'running', 'completed', 'blocked', 'cancelled');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('active', 'superseded');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'operator');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "capabilities" TEXT[] NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_unavailability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "machine_id" UUID NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ,
    "reason" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_transitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "machine_id" UUID,
    "from_op_type" VARCHAR(50),
    "to_op_type" VARCHAR(50) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,

    CONSTRAINT "setup_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(50),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "operation_type" VARCHAR(50) NOT NULL,
    "eligible_machine_types" TEXT[] NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "operation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "job_number" VARCHAR(20) NOT NULL,
    "customer_name" VARCHAR(200) NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "due_date" TIMESTAMPTZ NOT NULL,
    "release_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "operation_type" VARCHAR(50) NOT NULL,
    "eligible_machine_ids" UUID[],
    "estimated_duration_minutes" INTEGER NOT NULL,
    "actual_start" TIMESTAMPTZ,
    "actual_end" TIMESTAMPTZ,
    "status" "OperationStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "job_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL,
    "trigger_reason" VARCHAR(200) NOT NULL,
    "algorithm" VARCHAR(50) NOT NULL,
    "weighted_tardiness" DOUBLE PRECISION NOT NULL,
    "total_setup_minutes" INTEGER NOT NULL,
    "makespan_minutes" INTEGER NOT NULL,
    "num_late_jobs" INTEGER NOT NULL,
    "machine_utilization" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_version_id" UUID,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID NOT NULL,
    "job_operation_id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "setup_start" TIMESTAMPTZ NOT NULL,
    "processing_start" TIMESTAMPTZ NOT NULL,
    "processing_end" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "user_id" UUID,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "machines_org_id_idx" ON "machines"("org_id");

-- CreateIndex
CREATE INDEX "machine_unavailability_machine_id_start_time_idx" ON "machine_unavailability"("machine_id", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "setup_transitions_org_id_machine_id_from_op_type_to_op_type_key" ON "setup_transitions"("org_id", "machine_id", "from_op_type", "to_op_type") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "products_org_id_sku_key" ON "products"("org_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "operation_templates_product_id_sequence_number_key" ON "operation_templates"("product_id", "sequence_number");

-- CreateIndex
CREATE INDEX "jobs_org_id_status_idx" ON "jobs"("org_id", "status");

-- CreateIndex
CREATE INDEX "jobs_org_id_due_date_idx" ON "jobs"("org_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_org_id_job_number_key" ON "jobs"("org_id", "job_number");

-- CreateIndex
CREATE INDEX "job_operations_job_id_sequence_number_idx" ON "job_operations"("job_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "job_operations_job_id_sequence_number_key" ON "job_operations"("job_id", "sequence_number");

-- CreateIndex
CREATE INDEX "schedules_org_id_status_idx" ON "schedules"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_org_id_version_key" ON "schedules"("org_id", "version");

-- CreateIndex
CREATE INDEX "schedule_assignments_schedule_id_machine_id_setup_start_idx" ON "schedule_assignments"("schedule_id", "machine_id", "setup_start");

-- CreateIndex
CREATE INDEX "schedule_assignments_schedule_id_job_operation_id_idx" ON "schedule_assignments"("schedule_id", "job_operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE INDEX "activity_log_org_id_entity_type_entity_id_idx" ON "activity_log"("org_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_unavailability" ADD CONSTRAINT "machine_unavailability_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_transitions" ADD CONSTRAINT "setup_transitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_transitions" ADD CONSTRAINT "setup_transitions_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_templates" ADD CONSTRAINT "operation_templates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_operations" ADD CONSTRAINT "job_operations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_job_operation_id_fkey" FOREIGN KEY ("job_operation_id") REFERENCES "job_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Add CHECK constraints
ALTER TABLE "machines" ADD CONSTRAINT "capabilities_nonempty" CHECK (cardinality("capabilities") > 0);
ALTER TABLE "operation_templates" ADD CONSTRAINT "eligible_types_nonempty" CHECK (cardinality("eligible_machine_types") > 0);
ALTER TABLE "operation_templates" ADD CONSTRAINT "duration_positive" CHECK ("estimated_duration_minutes" > 0);
ALTER TABLE "job_operations" ADD CONSTRAINT "duration_positive" CHECK ("estimated_duration_minutes" > 0);
ALTER TABLE "jobs" ADD CONSTRAINT "quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "setup_transitions" ADD CONSTRAINT "duration_nonnegative" CHECK ("duration_minutes" >= 0);
ALTER TABLE "machine_unavailability" ADD CONSTRAINT "window_valid" CHECK ("end_time" IS NULL OR "end_time" > "start_time");
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "timing_valid" CHECK ("setup_start" <= "processing_start" AND "processing_start" < "processing_end");

-- Partial unique index for active schedules
CREATE UNIQUE INDEX "one_active_schedule_per_org" ON "schedules"("org_id") WHERE status = 'active';
