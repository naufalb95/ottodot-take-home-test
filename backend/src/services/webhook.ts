import type { TxClient } from '../lib/db';
import { claimSeat } from './allocation';

export async function processPaymentSuccess(
  tx: TxClient,
  providerRef: string,
  amountCents: number,
) {
  const swapped = await tx.$queryRaw<{ booking_id: string }[]>`
    UPDATE payment_attempts SET status = 'SUCCEEDED', updated_at = now()
    WHERE provider_ref = ${providerRef} AND status = 'INITIATED'
    RETURNING booking_id
  `;

  if (swapped.length === 0) return;

  const bookingId = swapped[0]!.booking_id;

  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { trialClass: { select: { priceCents: true, id: true } } },
  });

  if (!booking) return;

  if (amountCents !== booking.trialClass.priceCents) {
    await tx.paymentAttempt.updateMany({
      where: { providerRef },
      data: { status: 'REFUND_PENDING', refundReason: 'DUPLICATE_PAYMENT' },
    });
    return;
  }

  if (booking.status !== 'PENDING_PAYMENT') {
    await tx.paymentAttempt.updateMany({
      where: { providerRef },
      data: { status: 'REFUND_PENDING', refundReason: 'DUPLICATE_PAYMENT' },
    });
    return;
  }

  const seatId = await claimSeat(tx, booking.trialClass.id, bookingId);

  if (seatId) {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  } else {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await tx.paymentAttempt.updateMany({
      where: { providerRef },
      data: { status: 'REFUND_PENDING', refundReason: 'CLASS_FULL' },
    });
  }
}

export async function processPaymentFailure(
  tx: TxClient,
  providerRef: string,
  failureReason?: string,
) {
  await tx.paymentAttempt.updateMany({
    where: { providerRef, status: 'INITIATED' },
    data: { status: 'FAILED', failureReason: failureReason ?? null },
  });
}
