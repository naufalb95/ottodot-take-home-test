import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db';
import { requireSession } from '../lib/auth';
import { requireRole } from '../lib/authz';
import { getPaymentProvider } from '../payments/index';
import { AppError } from '../lib/errors';

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/payments', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'ADMIN');

    return prisma.paymentAttempt.findMany({
      include: {
        booking: {
          include: {
            student: {
              select: {
                name: true,
                parent: { select: { name: true, email: true } },
              },
            },
            trialClass: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.post('/payments/:id/retry-refund', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'ADMIN');
    const { id } = request.params as { id: string };

    const attempt = await prisma.paymentAttempt.findUnique({ where: { id } });
    if (!attempt) throw AppError.notFound('Payment attempt not found');
    if (attempt.status !== 'REFUND_FAILED') {
      throw AppError.badRequest('Can only retry failed refunds');
    }

    const provider = getPaymentProvider();

    try {
      await provider.refund(attempt.providerRef);
      return prisma.paymentAttempt.update({
        where: { id },
        data: { status: 'REFUNDED' },
      });
    } catch {
      return prisma.paymentAttempt.update({
        where: { id },
        data: { status: 'REFUND_FAILED' },
      });
    }
  });
};

export default adminRoutes;
