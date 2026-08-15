import type { TxClient } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

export async function createBooking(
  tx: TxClient,
  trialClassId: string,
  studentId: string,
) {
  const existing = await tx.booking.findFirst({
    where: {
      trialClassId,
      studentId,
      status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
    },
  });
  if (existing) return existing;

  const freeSeats = await tx.seat.count({
    where: { trialClassId, bookingId: null },
  });
  if (freeSeats === 0) {
    throw AppError.conflict('Class is full', 'CLASS_FULL');
  }

  return tx.booking.create({
    data: { trialClassId, studentId },
  });
}

export async function cancelBooking(tx: TxClient, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { trialClass: { select: { startsAt: true } } },
  });

  if (!booking) throw AppError.notFound('Booking not found');
  if (booking.status === 'CANCELLED') {
    throw AppError.conflict('Booking is already cancelled');
  }
  if (booking.trialClass.startsAt <= new Date()) {
    throw AppError.badRequest('Cannot cancel after class has started');
  }

  if (booking.status === 'CONFIRMED') {
    await tx.seat.updateMany({
      where: { bookingId },
      data: { bookingId: null },
    });

    await tx.paymentAttempt.updateMany({
      where: { bookingId, status: 'SUCCEEDED' },
      data: { status: 'REFUND_PENDING', refundReason: 'PARENT_CANCELLED' },
    });
  }

  return tx.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
}
