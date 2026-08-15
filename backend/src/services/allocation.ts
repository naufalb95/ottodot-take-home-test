import type { TxClient } from '../lib/db';

export async function claimSeat(
  tx: TxClient,
  trialClassId: string,
  bookingId: string,
): Promise<string | null> {
  const result = await tx.$queryRaw<{ id: string }[]>`
    UPDATE seats SET booking_id = ${bookingId}
    WHERE id = (
      SELECT id FROM seats
      WHERE trial_class_id = ${trialClassId} AND booking_id IS NULL
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return result[0]?.id ?? null;
}

export async function releaseSeat(
  tx: TxClient,
  bookingId: string,
): Promise<void> {
  await tx.seat.updateMany({
    where: { bookingId },
    data: { bookingId: null },
  });
}
