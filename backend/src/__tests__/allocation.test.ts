import { describe, it, expect, beforeEach } from 'vitest';
import {
  prisma,
  truncateAll,
  createUser,
  createStudent,
  createClassWithSeats,
} from './helpers/db.js';
import { claimSeat, releaseSeat } from '../services/allocation.js';

describe('seat allocation', () => {
  beforeEach(truncateAll);

  it('claims a free seat and returns its id', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);

    const booking = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: student.id },
    });

    const seatId = await prisma.$transaction((tx) =>
      claimSeat(tx, cls.id, booking.id),
    );

    expect(seatId).toBeTruthy();

    const seat = await prisma.seat.findUnique({ where: { id: seatId! } });
    expect(seat?.bookingId).toBe(booking.id);
  });

  it('returns null when all seats are occupied', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 2);

    const parents = await Promise.all([
      createUser('PARENT'),
      createUser('PARENT'),
      createUser('PARENT'),
    ]);
    const students = await Promise.all(
      parents.map((p) => createStudent(p.id)),
    );

    const b1 = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: students[0]!.id },
    });
    const b2 = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: students[1]!.id },
    });
    const b3 = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: students[2]!.id },
    });

    await prisma.$transaction(async (tx) => {
      await claimSeat(tx, cls.id, b1.id);
      await claimSeat(tx, cls.id, b2.id);
    });

    const seatId = await prisma.$transaction((tx) =>
      claimSeat(tx, cls.id, b3.id),
    );

    expect(seatId).toBeNull();
  });

  it('releasing a seat makes it claimable again', async () => {
    const teacher = await createUser('TEACHER');
    const cls = await createClassWithSeats(teacher.id, 1);

    const parent1 = await createUser('PARENT');
    const parent2 = await createUser('PARENT');
    const student1 = await createStudent(parent1.id);
    const student2 = await createStudent(parent2.id);

    const b1 = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: student1.id },
    });
    const b2 = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: student2.id },
    });

    await prisma.$transaction((tx) => claimSeat(tx, cls.id, b1.id));

    const beforeRelease = await prisma.$transaction((tx) =>
      claimSeat(tx, cls.id, b2.id),
    );
    expect(beforeRelease).toBeNull();

    await prisma.$transaction((tx) => releaseSeat(tx, b1.id));

    const afterRelease = await prisma.$transaction((tx) =>
      claimSeat(tx, cls.id, b2.id),
    );
    expect(afterRelease).toBeTruthy();
  });

  it('unique constraint prevents one booking from holding two seats', async () => {
    const teacher = await createUser('TEACHER');
    const parent = await createUser('PARENT');
    const student = await createStudent(parent.id);
    const cls = await createClassWithSeats(teacher.id);

    const booking = await prisma.booking.create({
      data: { trialClassId: cls.id, studentId: student.id },
    });

    await prisma.$transaction((tx) => claimSeat(tx, cls.id, booking.id));

    await expect(
      prisma.$transaction((tx) => claimSeat(tx, cls.id, booking.id)),
    ).rejects.toThrow();
  });
});
