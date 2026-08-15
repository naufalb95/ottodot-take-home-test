import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db.js';
import { requireSession } from '../lib/auth.js';
import { requireRole, requireStudentOwnership } from '../lib/authz.js';
import { createStudent, updateStudent } from '../services/student.js';
import {
  createStudentSchema,
  updateStudentSchema,
} from '../validation/schemas.js';

const studentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');

    return prisma.student.findMany({
      where: { parentId: session.userId },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/', async (request, reply) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');

    const data = createStudentSchema.parse(request.body);

    const student = await prisma.$transaction((tx) =>
      createStudent(tx, session.userId, data),
    );

    return reply.status(201).send(student);
  });

  app.patch('/:id', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'PARENT');
    const { id } = request.params as { id: string };

    const data = updateStudentSchema.parse(request.body);

    return prisma.$transaction(async (tx) => {
      await requireStudentOwnership(tx, session, id);
      return updateStudent(tx, id, data);
    });
  });
};

export default studentRoutes;
