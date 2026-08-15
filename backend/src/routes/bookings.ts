import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db';
import { requireSession } from '../lib/auth';
import {
  requireRole,
  requireStudentOwnership,
  requireBookingOwnership,
} from '../lib/authz';
import { createBooking, cancelBooking } from '../services/booking';
import { createBookingSchema } from '../validation/schemas';
import { getPaymentProvider } from '../payments/index';

const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');

    const data = createBookingSchema.parse(request.body);

    const booking = await prisma.$transaction(async (tx) => {
      await requireStudentOwnership(tx, session, data.studentId);
      return createBooking(tx, data.trialClassId, data.studentId);
    });

    const cls = await prisma.trialClass.findUniqueOrThrow({
      where: { id: data.trialClassId },
      select: { priceCents: true, currency: true },
    });

    const provider = getPaymentProvider();
    const checkout = await provider.createCheckout({
      bookingId: booking.id,
      amountCents: cls.priceCents,
      currency: cls.currency,
      returnUrl: data.returnUrl,
    });

    await prisma.paymentAttempt.create({
      data: {
        bookingId: booking.id,
        providerRef: checkout.providerRef,
        amountCents: cls.priceCents,
        currency: cls.currency,
      },
    });

    return reply.status(201).send({
      booking,
      checkoutUrl: checkout.checkoutUrl,
    });
  });

  app.get('/', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');

    return prisma.booking.findMany({
      where: { student: { parentId: session.userId } },
      include: {
        trialClass: {
          select: { title: true, startsAt: true, location: true },
        },
        student: { select: { name: true } },
        paymentAttempts: {
          select: { status: true, refundReason: true, failureReason: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.get('/:id', async (request) => {
    const session = requireSession(request);
    const { id } = request.params as { id: string };

    await prisma.$transaction((tx) =>
      requireBookingOwnership(tx, session, id),
    );

    return prisma.booking.findUnique({
      where: { id },
      include: {
        trialClass: true,
        student: { select: { name: true, dateOfBirth: true } },
        paymentAttempts: { orderBy: { createdAt: 'desc' } },
      },
    });
  });

  app.post('/:id/cancel', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');
    const { id } = request.params as { id: string };

    return prisma.$transaction(async (tx) => {
      await requireBookingOwnership(tx, session, id);
      return cancelBooking(tx, id);
    });
  });
};

export default bookingRoutes;
