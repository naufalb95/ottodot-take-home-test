import { describe, it, expect, beforeEach } from 'vitest';
import {
  prisma,
  truncateAll,
  createUser,
  createStudent,
  createClassWithSeats,
  createBookingWithPayment,
} from './helpers/db';
import { processPaymentSuccess } from '../services/webhook';

describe('concurrency', () => {
  beforeEach(truncateAll);

  it('8 simultaneous payments against a 4-seat class: exactly 4 confirmed, 4 cancelled, zero errors', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 4, {
      priceCents: 5000,
    });

    const parents = await Promise.all(
      Array.from({ length: 8 }, () => createUser('PARENT')),
    );
    const students = await Promise.all(
      parents.map((p) => createStudent(p.id)),
    );
    const pairs = await Promise.all(
      students.map((s) =>
        createBookingWithPayment(cls.id, s.id, cls.priceCents),
      ),
    );

    const results = await Promise.allSettled(
      pairs.map(({ attempt }) =>
        prisma.$transaction((tx) =>
          processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
        ),
      ),
    );

    const errors = results.filter((r) => r.status === 'rejected');
    expect(errors).toHaveLength(0);

    const confirmed = await prisma.booking.count({
      where: { trialClassId: cls.id, status: 'CONFIRMED' },
    });
    const cancelled = await prisma.booking.count({
      where: { trialClassId: cls.id, status: 'CANCELLED' },
    });
    expect(confirmed).toBe(4);
    expect(cancelled).toBe(4);

    const refunds = await prisma.paymentAttempt.count({
      where: {
        booking: { trialClassId: cls.id },
        status: 'REFUND_PENDING',
        refundReason: 'CLASS_FULL',
      },
    });
    expect(refunds).toBe(4);

    const occupiedSeats = await prisma.seat.count({
      where: { trialClassId: cls.id, bookingId: { not: null } },
    });
    expect(occupiedSeats).toBe(4);
  });

  it('50 simultaneous payments against a 4-seat class: exactly 4 confirmed', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 4, {
      priceCents: 3000,
    });

    const parents = await Promise.all(
      Array.from({ length: 50 }, () => createUser('PARENT')),
    );
    const students = await Promise.all(
      parents.map((p) => createStudent(p.id)),
    );
    const pairs = await Promise.all(
      students.map((s) =>
        createBookingWithPayment(cls.id, s.id, cls.priceCents),
      ),
    );

    const results = await Promise.allSettled(
      pairs.map(({ attempt }) =>
        prisma.$transaction((tx) =>
          processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
        ),
      ),
    );

    const errors = results.filter((r) => r.status === 'rejected');
    expect(errors).toHaveLength(0);

    const confirmed = await prisma.booking.count({
      where: { trialClassId: cls.id, status: 'CONFIRMED' },
    });
    expect(confirmed).toBe(4);

    const occupiedSeats = await prisma.seat.count({
      where: { trialClassId: cls.id, bookingId: { not: null } },
    });
    expect(occupiedSeats).toBe(4);
  });
});
