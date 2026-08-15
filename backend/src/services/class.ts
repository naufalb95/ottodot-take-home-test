import type { TxClient } from '../lib/db';

const DEFAULT_SEATS = Number(process.env.DEFAULT_CLASS_SEATS ?? 4);

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createClass(
  tx: TxClient,
  teacherId: string,
  data: {
    title: string;
    description: string;
    startsAt: string;
    endsAt: string;
    priceCents: number;
    currency?: string;
    location: string;
    ageMin?: number;
    ageMax?: number;
  },
) {
  let slug = slugify(data.title);

  const existing = await tx.trialClass.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now()}`;

  const cls = await tx.trialClass.create({
    data: {
      teacherId,
      title: data.title,
      slug,
      description: data.description,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      priceCents: data.priceCents,
      currency: data.currency ?? 'SGD',
      location: data.location,
      ageMin: data.ageMin ?? null,
      ageMax: data.ageMax ?? null,
    },
  });

  await tx.seat.createMany({
    data: Array.from({ length: DEFAULT_SEATS }, () => ({
      trialClassId: cls.id,
    })),
  });

  return cls;
}

export async function cancelClass(tx: TxClient, classId: string) {
  const cls = await tx.trialClass.update({
    where: { id: classId },
    data: { status: 'CANCELLED' },
  });

  const confirmedBookings = await tx.booking.findMany({
    where: { trialClassId: classId, status: 'CONFIRMED' },
  });

  for (const booking of confirmedBookings) {
    await tx.seat.updateMany({
      where: { bookingId: booking.id },
      data: { bookingId: null },
    });

    await tx.paymentAttempt.updateMany({
      where: { bookingId: booking.id, status: 'SUCCEEDED' },
      data: { status: 'REFUND_PENDING', refundReason: 'CLASS_CANCELLED' },
    });

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  await tx.booking.updateMany({
    where: { trialClassId: classId, status: 'PENDING_PAYMENT' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  return cls;
}
