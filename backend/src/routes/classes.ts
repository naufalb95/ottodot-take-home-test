import type { FastifyPluginAsync } from 'fastify';
import prisma from '../lib/db';
import { requireSession } from '../lib/auth';
import { requireRole, requireClassOwnership } from '../lib/authz';
import { createClass, cancelClass } from '../services/class';
import { createClassSchema, updateClassSchema } from '../validation/schemas';
import { AppError } from '../lib/errors';

const classRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const classes = await prisma.trialClass.findMany({
      where: { status: 'SCHEDULED', startsAt: { gt: new Date() } },
      include: {
        teacher: { select: { name: true } },
        _count: { select: { seats: { where: { bookingId: null } } } },
      },
      orderBy: { startsAt: 'asc' },
    });

    return classes.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      priceCents: c.priceCents,
      currency: c.currency,
      location: c.location,
      ageMin: c.ageMin,
      ageMax: c.ageMax,
      teacher: c.teacher.name,
      seatsRemaining: c._count.seats,
    }));
  });

  app.get('/:slug', async (request) => {
    const { slug } = request.params as { slug: string };

    const cls = await prisma.trialClass.findUnique({
      where: { slug },
      include: {
        teacher: { select: { name: true } },
        seats: { select: { bookingId: true } },
      },
    });

    if (!cls) throw AppError.notFound('Class not found');

    const { seats, ...rest } = cls;
    return {
      ...rest,
      teacher: cls.teacher.name,
      seatsRemaining: seats.filter((s) => s.bookingId === null).length,
    };
  });

  app.post('/', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'TEACHER', 'ADMIN');

    const data = createClassSchema.parse(request.body);

    return prisma.$transaction((tx) => createClass(tx, session.userId, data));
  });

  app.patch('/:id', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'TEACHER', 'ADMIN');
    const { id } = request.params as { id: string };

    const data = updateClassSchema.parse(request.body);

    return prisma.$transaction(async (tx) => {
      await requireClassOwnership(tx, session, id);

      return tx.trialClass.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.startsAt !== undefined && {
            startsAt: new Date(data.startsAt),
          }),
          ...(data.endsAt !== undefined && { endsAt: new Date(data.endsAt) }),
          ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
          ...(data.location !== undefined && { location: data.location }),
          ...(data.ageMin !== undefined && { ageMin: data.ageMin }),
          ...(data.ageMax !== undefined && { ageMax: data.ageMax }),
        },
      });
    });
  });

  app.delete('/:id', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'TEACHER', 'ADMIN');
    const { id } = request.params as { id: string };

    return prisma.$transaction(async (tx) => {
      await requireClassOwnership(tx, session, id);
      return cancelClass(tx, id);
    });
  });

  app.get('/:id/roster', async (request) => {
    const session = requireSession(request);
    requireRole(session, 'TEACHER', 'ADMIN');
    const { id } = request.params as { id: string };

    await prisma.$transaction((tx) =>
      requireClassOwnership(tx, session, id),
    );

    const bookings = await prisma.booking.findMany({
      where: { trialClassId: id, status: 'CONFIRMED' },
      include: {
        student: {
          select: {
            name: true,
            parent: { select: { name: true } },
          },
        },
      },
    });

    return bookings.map((b) => ({
      bookingId: b.id,
      studentName: b.student.name,
      parentName: b.student.parent.name,
    }));
  });
};

export default classRoutes;
