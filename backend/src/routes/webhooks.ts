import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db.js';
import { getPaymentProvider } from '../payments/index.js';
import {
  processPaymentSuccess,
  processPaymentFailure,
} from '../services/webhook.js';
import { paymentWebhookSchema } from '../validation/schemas.js';
import { AppError } from '../lib/errors.js';

const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        done(null, { raw: body as string, parsed: JSON.parse(body as string) });
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );

  app.post('/payment', async (request, reply) => {
    const { raw, parsed } = request.body as {
      raw: string;
      parsed: unknown;
    };
    const signature = request.headers['x-stub-signature'] as string;

    if (!signature) throw AppError.unauthorized('Missing webhook signature');

    const provider = getPaymentProvider();
    if (!provider.verifyWebhookSignature(raw, signature)) {
      throw AppError.unauthorized('Invalid webhook signature');
    }

    const event = paymentWebhookSchema.parse(parsed);

    await prisma.$transaction(async (tx) => {
      if (event.type === 'payment.succeeded') {
        await processPaymentSuccess(tx, event.provider_ref, event.amount_cents);
      } else {
        await processPaymentFailure(
          tx,
          event.provider_ref,
          event.failure_reason,
        );
      }
    });

    return reply.status(200).send({ received: true });
  });
};

export default webhookRoutes;
