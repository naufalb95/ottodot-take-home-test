import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
};

export default healthRoutes;
