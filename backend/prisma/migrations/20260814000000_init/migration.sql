-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARENT', 'TEACHER', 'ADMIN');
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'CANCELLED');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED');
CREATE TYPE "RefundReason" AS ENUM ('CLASS_FULL', 'DUPLICATE_PAYMENT', 'PARENT_CANCELLED', 'CLASS_CANCELLED');

-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: students
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable: trial_classes
CREATE TABLE "trial_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "location" TEXT NOT NULL,
    "age_min" INTEGER,
    "age_max" INTEGER,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "trial_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trial_classes_price_positive" CHECK ("price_cents" >= 0)
);

-- CreateTable: bookings
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trial_class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "confirmed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: seats
CREATE TABLE "seats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trial_class_id" UUID NOT NULL,
    "booking_id" UUID,
    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payment_attempts
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stub',
    "provider_ref" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "refund_reason" "RefundReason",
    "failure_reason" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "trial_classes_slug_key" ON "trial_classes"("slug");
CREATE UNIQUE INDEX "seats_booking_id_key" ON "seats"("booking_id");
CREATE UNIQUE INDEX "payment_attempts_provider_ref_key" ON "payment_attempts"("provider_ref");

-- Partial indexes (architecture.md §4)
CREATE INDEX "seats_free" ON "seats" ("trial_class_id") WHERE "booking_id" IS NULL;
CREATE UNIQUE INDEX "one_live_booking_per_student" ON "bookings" ("trial_class_id", "student_id")
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED');
CREATE INDEX "refunds_due" ON "payment_attempts" ("created_at") WHERE "status" = 'REFUND_PENDING';

-- Foreign keys
ALTER TABLE "students"
  ADD CONSTRAINT "students_parent_id_fkey" FOREIGN KEY ("parent_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trial_classes"
  ADD CONSTRAINT "trial_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seats"
  ADD CONSTRAINT "seats_trial_class_id_fkey" FOREIGN KEY ("trial_class_id")
  REFERENCES "trial_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seats"
  ADD CONSTRAINT "seats_booking_id_fkey" FOREIGN KEY ("booking_id")
  REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_trial_class_id_fkey" FOREIGN KEY ("trial_class_id")
  REFERENCES "trial_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id")
  REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_booking_id_fkey" FOREIGN KEY ("booking_id")
  REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
