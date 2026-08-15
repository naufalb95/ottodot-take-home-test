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
import { cancelBooking } from '../services/booking';

describe('structural invariants', () => {
  beforeEach(truncateAll);

  it('every CONFIRMED booking holds exactly one seat', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id);

    const parents = await Promise.all(
      Array.from({ length: 4 }, () => createUser('PARENT')),
    );
    const students = await Promise.all(
      parents.map((p) => createStudent(p.id)),
    );
    const pairs = await Promise.all(
      students.map((s) =>
        createBookingWithPayment(cls.id, s.id, cls.priceCents),
      ),
    );

    await Promise.all(
      pairs.map(({ attempt }) =>
        prisma.$transaction((tx) =>
          processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
        ),
      ),
    );

    const confirmed = await prisma.booking.findMany({
      where: { status: 'CONFIRMED' },
      select: { id: true },
    });

    for (const booking of confirmed) {
      const seatCount = await prisma.seat.count({
        where: { bookingId: booking.id },
      });
      expect(seatCount).toBe(1);
    }
  });

  it('every occupied seat points at a CONFIRMED booking', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id);

    const parents = await Promise.all(
      Array.from({ length: 4 }, () => createUser('PARENT')),
    );
    const students = await Promise.all(
      parents.map((p) => createStudent(p.id)),
    );
    const pairs = await Promise.all(
      students.map((s) =>
        createBookingWithPayment(cls.id, s.id, cls.priceCents),
      ),
    );

    await Promise.all(
      pairs.map(({ attempt }) =>
        prisma.$transaction((tx) =>
          processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
        ),
      ),
    );

    const occupiedSeats = await prisma.seat.findMany({
      where: { bookingId: { not: null } },
      include: { booking: { select: { status: true } } },
    });

    for (const seat of occupiedSeats) {
      expect(seat.booking!.status).toBe('CONFIRMED');
    }
  });

  it('invariants hold after a confirm-then-cancel cycle', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 2);

    const p1 = await createUser('PARENT');
    const p2 = await createUser('PARENT');
    const s1 = await createStudent(p1.id);
    const s2 = await createStudent(p2.id);

    const pair1 = await createBookingWithPayment(
      cls.id,
      s1.id,
      cls.priceCents,
    );
    const pair2 = await createBookingWithPayment(
      cls.id,
      s2.id,
      cls.priceCents,
    );

    await prisma.$transaction((tx) =>
      processPaymentSuccess(
        tx,
        pair1.attempt.providerRef,
        cls.priceCents,
      ),
    );
    await prisma.$transaction((tx) =>
      processPaymentSuccess(
        tx,
        pair2.attempt.providerRef,
        cls.priceCents,
      ),
    );

    await prisma.paymentAttempt.updateMany({
      where: { bookingId: pair1.booking.id, status: 'SUCCEEDED' },
      data: { status: 'SUCCEEDED' },
    });

    await prisma.paymentAttempt.create({
      data: {
        bookingId: pair1.booking.id,
        providerRef: `cancel_${pair1.booking.id}`,
        amountCents: cls.priceCents,
        status: 'SUCCEEDED',
      },
    });

    await prisma.$transaction((tx) =>
      cancelBooking(tx, pair1.booking.id),
    );

    const occupiedSeats = await prisma.seat.findMany({
      where: { trialClassId: cls.id, bookingId: { not: null } },
      include: { booking: { select: { status: true } } },
    });

    expect(occupiedSeats).toHaveLength(1);
    expect(occupiedSeats[0]!.booking!.status).toBe('CONFIRMED');

    const freeSeats = await prisma.seat.count({
      where: { trialClassId: cls.id, bookingId: null },
    });
    expect(freeSeats).toBe(1);
  });
});
