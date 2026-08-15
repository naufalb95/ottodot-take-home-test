import { describe, it, expect, beforeEach } from 'vitest';
import {
  prisma,
  truncateAll,
  createUser,
  createStudent,
  createClassWithSeats,
  createBookingWithPayment,
} from './helpers/db';
import {
  processPaymentSuccess,
  processPaymentFailure,
} from '../services/webhook';

describe('webhook processing', () => {
  beforeEach(truncateAll);

  it('confirms a booking and claims a seat on payment success', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);
    const { attempt } = await createBookingWithPayment(
      cls.id,
      student.id,
      cls.priceCents,
    );

    await prisma.$transaction((tx) =>
      processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
    );

    const booking = await prisma.booking.findFirst({
      where: { trialClassId: cls.id, studentId: student.id },
    });
    expect(booking!.status).toBe('CONFIRMED');
    expect(booking!.confirmedAt).toBeTruthy();

    const seat = await prisma.seat.findFirst({
      where: { bookingId: booking!.id },
    });
    expect(seat).toBeTruthy();
  });

  it('cancels and queues refund when class is full', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 1);

    const p1 = await createUser('PARENT');
    const p2 = await createUser('PARENT');
    const s1 = await createStudent(p1.id);
    const s2 = await createStudent(p2.id);

    const first = await createBookingWithPayment(
      cls.id,
      s1.id,
      cls.priceCents,
    );
    const second = await createBookingWithPayment(
      cls.id,
      s2.id,
      cls.priceCents,
    );

    await prisma.$transaction((tx) =>
      processPaymentSuccess(tx, first.attempt.providerRef, cls.priceCents),
    );
    await prisma.$transaction((tx) =>
      processPaymentSuccess(
        tx,
        second.attempt.providerRef,
        cls.priceCents,
      ),
    );

    const b1 = await prisma.booking.findUnique({
      where: { id: first.booking.id },
    });
    const b2 = await prisma.booking.findUnique({
      where: { id: second.booking.id },
    });

    expect(b1!.status).toBe('CONFIRMED');
    expect(b2!.status).toBe('CANCELLED');

    const refund = await prisma.paymentAttempt.findUnique({
      where: { id: second.attempt.id },
    });
    expect(refund!.status).toBe('REFUND_PENDING');
    expect(refund!.refundReason).toBe('CLASS_FULL');
  });

  describe('idempotency', () => {
    it('duplicate webhook delivery confirms once and consumes one seat', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);
      const { attempt } = await createBookingWithPayment(
        cls.id,
        student.id,
        cls.priceCents,
      );

      await prisma.$transaction((tx) =>
        processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
      );
      await prisma.$transaction((tx) =>
        processPaymentSuccess(tx, attempt.providerRef, cls.priceCents),
      );

      const bookings = await prisma.booking.findMany({
        where: { trialClassId: cls.id, status: 'CONFIRMED' },
      });
      expect(bookings).toHaveLength(1);

      const occupiedSeats = await prisma.seat.count({
        where: { trialClassId: cls.id, bookingId: { not: null } },
      });
      expect(occupiedSeats).toBe(1);
    });
  });

  describe('double payment', () => {
    it('refunds a second payment on an already-confirmed booking', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);
      const { booking, attempt: first } = await createBookingWithPayment(
        cls.id,
        student.id,
        cls.priceCents,
      );

      await prisma.$transaction((tx) =>
        processPaymentSuccess(tx, first.providerRef, cls.priceCents),
      );

      const secondAttempt = await prisma.paymentAttempt.create({
        data: {
          bookingId: booking.id,
          providerRef: `test_double_${booking.id}`,
          amountCents: cls.priceCents,
        },
      });

      await prisma.$transaction((tx) =>
        processPaymentSuccess(
          tx,
          secondAttempt.providerRef,
          cls.priceCents,
        ),
      );

      const updated = await prisma.paymentAttempt.findUnique({
        where: { id: secondAttempt.id },
      });
      expect(updated!.status).toBe('REFUND_PENDING');
      expect(updated!.refundReason).toBe('DUPLICATE_PAYMENT');

      const b = await prisma.booking.findUnique({
        where: { id: booking.id },
      });
      expect(b!.status).toBe('CONFIRMED');

      const seats = await prisma.seat.count({
        where: { trialClassId: cls.id, bookingId: { not: null } },
      });
      expect(seats).toBe(1);
    });
  });

  describe('amount verification', () => {
    it('refunds when the paid amount does not match the class price', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id, 4, {
        priceCents: 5000,
      });
      const { booking, attempt } = await createBookingWithPayment(
        cls.id,
        student.id,
        9999,
      );

      await prisma.$transaction((tx) =>
        processPaymentSuccess(tx, attempt.providerRef, 9999),
      );

      const b = await prisma.booking.findUnique({
        where: { id: booking.id },
      });
      expect(b!.status).toBe('PENDING_PAYMENT');

      const a = await prisma.paymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(a!.status).toBe('REFUND_PENDING');
    });
  });

  describe('payment failure', () => {
    it('marks the attempt as FAILED and leaves the booking resumable', async () => {
      const teacher = await createUser('TEACHER');
      const parent = await createUser('PARENT');
      const student = await createStudent(parent.id);
      const cls = await createClassWithSeats(teacher.id);
      const { booking, attempt } = await createBookingWithPayment(
        cls.id,
        student.id,
        cls.priceCents,
      );

      await prisma.$transaction((tx) =>
        processPaymentFailure(tx, attempt.providerRef, 'card_declined'),
      );

      const b = await prisma.booking.findUnique({
        where: { id: booking.id },
      });
      expect(b!.status).toBe('PENDING_PAYMENT');

      const a = await prisma.paymentAttempt.findUnique({
        where: { id: attempt.id },
      });
      expect(a!.status).toBe('FAILED');
      expect(a!.failureReason).toBe('card_declined');
    });
  });
});
