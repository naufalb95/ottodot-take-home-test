import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { AppError } from './lib/errors';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import classRoutes from './routes/classes';
import bookingRoutes from './routes/bookings';
import studentRoutes from './routes/students';
import webhookRoutes from './routes/webhooks';
import adminRoutes from './routes/admin';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(helmet);
  await app.register(cookie, {
    secret: process.env.AUTH_SECRET ?? 'dev-auth-secret-replace-me',
  });

  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        ...(error.code && { code: error.code }),
      });
    }

    if (error.name === 'ZodError' && 'issues' in error) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: (error as unknown as { issues: unknown[] }).issues,
      });
    }

    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(classRoutes, { prefix: '/api/classes' });
  await app.register(bookingRoutes, { prefix: '/api/bookings' });
  await app.register(studentRoutes, { prefix: '/api/students' });
  await app.register(webhookRoutes, { prefix: '/api/webhooks' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}
