import { describe, it, expect, beforeEach } from 'vitest';
import {
  prisma,
  truncateAll,
  createUser,
  createStudent,
  createClassWithSeats,
  createBookingWithPayment,
} from './helpers/db';
import { processRefunds } from '../services/refund';
import type { PaymentProvider } from '../payments/provider';

function mockProvider(
  shouldFail = false,
): PaymentProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createCheckout() {
      return { providerRef: '', checkoutUrl: '' };
    },
    async refund(providerRef: string) {
      calls.push(providerRef);
      if (shouldFail) throw new Error('provider down');
    },
    verifyWebhookSignature() {
      return true;
    },
  };
}

describe('refund worker', () => {
  beforeEach(truncateAll);

  it('processes REFUND_PENDING attempts and marks them REFUNDED', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);
    const { attempt } = await createBookingWithPayment(
      cls.id,
      student.id,
      cls.priceCents,
    );

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'REFUND_PENDING', refundReason: 'CLASS_FULL' },
    });

    const provider = mockProvider();
    const count = await processRefunds(provider);

    expect(count).toBe(1);
    expect(provider.calls).toEqual([attempt.providerRef]);

    const updated = await prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
    });
    expect(updated!.status).toBe('REFUNDED');
  });

  it('marks as REFUND_FAILED when the provider call throws', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);
    const { attempt } = await createBookingWithPayment(
      cls.id,
      student.id,
      cls.priceCents,
    );

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'REFUND_PENDING', refundReason: 'PARENT_CANCELLED' },
    });

    const provider = mockProvider(true);
    const count = await processRefunds(provider);

    expect(count).toBe(0);

    const updated = await prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
    });
    expect(updated!.status).toBe('REFUND_FAILED');
  });

  it('does not reprocess already REFUNDED attempts', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);
    const { attempt } = await createBookingWithPayment(
      cls.id,
      student.id,
      cls.priceCents,
    );

    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'REFUNDED' },
    });

    const provider = mockProvider();
    const count = await processRefunds(provider);

    expect(count).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('returns 0 when there is nothing to process', async () => {
    const provider = mockProvider();
    const count = await processRefunds(provider);
    expect(count).toBe(0);
  });
});
