import prisma from '../lib/db';
import type { PaymentProvider } from '../payments/provider';

export async function processRefunds(
  provider: PaymentProvider,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.$queryRaw<
      { id: string; provider_ref: string }[]
    >`
      SELECT id, provider_ref FROM payment_attempts
      WHERE status = 'REFUND_PENDING'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 10
    `;

    let processed = 0;

    for (const attempt of pending) {
      try {
        await provider.refund(attempt.provider_ref);
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: 'REFUNDED' },
        });
        processed++;
      } catch (err) {
        console.error(`Refund failed for ${attempt.provider_ref}:`, err);
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: 'REFUND_FAILED' },
        });
      }
    }

    return processed;
  });
}
