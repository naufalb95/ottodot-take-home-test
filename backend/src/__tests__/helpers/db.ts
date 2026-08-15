import crypto from 'node:crypto';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

const HASH = bcrypt.hashSync('test12345', 4);

export async function truncateAll() {
  await pool.query(
    'TRUNCATE payment_attempts, seats, bookings, students, trial_classes, users CASCADE',
  );
}

export async function createUser(
  role: 'PARENT' | 'TEACHER' | 'ADMIN',
  overrides: Partial<{ email: string; name: string }> = {},
) {
  const uid = crypto.randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${uid}@test.com`,
      passwordHash: HASH,
      name: overrides.name ?? `Test ${role} ${uid}`,
      role,
    },
  });
}

export async function createStudent(
  parentId: string,
  overrides: Partial<{ name: string; dateOfBirth: Date }> = {},
) {
  const uid = crypto.randomUUID().slice(0, 8);
  return prisma.student.create({
    data: {
      parentId,
      name: overrides.name ?? `Student ${uid}`,
      dateOfBirth: overrides.dateOfBirth ?? new Date('2020-01-01'),
    },
  });
}

export async function createClassWithSeats(
  teacherId: string,
  seatCount = 4,
  overrides: Partial<{
    title: string;
    priceCents: number;
    startsAt: Date;
    endsAt: Date;
  }> = {},
) {
  const uid = crypto.randomUUID().slice(0, 8);
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;

  const cls = await prisma.trialClass.create({
    data: {
      teacherId,
      title: overrides.title ?? `Test Class ${uid}`,
      slug: `test-${uid}`,
      description: 'Test class',
      startsAt: overrides.startsAt ?? new Date(now.getTime() + 14 * DAY),
      endsAt:
        overrides.endsAt ?? new Date(now.getTime() + 14 * DAY + HOUR),
      priceCents: overrides.priceCents ?? 5000,
      location: 'Test Location',
    },
  });

  await prisma.seat.createMany({
    data: Array.from({ length: seatCount }, () => ({
      trialClassId: cls.id,
    })),
  });

  return cls;
}

export async function createBookingWithPayment(
  trialClassId: string,
  studentId: string,
  priceCents: number,
) {
  const booking = await prisma.booking.create({
    data: { trialClassId, studentId },
  });

  const attempt = await prisma.paymentAttempt.create({
    data: {
      bookingId: booking.id,
      providerRef: `test_${crypto.randomUUID()}`,
      amountCents: priceCents,
    },
  });

  return { booking, attempt };
}
