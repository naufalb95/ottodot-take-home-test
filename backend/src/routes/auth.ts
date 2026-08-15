import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../lib/db';
import { setSession, getSession, clearSession } from '../lib/auth';
import { registerSchema, loginSchema } from '../validation/schemas';
import { AppError } from '../lib/errors';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const data = registerSchema.parse(request.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    
    if (existing) {
      throw AppError.conflict('Registration failed');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone ?? null,
        role: 'PARENT',
      },
    });

    setSession(reply, { userId: user.id, role: user.role });
    return reply.status(201).send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  });

  app.post('/login', async (request, reply) => {
    const data = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      throw AppError.unauthorized('Invalid credentials');
    }

    setSession(reply, { userId: user.id, role: user.role });
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });

  app.post('/logout', async (_request, reply) => {
    clearSession(reply);
    return reply.status(204).send();
  });

  app.get('/me', async (request) => {
    const session = getSession(request);
    if (!session) throw AppError.unauthorized('Not authenticated');

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw AppError.unauthorized('User not found');
    return user;
  });
};

export default authRoutes;
