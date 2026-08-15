import { describe, it, expect, beforeEach } from 'vitest';
import {
  prisma,
  truncateAll,
  createUser,
  createStudent,
  createClassWithSeats,
} from './helpers/db';
import { createBooking, cancelBooking } from '../services/booking';
import { claimSeat } from '../services/allocation';

describe('booking service', () => {
  beforeEach(truncateAll);

  it('creates a booking in PENDING_PAYMENT status', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);

    const booking = await prisma.$transaction((tx) =>
      createBooking(tx, cls.id, student.id),
    );

    expect(booking.status).toBe('PENDING_PAYMENT');
    expect(booking.trialClassId).toBe(cls.id);
    expect(booking.studentId).toBe(student.id);
  });

  it('refuses to start a booking when the class is full', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 1);

    const p1 = await createUser('PARENT');
    const p2 = await createUser('PARENT');
    const s1 = await createStudent(p1.id);
    const s2 = await createStudent(p2.id);

    const b1 = await prisma.$transaction((tx) =>
      createBooking(tx, cls.id, s1.id),
    );
    await prisma.$transaction(async (tx) => {
      await claimSeat(tx, cls.id, b1.id);
      await tx.booking.update({
        where: { id: b1.id },
        data: { status: 'CONFIRMED' },
      });
    });

    await expect(
      prisma.$transaction((tx) => createBooking(tx, cls.id, s2.id)),
    ).rejects.toThrow('Class is full');
  });

  describe('duplicate booking', () => {
    it('returns the existing booking instead of creating a duplicate', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);

      const first = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );
      const second = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );

      expect(second.id).toBe(first.id);

      const count = await prisma.booking.count({
        where: { trialClassId: cls.id, studentId: student.id },
      });
      expect(count).toBe(1);
    });

    it('allows rebooking after cancellation', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);

      const first = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );
      await prisma.booking.update({
        where: { id: first.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      const second = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );

      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('PENDING_PAYMENT');
    });
  });

  describe('cancellation', () => {
    it('cancels a PENDING_PAYMENT booking without queueing a refund', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);

      const booking = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );

      const cancelled = await prisma.$transaction((tx) =>
        cancelBooking(tx, booking.id),
      );

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancelledAt).toBeTruthy();

      const refunds = await prisma.paymentAttempt.count({
        where: { status: 'REFUND_PENDING' },
      });
      expect(refunds).toBe(0);
    });

    it('cancels a CONFIRMED booking, frees the seat, and queues a refund', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);

      const booking = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );

      await prisma.$transaction(async (tx) => {
        await claimSeat(tx, cls.id, booking.id);
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
      });

      await prisma.paymentAttempt.create({
        data: {
          bookingId: booking.id,
          providerRef: `test_${booking.id}`,
          amountCents: cls.priceCents,
          status: 'SUCCEEDED',
        },
      });

      const cancelled = await prisma.$transaction((tx) =>
        cancelBooking(tx, booking.id),
      );

      expect(cancelled.status).toBe('CANCELLED');

      const freeSeats = await prisma.seat.count({
        where: { trialClassId: cls.id, bookingId: null },
      });
      expect(freeSeats).toBe(4);

      const refund = await prisma.paymentAttempt.findFirst({
        where: { bookingId: booking.id, status: 'REFUND_PENDING' },
      });
      expect(refund).toBeTruthy();
      expect(refund!.refundReason).toBe('PARENT_CANCELLED');
    });

    it('refuses cancellation after the class has started', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id, 4, {
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
      });

      const booking = await prisma.$transaction((tx) =>
        createBooking(tx, cls.id, student.id),
      );

      await expect(
        prisma.$transaction((tx) => cancelBooking(tx, booking.id)),
      ).rejects.toThrow('Cannot cancel after class has started');
    });
  });
});
